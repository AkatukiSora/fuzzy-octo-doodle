
import assert from "node:assert/strict";
import { test } from "node:test";
import { ListBlockedUsersUseCase } from "./application/usecases/friends/list-blocked-users.usecase.ts";
import { brandAs } from "./domain/shared/brand.ts";
import { registerUser } from "./domain/user/user.ts";
import type { UserId } from "./domain/shared/ids.ts";
import type { BlockedFriendship } from "./domain/friendship/friendship.ts";
import type { UnitOfWork, Tx } from "./application/ports/unit-of-work.port.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { UserRepository } from "./application/ports/user.repository.ts";

const userId = brandAs<"UserId">();
const friendshipId = brandAs<"FriendshipId">();
const now = new Date("2026-11-01T00:00:00Z");

const me = userId("00000000-0000-4000-8000-000000000001");
const alice = userId("00000000-0000-4000-8000-000000000002");
const bob = userId("00000000-0000-4000-8000-000000000003");

function makeBlocked(
  requesterId: UserId,
  receiverId: UserId,
  blockedBy: UserId,
): BlockedFriendship {
  return {
    id: friendshipId("00000000-0000-4000-8000-000000000010"),
    requesterId,
    receiverId,
    requestedAt: now,
    status: "blocked",
    blockedBy,
  };
}

function createUseCase(blocked: BlockedFriendship[]) {
  const calls: UserId[][] = [];

  // Txは不透明型。Repositoryのモックはtxの中身を参照しない。
  // テスト専用のダミー値に限って型アサーションを許可する。
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const tx = {} as Tx;

  const uow: UnitOfWork = {
    run: (fn) => fn(tx),
  };

  const friendships: FriendshipRepository = {
    findById: () => Promise.resolve(null),
    findByPair: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    areFriends: () => Promise.resolve(false),
    countFriends: () => Promise.resolve(0),
    listFriendIds: () => Promise.resolve([]),
    listIncomingPending: () => Promise.resolve([]),
    listOutgoingPending: () => Promise.resolve([]),
    listBlockedBy: (_tx, by) =>
      Promise.resolve(blocked.filter((f) => f.blockedBy === by)),
  };

  const users: UserRepository = {
    findById: () => Promise.resolve(null),
    findByIds: (_tx, ids) => {
      calls.push([...ids]);

      const found = [
        registerUser(alice, "Alice", now),
        registerUser(bob, "Bob", now),
      ].filter((u) => ids.includes(u.id));

      return Promise.resolve(found);
    },
    save: () => Promise.resolve(),
    getStats: () =>
      Promise.resolve({
        successCount: 0,
        failedCount: 0,
        indeterminateCount: 0,
      }),
  };

  return {
    useCase: new ListBlockedUsersUseCase(
      uow,
      friendships,
      users,
    ),
    calls,
  };
}

test("自分がブロックした相手の情報を返す", async () => {
  const { useCase, calls } = createUseCase([
    makeBlocked(me, alice, me),
    makeBlocked(bob, me, me),
  ]);

  const result = await useCase.execute({ userId: me });

  assert.deepEqual(result, [
    { userId: alice, nickname: "Alice" },
    { userId: bob, nickname: "Bob" },
  ]);
  assert.deepEqual(calls, [[alice, bob]]);
});

test("ブロックがなければ空配列を返す", async () => {
  const { useCase, calls } = createUseCase([]);

  const result = await useCase.execute({ userId: me });

  assert.deepEqual(result, []);
  assert.equal(calls.length, 0);
});

test("相手から自分へのブロックは含めない", async () => {
  const { useCase } = createUseCase([
    makeBlocked(alice, me, alice),
  ]);

  const result = await useCase.execute({ userId: me });

  assert.deepEqual(result, []);
});
