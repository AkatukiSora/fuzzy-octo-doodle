
import assert from "node:assert/strict";
import { test } from "node:test";

import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type {
  TaskRepository,
  Page,
} from "./application/ports/task.repository.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";

import type {
  Friendship,
  BlockedFriendship,
  PendingFriendship,
} from "./domain/friendship/friendship.ts";
import type {
  Task,
  ActiveTask,
  ReviewingTask,
  DisputedTask,
} from "./domain/task/task.ts";
import type { UserId } from "./domain/shared/ids.ts";

import { GetTaskUseCase } from "./application/usecases/tasks/get-task.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import { createTask } from "./domain/task/task.ts";
import { authorizeTaskCreation, parseTaskDeadline } from "./domain/task/task-policy.ts";

const taskId = parseTaskId("22222222-2222-4222-8222-222222222222");
const ownerId = parseUserId("11111111-1111-4111-8111-111111111111");
const friendId = parseUserId("33333333-3333-4333-8333-333333333333");
const strangerId = parseUserId("44444444-4444-4444-8444-444444444444");

const now = new Date("2026-10-31T00:00:00Z");

// Tx はテストで中身を使わないため、型を満たす値だけ用意する。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

const uow: UnitOfWork = {
  run: (fn) => fn(tx),
};

function makeTask(isPenaltyPublic = false): ActiveTask {
  return createTask(
    {
      id: taskId,
      ownerId,
      originalTaskId: null,
      title: "テストタスク",
      achievementCondition: "課題を完成させる",
      evidenceMethod: "完成した画面の写真",
      deadlineAt: parseTaskDeadline(
        new Date(now.getTime() + 60 * 60 * 1000),
        now,
      ),
      penaltyAmount: 500,
      isPenaltyPublic,
      permit: authorizeTaskCreation(0),
    },
    now,
  ).next;
}

class FakeTasks implements TaskRepository {
  constructor(private readonly task: Task | null) {}

  findById(): Promise<Task | null> {
    return Promise.resolve(this.task);
  }

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

  listByOwner(): Promise<Page<Task>> {
    return Promise.reject(new Error("使わない"));
  }

  lockExpiredInitial(): Promise<ActiveTask[]> {
    return Promise.reject(new Error("使わない"));
  }

  lockReviewEnded(): Promise<ReviewingTask[]> {
    return Promise.reject(new Error("使わない"));
  }

  lockExpiredAdditional(): Promise<DisputedTask[]> {
    return Promise.reject(new Error("使わない"));
  }
}

class FakeFriendships implements FriendshipRepository {
  constructor(private readonly isFriend: boolean) {}

  areFriends(): Promise<boolean> {
    return Promise.resolve(this.isFriend);
  }

  findById(): Promise<Friendship | null> {
    return Promise.reject(new Error("使わない"));
  }

  findByPair(): Promise<Friendship | null> {
    return Promise.reject(new Error("使わない"));
  }

  save(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  countFriends(): Promise<number> {
    return Promise.reject(new Error("使わない"));
  }

  listFriendIds(): Promise<UserId[]> {
    return Promise.reject(new Error("使わない"));
  }

  listIncomingPending(): Promise<PendingFriendship[]> {
    return Promise.reject(new Error("使わない"));
  }

  listOutgoingPending(): Promise<PendingFriendship[]> {
    return Promise.reject(new Error("使わない"));
  }

  listBlockedBy(): Promise<BlockedFriendship[]> {
    return Promise.reject(new Error("使わない"));
  }
}

function setup(task: Task | null, isFriend: boolean): GetTaskUseCase {
  return new GetTaskUseCase(
    uow,
    new FakeTasks(task),
    new FakeFriendships(isFriend),
  );
}

test("GetTask は、所有者本人にペナルティ金額を含むTaskViewを返す", async () => {
  const task = makeTask();
  const result = await setup(task, false).execute({
    taskId,
    viewerId: ownerId,
  });

  assert.equal(result.viewer, "owner");
  assert.equal(result.penaltyAmount, 500);
  assert.equal(result.id, taskId);
});

test("GetTask は、フレンドに非公開ペナルティ金額を含まないTaskViewを返す", async () => {
  const task = makeTask(false);
  const result = await setup(task, true).execute({
    taskId,
    viewerId: friendId,
  });

  assert.equal(result.viewer, "friend");
  assert.equal("penaltyAmount" in result, false);
});

test("GetTask は、フレンドに公開ペナルティ金額を含むTaskViewを返す", async () => {
  const task = makeTask(true);
  const result = await setup(task, true).execute({
    taskId,
    viewerId: friendId,
  });

  assert.equal(result.viewer, "friend");

  if (result.isPenaltyPublic) {
    assert.equal(result.penaltyAmount, 500);
  }
});

test("GetTask は、無関係の利用者にはNOT_FOUNDを返す", async () => {
  const task = makeTask();

  await assert.rejects(
    setup(task, false).execute({
      taskId,
      viewerId: strangerId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "NOT_FOUND");
      return true;
    },
  );
});

test("GetTask は、存在しないタスクにはNOT_FOUNDを返す", async () => {
  await assert.rejects(
    setup(null, false).execute({
      taskId,
      viewerId: ownerId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "NOT_FOUND");
      return true;
    },
  );
});
