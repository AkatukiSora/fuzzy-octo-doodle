import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { ID_GENERATOR } from "../../../application/ports/id-generator.port.ts";
import type { IdGenerator } from "../../../application/ports/id-generator.port.ts";
import { IDEMPOTENCY_REPOSITORY } from "../../../application/ports/idempotency.repository.ts";
import type { IdempotencyRepository } from "../../../application/ports/idempotency.repository.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { OBJECTION_REPOSITORY } from "../../../application/ports/objection.repository.ts";
import type { ObjectionRepository } from "../../../application/ports/objection.repository.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { TaskEventPublisher } from "../../../application/shared/task-event-publisher.ts";
import { hashRequest } from "../../../application/shared/request-hash.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { parseObjectionId } from "../../../domain/shared/id-parsers.ts";
import { createObjection } from "../../../domain/objection/objection.ts";
import { acceptFirstObjection, acceptSecondObjection } from "../../../domain/task/task.ts";
import { authorizeObjection, viewerRole } from "../../../domain/task/visibility-policy.ts";
import type { ObjectionSummary } from "../../../domain/objection/objection-view.ts";
import type { CreateObjectionInput } from "../../ports/usecases/create-objection.port.ts";

/**
 * 責務: 審査中のタスクに対する異議を 1 件だけ登録し、成立した異議に応じてタスクを次の状態へ進める。HTTP 入力検証や DB のロック実装は所有しない。
 *
 * 全体の流れ:
 *   POST /api/tasks/:id/objections
 *     → 全体の Origin・セッションガード → ObjectionsController.create（形式検証と ID 変換）
 *     → この execute → domain の authorizeObjection / createObjection / acceptFirstObjection・acceptSecondObjection
 *     → TaskRepository・ObjectionRepository に保存し、TaskEventPublisher.publish でイベントを保存 → ObjectionSummary を返す。
 *
 * 処理:
 *   1. UnitOfWork.run 内で clock.now を取得し、コントローラで parseIdempotencyKey 済みの Input のキーを使う。
 *   2. hashRequest("create_objection", { taskId, reasonType, reasonDetail }) で RequestHash を作り（作ってよいのは hashRequest だけ）、IdempotencyRepository.reserve に userId、create_objection、キー、その RequestHash を渡す。
 *   3. 既存記録の hash が異なる場合は IDEMPOTENCY_KEY_REUSED を返し、完了済みなら保存済みレスポンスを返す。新規要求だけを続ける。
 *   4. TaskRepository.findByIdForUpdate で taskId の行をロックして取得する。見つからなければ NOT_FOUND とする。状態変更と異議の同時処理を直列化するため、通常の findById ではなくロック付き取得を使う。
 *   5. FriendshipRepository.areFriends で所有者との関係を確認し、viewerRole と authorizeObjection でフレンドかつ審査中であることを証明する。証明がない場合は、存在を隠す相手には NOT_FOUND、それ以外は FORBIDDEN とする。
 *   6. createObjection に IdGenerator.uuid() で採番した ID、権限証明、理由を渡して初回または再審査の異議を作る。理由が空白だけなら VALIDATION_ERROR とする。
 *   7. ObjectionRepository.tryInsert を呼ぶ。事前 SELECT では先着判定をせず、UNIQUE(task_id, review_round) による false は STATE_CONFLICT とする。取り下げ済みでも枠は戻らない。
 *   8. 審査回に応じて acceptFirstObjection または acceptSecondObjection を呼び、TaskRepository.save で遷移後のタスクを保存する。審査期限切れなら DEADLINE_EXPIRED とする。
 *   9. TaskEventPublisher.publish に遷移イベントを渡し、同じ tx 内で投稿を保存する（通知は今は作らない）。最後に IdempotencyRepository.complete で 201 相当の成功レスポンスを記録してコミットする。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): タスクがない、または存在を知らせない対象である。
 *   - DomainError("FORBIDDEN"): 異議を申し立てる権限がない。
 *   - DomainError("VALIDATION_ERROR"): Idempotency-Key または異議理由が不正である。
 *   - DomainError("IDEMPOTENCY_KEY_REUSED"): 同じキーを異なる要求内容で再利用した。
 *   - DomainError("STATE_CONFLICT"): 同じ審査回の異議枠が先に使われた、または状態が操作と合わない。
 *   - DomainError("DEADLINE_EXPIRED"): タスクの審査期間が終了している。
 *
 * 注意:
 *   - ObjectionRepository.tryInsert の UNIQUE 制約が先着 1 件を保証する。先に一覧を読んで空きを判定してはならない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class CreateObjectionUseCase {
  /** 異議の登録、タスク遷移、冪等性記録、イベント保存を 1 つの DB トランザクションにまとめる。 */
  protected readonly uow: UnitOfWork;
  /** 審査期限の判定と異議の作成に使う現在時刻を提供する。 */
  protected readonly clock: Clock;
  /** 新しい異議の ID を採番する。 */
  protected readonly ids: IdGenerator;
  /** create_objection の要求を予約し、成功レスポンスを保存して再送時に再利用する。 */
  protected readonly idempotency: IdempotencyRepository;
  /** 対象タスクを行ロック付きで取得し、遷移後の状態を保存する。 */
  protected readonly tasks: TaskRepository;
  /** 異議を先着 1 件の制約付きで登録し、失敗時に競合を判定する。 */
  protected readonly objections: ObjectionRepository;
  /** 申立人とタスク所有者がフレンドかを確認する。 */
  protected readonly friendships: FriendshipRepository;
  /** タスク遷移が生んだ投稿を同じトランザクション内で保存する（通知は今は作らない）。 */
  protected readonly events: TaskEventPublisher;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(IDEMPOTENCY_REPOSITORY) idempotency: IdempotencyRepository,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(OBJECTION_REPOSITORY) objections: ObjectionRepository,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
    @Inject(TaskEventPublisher) events: TaskEventPublisher,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.ids = ids;
    this.idempotency = idempotency;
    this.tasks = tasks;
    this.objections = objections;
    this.friendships = friendships;
    this.events = events;
  }

  /**
   * 審査中のタスクに対する異議を 1 件だけ登録し、成立した異議に応じてタスクを次の状態へ進める。HTTP 入力検証や DB のロック実装は所有しない。
   */
  execute(input: CreateObjectionInput): Promise<ObjectionSummary> {
    const requestHash = hashRequest("create_objection", {
      taskId: input.taskId,
      reasonType: input.reasonType,
      reasonDetail: input.reasonDetail,
    });

    return this.uow.run(async (tx) => {
      const now = this.clock.now();
      const record = await this.idempotency.reserve(
        tx,
        input.userId,
        "create_objection",
        input.idempotencyKey,
        requestHash,
        now,
      );
      if (record !== null) {
        if (record.requestHash !== requestHash) {
          throw new DomainError("IDEMPOTENCY_KEY_REUSED", "同じキーが別の内容で使われています");
        }
        if (record.responseBody !== null) return record.responseBody;
      }

      const task = await this.tasks.findByIdForUpdate(tx, input.taskId);
      if (task === null) throw new DomainError("NOT_FOUND", "タスクが見つかりません");

      const isFriend = await this.friendships.areFriends(tx, input.userId, task.ownerId);
      const role = viewerRole(task.ownerId, input.userId, isFriend);
      const authorization = authorizeObjection(task, role, input.userId);
      if (authorization === null) {
        if (role === "owner") throw new DomainError("FORBIDDEN", "異議を申し立てる権限がありません");
        if (!isFriend && role === "none") throw new DomainError("NOT_FOUND", "タスクが見つかりません");
        if (!isFriend) throw new DomainError("FORBIDDEN", "異議を申し立てる権限がありません");
        throw new DomainError("STATE_CONFLICT", "現在の状態では異議を申し立てられません");
      }

      const objection = createObjection(
        {
          id: parseObjectionId(this.ids.uuid()),
          task: authorization.task,
          right: authorization.right,
          reasonType: input.reasonType,
          reasonDetail: input.reasonDetail,
        },
        now,
      );
      const inserted = await this.objections.tryInsert(tx, objection);
      if (!inserted) throw new DomainError("STATE_CONFLICT", "この審査回の異議はすでに登録されています");

      const transition =
        authorization.task.reviewRound === 1
          ? acceptFirstObjection(authorization.task, now)
          : acceptSecondObjection(authorization.task, now);
      await this.tasks.save(tx, transition.next);
      await this.events.publish(tx, transition.events);

      const response: ObjectionSummary = {
        id: objection.id,
        taskId: objection.taskId,
        round: objection.reviewRound,
        reasonType: objection.reasonType,
        reasonDetail: objection.reasonDetail,
        withdrawn: false,
        createdAt: objection.createdAt,
      };
      await this.idempotency.complete(tx, input.userId, "create_objection", input.idempotencyKey, 201, response);
      return response;
    });
  }
}
