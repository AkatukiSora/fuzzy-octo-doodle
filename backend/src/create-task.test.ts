
import assert from "node:assert/strict";
import { test } from "node:test";

import { CreateTaskUseCase } from "./application/usecases/tasks/create-task.usecase.ts";
import type { CreateTaskInput } from "./application/ports/usecases/create-task.port.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { Clock } from "./application/ports/clock.port.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { PaymentGateway } from "./application/ports/payment-gateway.port.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type {
  IdempotencyRecord,
  IdempotencyRepository,
} from "./application/ports/idempotency.repository.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";

import { DomainError } from "./domain/shared/errors.ts";
import { parseUserId } from "./domain/shared/id-parsers.ts";
import { parseIdempotencyKey } from "./domain/shared/idempotency.ts";
import type {
  IdempotentOperation,
  IdempotencyKey,
  RequestHash,
} from "./domain/shared/idempotency.ts";
import type { ResponsePayloads } from "./domain/shared/response-payloads.ts";
import type { UserId } from "./domain/shared/ids.ts";
import type { ActiveTask } from "./domain/task/task.ts";

const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const taskId = "11111111-1111-4111-8111-111111111112";

// Tx は infrastructure だけが生成できる不透明な型。
// このテストでは中身を使用しないため、既存の get-me.test.ts と同じ方式を使う。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

const uow: UnitOfWork = {
  run: (fn) => fn(tx),
};

// 時刻を固定する
const clock: Clock = {
  now: () => new Date("2026-10-30T12:00:00.000Z"),
};

// IDを固定する
const ids: IdGenerator = {
  uuid: () => taskId,
  inviteToken: () => "test-invite-token",
};

// 決済確認は必ず成功させる
const payment: PaymentGateway = {
  assertCanCreateTask: () => Promise.resolve(),
  requestCharge: () => Promise.resolve(),
};

// 保存されたタスクを記録する
const savedTasks: ActiveTask[] = [];
const storedRequestHashes: Partial<Record<IdempotentOperation, RequestHash>> = {};
const replayResponses: Partial<ResponsePayloads> = {};

const tasks: TaskRepository = {
  insert: (_tx, task) => {
    savedTasks.push(task);
    return Promise.resolve();
  },

  countActiveInitial: () => Promise.resolve(0),
  lockUserForCreation: () => Promise.resolve(),

  // 今回のテストで使わないメソッド
  findById: () => Promise.reject(new Error("使わない")),
  findByIds: () => Promise.reject(new Error("使わない")),
  findByIdForUpdate: () => Promise.reject(new Error("使わない")),
  save: () => Promise.reject(new Error("使わない")),
  listByOwner: () => Promise.reject(new Error("使わない")),
  lockExpiredInitial: () => Promise.reject(new Error("使わない")),
  lockReviewEnded: () => Promise.reject(new Error("使わない")),
  lockExpiredAdditional: () => Promise.reject(new Error("使わない")),
};

// 冪等性の予約と再送をテスト用に模擬する
const idempotency: IdempotencyRepository = {
  reserve<O extends IdempotentOperation>(
    _tx: Tx,
    _user: UserId,
    operation: O,
    _key: IdempotencyKey,
    requestHash: RequestHash,
    _now: Date,
  ): Promise<IdempotencyRecord<O> | null> {
    const storedRequestHash = storedRequestHashes[operation];
    if (storedRequestHash === undefined) {
      storedRequestHashes[operation] = requestHash;
      return Promise.resolve(null);
    }

    const responseBody = replayResponses[operation] ?? null;
    return Promise.resolve({
      requestHash: storedRequestHash,
      responseStatus: responseBody === null ? null : 201,
      responseBody,
    });
  },
  complete: () => Promise.resolve(),
};

// イベント発行をテスト用に置き換える
class FakeTaskEventPublisher extends TaskEventPublisher {
  override publish(): Promise<void> {
    // 今回は投稿保存を行わない
    return Promise.resolve();
  }
}

const events = new FakeTaskEventPublisher(
  {
    insertIfAbsent: () => Promise.resolve(),
    findById: () => Promise.resolve(null),
    listFeed: () => Promise.reject(new Error("使わない")),
    findFeedItem: () => Promise.resolve(null),
    hasPost: () => Promise.resolve(false),
  },
  ids,
  clock,
);

// タスク作成UseCaseを組み立てる
const useCase = new CreateTaskUseCase(
  uow,
  clock,
  ids,
  idempotency,
  tasks,
  payment,
  events,
);

const input: CreateTaskInput = {
  userId,
  idempotencyKey: parseIdempotencyKey(
    "22222222-2222-4222-8222-222222222222",
  ),
  title: "勉強する",
  achievementCondition: "問題集を10ページ解く",
  evidenceMethod: "解いたページの写真を提出",
  deadlineAt: new Date("2026-10-31T12:00:00.000Z"),
  penaltyAmount: 100,
  isPenaltyPublic: false,
  originalTaskId: null,
};

function resetState(): void {
  savedTasks.length = 0;
  delete storedRequestHashes.create_task;
  delete replayResponses.create_task;
}

test("CreateTask は新しいタスクを1件作成する", async () => {
  resetState();

  const result = await useCase.execute(input);

  assert.equal(savedTasks.length, 1);

  const savedTask = savedTasks[0];
  assert.ok(savedTask, "タスクが保存されていること");

  assert.equal(savedTask.id, taskId);
  assert.equal(savedTask.status, "active");
  assert.equal(savedTask.title, "勉強する");

  assert.equal(result.id, taskId);
  assert.equal(result.status, "active");
  assert.equal(result.viewer, "owner");
  assert.equal(result.penaltyAmount, 100);
});

test("同じキーと内容の再送は保存済み結果を返して再作成しない", async () => {
  resetState();

  const first = await useCase.execute(input);
  replayResponses.create_task = first;
  const replay = await useCase.execute(input);

  assert.deepEqual(replay, first);
  assert.equal(savedTasks.length, 1);
});

test("同じキーで締切・金額・公開設定が異なる再送を拒否する", async () => {
  resetState();

  await useCase.execute(input);

  const isKeyReused = (error: unknown): boolean =>
    error instanceof DomainError && error.code === "IDEMPOTENCY_KEY_REUSED";

  await assert.rejects(
    useCase.execute({ ...input, deadlineAt: new Date("2026-11-01T12:00:00.000Z") }),
    isKeyReused,
  );
  await assert.rejects(
    useCase.execute({ ...input, penaltyAmount: 200 }),
    isKeyReused,
  );
  await assert.rejects(
    useCase.execute({ ...input, isPenaltyPublic: true }),
    isKeyReused,
  );
  assert.equal(savedTasks.length, 1);
});
