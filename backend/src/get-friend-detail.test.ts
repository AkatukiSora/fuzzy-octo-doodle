import assert from "node:assert/strict";
import { test } from "node:test";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { ListMyTasksQuery, Page, TaskRepository } from "./application/ports/task.repository.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { UserRepository } from "./application/ports/user.repository.ts";
import { GetFriendDetailUseCase } from "./application/usecases/friends/get-friend-detail.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import { createTask } from "./domain/task/task.ts";
import type { Task } from "./domain/task/task.ts";
import type { UserId } from "./domain/shared/ids.ts";
import { authorizeTaskCreation, parseTaskDeadline } from "./domain/task/task-policy.ts";
import { registerUser } from "./domain/user/user.ts";
import type { Friendship } from "./domain/friendship/friendship.ts";
import type { User } from "./domain/user/user.ts";

// Tx は infrastructure だけが生成する不透明型。偽 port 間で渡すため空値を使う。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const viewerId = parseUserId("11111111-1111-4111-8111-111111111111");
const friendId = parseUserId("22222222-2222-4222-8222-222222222222");
const now = new Date("2026-10-28T00:00:00.000Z");
const events: string[] = [];

const uow: UnitOfWork = {
  run: async (fn) => {
    events.push("uow");
    return fn(tx);
  },
};

class FakeFriendships implements FriendshipRepository {
  areFriendsResult: boolean;

  constructor(areFriendsResult: boolean) {
    this.areFriendsResult = areFriendsResult;
  }

  findById(): Promise<Friendship | null> { throw new Error("unexpected call"); }
  findByPair(): Promise<Friendship | null> { throw new Error("unexpected call"); }
  save(): Promise<void> { throw new Error("unexpected call"); }
  // eslint-disable-next-line @typescript-eslint/require-await
  async areFriends(actualTx: Tx, a: UserId, b: UserId): Promise<boolean> {
    assert.equal(actualTx, tx);
    assert.equal(a, viewerId);
    assert.equal(b, friendId);
    events.push("areFriends");
    return this.areFriendsResult;
  }
  countFriends(): Promise<number> { throw new Error("unexpected call"); }
  listFriendIds(): Promise<UserId[]> { throw new Error("unexpected call"); }
  listIncomingPending(): Promise<never[]> { throw new Error("unexpected call"); }
  listOutgoingPending(): Promise<never[]> { throw new Error("unexpected call"); }
  listBlockedBy(): Promise<never[]> { throw new Error("unexpected call"); }
}

class FakeUsers implements UserRepository {
  user: User | null;
  calls = 0;

  constructor(user: User | null) {
    this.user = user;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findById(actualTx: Tx, id: UserId): Promise<User | null> {
    assert.equal(actualTx, tx);
    assert.equal(id, friendId);
    this.calls += 1;
    events.push("findById");
    return this.user;
  }
  findByIds(): Promise<User[]> { throw new Error("unexpected call"); }
  save(): Promise<void> { throw new Error("unexpected call"); }
  getStats(): never { throw new Error("unexpected call"); }
}

class FakeTasks implements TaskRepository {
  pages: Page<Task>[];
  queries: ListMyTasksQuery[] = [];

  constructor(pages: Page<Task>[]) {
    this.pages = pages;
  }

  insert(): Promise<void> { throw new Error("unexpected call"); }
  findById(): Promise<Task | null> { throw new Error("unexpected call"); }
  findByIds(): Promise<Task[]> { throw new Error("unexpected call"); }
  findByIdForUpdate(): Promise<Task | null> { throw new Error("unexpected call"); }
  save(): Promise<void> { throw new Error("unexpected call"); }
  countActiveInitial(): Promise<number> { throw new Error("unexpected call"); }
  lockUserForCreation(): Promise<void> { throw new Error("unexpected call"); }
  // eslint-disable-next-line @typescript-eslint/require-await
  async listByOwner(actualTx: Tx, query: ListMyTasksQuery): Promise<Page<Task>> {
    assert.equal(actualTx, tx);
    this.queries.push(query);
    events.push("listByOwner");
    return this.pages.shift() ?? { items: [], nextCursor: null };
  }
  lockExpiredInitial(): Promise<never[]> { throw new Error("unexpected call"); }
  lockReviewEnded(): Promise<never[]> { throw new Error("unexpected call"); }
  lockExpiredAdditional(): Promise<never[]> { throw new Error("unexpected call"); }
}

function makeTask(id: string, isPenaltyPublic: boolean, penaltyAmount: number): Task {
  return createTask({
    id: parseTaskId(id),
    ownerId: friendId,
    originalTaskId: null,
    title: `task-${id.slice(-1)}`,
    achievementCondition: "完了する",
    evidenceMethod: "写真",
    deadlineAt: parseTaskDeadline(new Date(now.getTime() + 60 * 60 * 1000), now),
    penaltyAmount,
    isPenaltyPublic,
    permit: authorizeTaskCreation(0),
  }, now).next;
}

function createUseCase(areFriends: boolean, pages: Page<Task>[], user: User | null = registerUser(friendId, "フレンド", now)) {
  const friendships = new FakeFriendships(areFriends);
  const users = new FakeUsers(user);
  const tasks = new FakeTasks(pages);
  return { useCase: new GetFriendDetailUseCase(uow, friendships, users, tasks), users, tasks };
}

function assertNotFound(promise: Promise<unknown>): Promise<void> {
  return assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, "NOT_FOUND");
    return true;
  });
}

test("GetFriendDetail は関係を確認してからプロフィールとfriend taskを返す", async () => {
  events.length = 0;
  const publicTask = makeTask("33333333-3333-4333-8333-333333333331", true, 700);
  const privateTask = makeTask("33333333-3333-4333-8333-333333333332", false, 1500);
  const nextCursor = "eyJhdCI6IjIwMjYtMTAuMjhUMDA6MDA6MDAuMDAwWiIsImlkIjoi...";
  const { useCase, tasks } = createUseCase(true, [{ items: [publicTask, privateTask], nextCursor }]);

  const result = await useCase.execute({ userId: viewerId, friendUserId: friendId, limit: 20 });

  assert.deepEqual(events, ["uow", "areFriends", "findById", "listByOwner"]);
  assert.deepEqual(tasks.queries, [{ owner: friendId, view: "active", limit: 20 }]);
  assert.deepEqual(result.friend, { userId: friendId, nickname: "フレンド" });
  assert.deepEqual(result.tasks.items.map(({ id, penaltyAmount }) => ({ id, penaltyAmount })), [
    { id: publicTask.id, penaltyAmount: 700 },
    { id: privateTask.id, penaltyAmount: undefined },
  ]);
  const secondItem = result.tasks.items.at(1);
  assert.ok(secondItem);
  assert.equal(Object.hasOwn(secondItem, "penaltyAmount"), false);
  assert.equal(result.tasks.nextCursor, nextCursor);
});

test("GetFriendDetail はタスクがないフレンドの詳細を空ページで返す", async () => {
  const { useCase, tasks } = createUseCase(true, [{ items: [], nextCursor: null }]);

  const result = await useCase.execute({ userId: viewerId, friendUserId: friendId, limit: 50 });

  assert.deepEqual(result.tasks, { items: [], nextCursor: null });
  assert.deepEqual(tasks.queries, [{ owner: friendId, view: "active", limit: 50 }]);
});

test("GetFriendDetail はcursorを渡して複数ページを維持する", async () => {
  const first = makeTask("33333333-3333-4333-8333-333333333333", true, 300);
  const second = makeTask("33333333-3333-4333-8333-333333333334", true, 400);
  const cursor = "opaque-next-cursor";
  const { useCase, tasks } = createUseCase(true, [
    { items: [first], nextCursor: cursor },
    { items: [second], nextCursor: null },
  ]);

  const firstPage = await useCase.execute({ userId: viewerId, friendUserId: friendId, limit: 1 });
  const secondPage = await useCase.execute({ userId: viewerId, friendUserId: friendId, limit: 1, cursor });

  assert.deepEqual(tasks.queries, [
    { owner: friendId, view: "active", limit: 1 },
    { owner: friendId, view: "active", limit: 1, cursor },
  ]);
  assert.deepEqual(firstPage.tasks.items.map((item) => item.id), [first.id]);
  assert.equal(firstPage.tasks.nextCursor, cursor);
  assert.deepEqual(secondPage.tasks.items.map((item) => item.id), [second.id]);
  assert.equal(secondPage.tasks.nextCursor, null);
});

test("GetFriendDetail は self/pending/blocked/removed/無関係の関係を同じ404にし後続repositoryを読まない", async (t) => {
  for (const relation of ["self", "pending", "blocked", "removed", "unrelated", "missing"] as const) {
    await t.test(relation, async () => {
      events.length = 0;
      const { useCase, users, tasks } = createUseCase(false, []);

      await assertNotFound(useCase.execute({ userId: viewerId, friendUserId: friendId, limit: 20 }));

      assert.deepEqual(events, ["uow", "areFriends"]);
      assert.equal(users.calls, 0);
      assert.equal(tasks.queries.length, 0);
    });
  }
});

test("GetFriendDetail はaccepted関係でもプロフィールがなければ404にしtaskを読まない", async () => {
  events.length = 0;
  const { useCase, users, tasks } = createUseCase(true, [], null);

  await assertNotFound(useCase.execute({ userId: viewerId, friendUserId: friendId, limit: 20 }));

  assert.deepEqual(events, ["uow", "areFriends", "findById"]);
  assert.equal(users.calls, 1);
  assert.equal(tasks.queries.length, 0);
});

test("friend detail path ID parser rejects malformed UUID input", () => {
  assert.throws(() => parseUserId("not-a-uuid"), (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, "VALIDATION_ERROR");
    return true;
  });
});
