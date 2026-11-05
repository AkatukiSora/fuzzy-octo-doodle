
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import { GetRetryTemplateUseCase } from "./application/usecases/tasks/get-retry-template.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { Task } from "./domain/task/task.ts";
import {
  parseTaskTitle,
  parseNonEmptyText,
  parsePenaltyAmount,
} from "./domain/task/task-values.ts";

const taskId = parseTaskId("11111111-1111-4111-8111-111111111111");
const ownerId = parseUserId("22222222-2222-4222-8222-222222222222");
const otherUserId = parseUserId("33333333-3333-4333-8333-333333333333");

const now = new Date("2026-10-31T00:00:00.000Z");

const task: Task = {
  id: taskId,
  ownerId,
  originalTaskId: null,
  title: parseTaskTitle("勉強する"),
  achievementCondition: parseNonEmptyText("2時間勉強する", "達成条件"),
  evidenceMethod: parseNonEmptyText("写真を撮る", "証拠提出方法"),
  deadlineAt: new Date("2026-11-01T00:00:00.000Z"),
  penaltyAmount: parsePenaltyAmount(100),
  isPenaltyPublic: false,
  createdAt: now,
  updatedAt: now,
  status: "active",
  reviewRound: 0,
};

// Txは不透明な型。既存のget-me.test.tsと同じ方法でテスト用の値を作る。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

const uow: UnitOfWork = {
  run: (fn) => fn(tx),
};

class FakeTasks implements TaskRepository {
  constructor(
    private readonly finder: TaskRepository["findById"],
  ) {}

  findById: TaskRepository["findById"] = (tx, id) =>
    this.finder(tx, id);

  insert(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  findByIds(): Promise<Task[]> {
    return Promise.reject(new Error("使わない"));
  }

  findByIdForUpdate(): Promise<Task | null> {
    return Promise.reject(new Error("使わない"));
  }

  save(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  countActiveInitial(): Promise<number> {
    return Promise.reject(new Error("使わない"));
  }

  lockUserForCreation(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  listByOwner(): never {
    throw new Error("使わない");
  }

  lockExpiredInitial(): never {
    throw new Error("使わない");
  }

  lockReviewEnded(): never {
    throw new Error("使わない");
  }

  lockExpiredAdditional(): never {
    throw new Error("使わない");
  }
}

function createUseCase(
  finder: TaskRepository["findById"],
): GetRetryTemplateUseCase {
  return new GetRetryTemplateUseCase(uow, new FakeTasks(finder));
}

test("所有者は再挑戦テンプレートを取得できる", async () => {
  const useCase = createUseCase(() => Promise.resolve(task));

  const result = await useCase.execute({
    userId: ownerId,
    taskId,
  });

  assert.deepEqual(result, {
    title: task.title,
    achievementCondition: task.achievementCondition,
    evidenceMethod: task.evidenceMethod,
    penaltyAmount: task.penaltyAmount,
    isPenaltyPublic: task.isPenaltyPublic,
    originalTaskId: task.id,
  });
});

test("存在しないタスクはNOT_FOUND", async () => {
  const useCase = createUseCase(() => Promise.resolve(null));

  await assert.rejects(
    useCase.execute({ userId: ownerId, taskId }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "NOT_FOUND",
  );
});

test("他人のタスクはNOT_FOUND", async () => {
  const useCase = createUseCase(() => Promise.resolve(task));

  await assert.rejects(
    useCase.execute({ userId: otherUserId, taskId }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "NOT_FOUND",
  );
});

test("Repositoryのエラーが伝播する", async () => {
  const failure = new Error("DB error");
  const useCase = createUseCase(() => Promise.reject(failure));

  await assert.rejects(
    useCase.execute({ userId: ownerId, taskId }),
    (error: unknown) => error === failure,
  );
});
