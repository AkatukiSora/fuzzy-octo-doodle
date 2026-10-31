import { hashRequest } from "../../shared/request-hash.ts";
import {
  authorizeTaskCreation,
  parseTaskDeadline,
} from "../../../domain/task/task-policy.ts";
import { z } from "zod";
import { parseUserId } from "../../../domain/shared/id-parsers.ts";
import { parseTaskId } from "../../../domain/shared/id-parsers.ts";
import { createTask } from "../../../domain/task/task.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import { toTaskView } from "../../../domain/task/task-view.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import type { OwnerTaskView } from "../../../domain/task/task-view.ts";
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
import { PAYMENT_GATEWAY } from "../../../application/ports/payment-gateway.port.ts";
import type { PaymentGateway } from "../../../application/ports/payment-gateway.port.ts";
import { TaskEventPublisher } from "../../../application/shared/task-event-publisher.ts";
import type { CreateTaskInput } from "../../ports/usecases/create-task.port.ts";

/**
 * 責務: 利用者のタスクを 1 件作成し、作成前の支払い条件・同時作成数・期限の確認と保存を調整する。HTTP 入力検証そのものは担当しない。
 *
 * 全体の流れ:
 *   POST /api/tasks
 *     → TasksController.create（認証利用者、Idempotency-Key、本文を検証して Input に詰める）
 *     → CreateTaskUseCase.execute → Clock.now / parseIdempotencyKey
 *     → UnitOfWork.run 内で IdempotencyRepository.reserve / PaymentGateway.assertCanCreateTask
 *     → TaskRepository.lockUserForCreation / countActiveInitial
 *     → domain: authorizeTaskCreation / parseTaskDeadline / createTask
 *     → TaskRepository.insert / TaskEventPublisher.publish / IdempotencyRepository.complete
 *   作成後は active となり、利用者が証拠アップロードセッションを開始する流れへ続く。
 *
 * 処理:
 *   1. Clock.now() で要求処理に使う現在時刻を得て、parseIdempotencyKey でヘッダ値を IdempotencyKey にする。
 *   2. requestHash = hashRequest("create_task", { title, achievementCondition, evidenceMethod, originalTaskId }) を作る（RequestHash を作ってよいのは hashRequest だけ）。UnitOfWork.run の中で IdempotencyRepository.reserve(tx, userId, "create_task", key, requestHash, now) を呼び、要求を予約する。
 *   3. 既存記録のハッシュが異なる場合は IDEMPOTENCY_KEY_REUSED を返し、完了済みなら保存済みレスポンスを返して作成を繰り返さない。新規要求だけ次へ進む。
 *   4. PaymentGateway.assertCanCreateTask(userId) で支払い条件を確認する。
 *   5. TaskRepository.lockUserForCreation(tx, userId) を呼び、同じ利用者の作成処理を直列化する。
 *   6. TaskRepository.countActiveInitial(tx, userId) の結果を authorizeTaskCreation に渡す。3 件以上なら作成を止める。
 *   7. parseTaskDeadline(deadlineAt, now) で期限を作成時点から 10 分〜72 時間に絞る。
 *   8. IdGenerator.uuid() の結果を parseTaskId に通して ID を名目型にし、入力と createTask に渡す。active 状態の next と TaskCreated イベントが返る。createTask はタイトル、達成条件、提出方法、金額も検証する。
 *   9. TaskRepository.insert(tx, next) で新しいタスクを保存し、TaskEventPublisher.publish(tx, events) で作成イベントに対応する投稿を保存する。
 *   10. toTaskView(next, "owner") で本人向け表示を作り、IdempotencyRepository.complete に成功ステータスとレスポンスを保存して UnitOfWork.run を完了する。
 *
 * 失敗:
 *   - DomainError("VALIDATION_ERROR"): Idempotency-Key、タイトル、必須テキスト、期限、金額、または ID の形式・範囲が不正である。
 *   - DomainError("IDEMPOTENCY_KEY_REUSED"): 同じキーが異なるリクエスト内容に使われた。
 *   - DomainError("PAYMENT_REQUIRED"): 支払い方法などの作成条件を満たしていない。
 *   - DomainError("TOO_MANY_ACTIVE_TASKS"): 初回証拠が未提出のタスクがすでに 3 件ある。
 *
 * 注意:
 *   - lockUserForCreation の後に countActiveInitial を読む。順序を逆にすると並行要求が上限を超える。
 *   - IdempotencyRepository.reserve と complete はタスク保存と同じトランザクションに置き、失敗した要求の予約や部分保存を残さない。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
const savedTaskResponseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  achievementCondition: z.string(),
  evidenceMethod: z.string(),
  deadlineAt: z.iso.datetime(),
  status: z.enum([
    "active",
    "reviewing",
    "disputed",
    "success",
    "failed",
    "indeterminate",
    "closed",
  ]),
  isPenaltyPublic: z.boolean(),
  createdAt: z.iso.datetime(),
  viewer: z.literal("owner"),
  penaltyAmount: z.number(),
});
function restoreSavedTaskResponse(body: unknown): OwnerTaskView {
  const result = savedTaskResponseSchema.safeParse(body);

  if (!result.success) {
    throw new DomainError(
      "STATE_CONFLICT",
      "保存済みのタスク作成レスポンスが不正です",
    );
  }

  const data = result.data;

  return {
    id: parseTaskId(data.id),
    ownerId: parseUserId(data.ownerId),
    title: data.title,
    achievementCondition: data.achievementCondition,
    evidenceMethod: data.evidenceMethod,
    deadlineAt: new Date(data.deadlineAt),
    status: data.status,
    isPenaltyPublic: data.isPenaltyPublic,
    createdAt: new Date(data.createdAt),
    viewer: data.viewer,
    penaltyAmount: data.penaltyAmount,
  };
}
@Injectable()
export class CreateTaskUseCase {
  /** 冪等性予約、タスク作成、投稿保存をまとめて確定またはロールバックするトランザクション境界である。 */
  protected readonly uow: UnitOfWork;
  /** 期限の範囲確認と作成日時に使う現在時刻を提供する。 */
  protected readonly clock: Clock;
  /** 新しいタスクの ID を UUID で採番する。 */
  protected readonly ids: IdGenerator;
  /** create_task の要求を予約し、成功レスポンスを保存して再送時に再利用する。 */
  protected readonly idempotency: IdempotencyRepository;
  /** 利用者単位の作成ロック、初回未提出件数の取得、新しいタスクの保存を担う。 */
  protected readonly tasks: TaskRepository;
  /** タスク作成前に利用者の支払い条件を確認する。 */
  protected readonly payment: PaymentGateway;
  /** createTask が返した TaskEvent を作成投稿などに変換して保存する。 */
  protected readonly events: TaskEventPublisher;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
    @Inject(IDEMPOTENCY_REPOSITORY) idempotency: IdempotencyRepository,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(PAYMENT_GATEWAY) payment: PaymentGateway,
    @Inject(TaskEventPublisher) events: TaskEventPublisher,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.ids = ids;
    this.idempotency = idempotency;
    this.tasks = tasks;
    this.payment = payment;
    this.events = events;
  }

  /**
   * 利用者のタスクを 1 件作成し、作成前の支払い条件・同時作成数・期限の確認と保存を調整する。HTTP 入力検証そのものは担当しない。
   * 本体は未実装（todo）。上の「処理」の順に実装する。
   */
execute(input: CreateTaskInput): Promise<OwnerTaskView> {
  const now = this.clock.now();
  const key = parseIdempotencyKey(input.idempotencyKey);

  const requestHash = hashRequest("create_task", {
    title: input.title,
    achievementCondition: input.achievementCondition,
    evidenceMethod: input.evidenceMethod,
    originalTaskId: input.originalTaskId,
  });

return this.uow.run(async (tx) => {
  const existing = await this.idempotency.reserve(
    tx,
    input.userId,
    "create_task",
    key,
    requestHash,
    now,
  );
 if (existing !== null) {
  if (existing.requestHash !== requestHash) {
    throw new DomainError(
      "IDEMPOTENCY_KEY_REUSED",
      "同じIdempotency-Keyが異なるリクエスト内容に使用されています",
    );
  }

  if (existing.responseStatus === 201) {
    return restoreSavedTaskResponse(existing.responseBody);
  }

  throw new DomainError(
    "STATE_CONFLICT",
    "このリクエストは処理中、または正常に完了していません",
  );
}
  await this.payment.assertCanCreateTask(input.userId);
  await this.tasks.lockUserForCreation(tx, input.userId);
  const activeCount = await this.tasks.countActiveInitial(
  tx,
  input.userId,
);
const permit = authorizeTaskCreation(activeCount);
const deadline = parseTaskDeadline(input.deadlineAt, now);
const taskId = parseTaskId(this.ids.uuid());
const { next, events } = createTask(
  {
    id: taskId,
    ownerId: input.userId,
    originalTaskId: input.originalTaskId,
    title: input.title,
    achievementCondition: input.achievementCondition,
    evidenceMethod: input.evidenceMethod,
    deadlineAt: deadline,
    penaltyAmount: input.penaltyAmount,
    isPenaltyPublic: input.isPenaltyPublic,
    permit,
  },
  now,
);
await this.tasks.insert(tx, next);
await this.events.publish(tx, events);
const response = toTaskView(next, "owner");
await this.idempotency.complete(
  tx,
  input.userId,
  "create_task",
  key,
  201,
  response,
);
 return response;
});
}
}
