import type { ObjectionSummary } from "../../../domain/objection/objection-view.ts";
import { Inject, Injectable } from "@nestjs/common";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { IDEMPOTENCY_REPOSITORY } from "../../../application/ports/idempotency.repository.ts";
import type { IdempotencyRepository } from "../../../application/ports/idempotency.repository.ts";
import { TASK_REPOSITORY } from "../../../application/ports/task.repository.ts";
import type { TaskRepository } from "../../../application/ports/task.repository.ts";
import { OBJECTION_REPOSITORY } from "../../../application/ports/objection.repository.ts";
import type { ObjectionRepository } from "../../../application/ports/objection.repository.ts";
import { TaskEventPublisher } from "../../../application/shared/task-event-publisher.ts";
import { hashRequest } from "../../../application/shared/request-hash.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { expectOpenFirst, withdrawObjection } from "../../../domain/objection/objection.ts";
import { expectStatus, withdrawFirstObjection } from "../../../domain/task/task.ts";
import type { WithdrawObjectionInput } from "../../ports/usecases/withdraw-objection.port.ts";

/**
 * 責務: 申立人本人による初回異議の取り下げを受け付け、対象タスクを達成へ遷移させる。再審査の異議や別人の異議は取り下げない。
 *
 * 全体の流れ:
 *   POST /api/objections/:objectionId/withdraw
 *     → 全体の Origin・セッションガード → ObjectionsController.withdraw（入力検証）
 *     → この execute → ObjectionRepository.findById → TaskRepository.findByIdForUpdate
 *     → domain の expectOpenFirst / withdrawObjection / withdrawFirstObjection → 保存と TaskEventPublisher.publish。
 *
 * 処理:
 *   1. UnitOfWork.run 内で clock.now と parseIdempotencyKey を用意し、hashRequest("withdraw_objection", { objectionId }) で RequestHash を作り（作ってよいのは hashRequest だけ）、IdempotencyRepository.reserve に withdraw_objection とその RequestHash を渡す。
 *   2. 予約済みキーの hash 不一致は IDEMPOTENCY_KEY_REUSED、完了済み記録は保存済みレスポンスで返し、新規要求だけを続ける。
 *   3. ObjectionRepository.findById で objectionId を取得する。見つからなければ NOT_FOUND とする。
 *   4. TaskRepository.findByIdForUpdate で異議の taskId をロック付き取得し、見つからなければ NOT_FOUND とする。取り下げと追加証拠提出などの競合を防ぐ。
 *   5. expectOpenFirst で初回かつ未取り下げの異議に絞り、expectStatus(task, "disputed") でタスク状態を絞る。条件が違えば STATE_CONFLICT とする。
 *   6. withdrawObjection で申立人本人かを検証して取り下げ状態を作り、withdrawFirstObjection で追加証拠待ちのタスクを達成へ遷移させる。期限切れなら DEADLINE_EXPIRED とする。
 *   7. ObjectionRepository.save と TaskRepository.save で両方の状態を保存し、TaskEventPublisher.publish に遷移イベントを渡す。最後に冪等性レスポンスを complete してコミットする。
 *
 * 失敗:
 *   - DomainError("NOT_FOUND"): 異議または関連タスクが見つからない。
 *   - DomainError("FORBIDDEN"): 異議の申立人本人ではない。
 *   - DomainError("VALIDATION_ERROR"): Idempotency-Key が UUID ではない。
 *   - DomainError("IDEMPOTENCY_KEY_REUSED"): 同じキーを異なる要求内容で再利用した。
 *   - DomainError("STATE_CONFLICT"): 初回・未取り下げの異議でない、またはタスクが追加証拠待ちではない。
 *   - DomainError("DEADLINE_EXPIRED"): 追加証拠の期限を過ぎている。
 *
 * 注意:
 *   - TaskRepository.findByIdForUpdate を domain の状態遷移より先に呼び、同じ task の並行更新を直列化する。
 *   - withdrawFirstObjection は初回異議だけを扱う。再審査（round 2）の異議は型と expectOpenFirst の両方で対象外になる。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class WithdrawObjectionUseCase {
  /** 異議の取り下げ、タスク遷移、冪等性記録、イベント保存を同じトランザクションにまとめる。 */
  protected readonly uow: UnitOfWork;
  /** 取り下げ日時と追加証拠期限の判定に使う現在時刻を提供する。 */
  protected readonly clock: Clock;
  /** withdraw_objection の要求を予約し、成功レスポンスを再送に対して再利用する。 */
  protected readonly idempotency: IdempotencyRepository;
  /** 対象タスクを行ロック付きで取得し、達成状態への遷移を保存する。 */
  protected readonly tasks: TaskRepository;
  /** 対象異議を取得し、取り下げ状態を保存する。 */
  protected readonly objections: ObjectionRepository;
  /** タスク遷移の投稿を同じトランザクション内で保存する（通知は今は作らない）。 */
  protected readonly events: TaskEventPublisher;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(IDEMPOTENCY_REPOSITORY) idempotency: IdempotencyRepository,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(OBJECTION_REPOSITORY) objections: ObjectionRepository,
    @Inject(TaskEventPublisher) events: TaskEventPublisher,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.idempotency = idempotency;
    this.tasks = tasks;
    this.objections = objections;
    this.events = events;
  }

  /**
   * 申立人本人による初回異議の取り下げを受け付け、対象タスクを達成へ遷移させる。再審査の異議や別人の異議は取り下げない。
   */
  execute(input: WithdrawObjectionInput): Promise<ObjectionSummary> {
    return this.uow.run(async (tx) => {
      const now = this.clock.now();
      const key = parseIdempotencyKey(input.idempotencyKey);
      const requestHash = hashRequest("withdraw_objection", { objectionId: input.objectionId });
      const record = await this.idempotency.reserve(
        tx,
        input.userId,
        "withdraw_objection",
        key,
        requestHash,
        now,
      );
      if (record !== null) {
        if (record.requestHash !== requestHash) {
          throw new DomainError("IDEMPOTENCY_KEY_REUSED", "同じキーが別の内容で使われています");
        }
        if (record.responseBody !== null) return record.responseBody;
      }

      const objection = await this.objections.findById(tx, input.objectionId);
      if (objection === null) throw new DomainError("NOT_FOUND", "異議が見つかりません");
      const task = await this.tasks.findByIdForUpdate(tx, objection.taskId);
      if (task === null) throw new DomainError("NOT_FOUND", "対象のタスクが見つかりません");

      const openFirst = expectOpenFirst(objection);
      const disputed = expectStatus(task, "disputed", "タスクが追加証拠待ちではありません");
      const withdrawn = withdrawObjection(openFirst, input.userId, now);
      const transition = withdrawFirstObjection(disputed, openFirst, now);

      await this.objections.save(tx, withdrawn);
      await this.tasks.save(tx, transition.next);
      await this.events.publish(tx, transition.events);

      const response: ObjectionSummary = {
        id: withdrawn.id,
        taskId: withdrawn.taskId,
        round: withdrawn.reviewRound,
        reasonType: withdrawn.reasonType,
        reasonDetail: withdrawn.reasonDetail,
        withdrawn: true,
        createdAt: withdrawn.createdAt,
      };
      await this.idempotency.complete(tx, input.userId, "withdraw_objection", key, 200, response);
      return response;
    });
  }
}
