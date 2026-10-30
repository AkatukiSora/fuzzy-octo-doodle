
import assert from "node:assert/strict";
import { test } from "node:test";

import { CreateTaskUseCase } from "./application/usecases/tasks/create-task.usecase.ts";
import type { CreateTaskInput } from "./application/ports/usecases/create-task.port.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { Clock } from "./application/ports/clock.port.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { PaymentGateway } from "./application/ports/payment-gateway.port.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { IdempotencyRepository } from "./application/ports/idempotency.repository.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";

import type { ActiveTask } from "./domain/task/task.ts";
import { parseUserId } from "./domain/shared/id-parsers.ts";
import { parseIdempotencyKey } from "./domain/shared/idempotency.ts";

const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const taskId = "11111111-1111-4111-8111-111111111112";

// テスト用のトランザクション
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

// 初回リクエストとして扱う
const idempotency: IdempotencyRepository = {
  reserve: () => Promise.resolve(null),
  complete: () => Promise.resolve(),
};

// イベント発行をテスト用に置き換える
class FakeTaskEventPublisher extends TaskEventPublisher {
  override async publish(): Promise<void> {
    // 今回は投稿保存を行わない
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

test("CreateTask は新しいタスクを1件作成する", async () => {
  savedTasks.length = 0;

  const result = await useCase.execute(input);

  assert.equal(savedTasks.length, 1);
  assert.equal(savedTasks[0]?.id, taskId);
  assert.equal(savedTasks[0]?.status, "active");
  assert.equal(savedTasks[0]?.title, "勉強する");

  assert.equal(result.id, taskId);
  assert.equal(result.status, "active");
  assert.equal(result.viewer, "owner");
  assert.equal(result.penaltyAmount, 100);
});
