import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { UserRepository } from "./application/ports/user.repository.ts";
import { ListFriendsUseCase } from "./application/usecases/friends/list-friends.usecase.ts";
import { RemoveFriendUseCase } from "./application/usecases/friends/remove-friend.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseFriendshipId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { UserId } from "./domain/shared/ids.ts";
import type { AcceptedFriendship, Friendship, PendingFriendship } from "./domain/friendship/friendship.ts";
import { registerUser } from "./domain/user/user.ts";
import type { User } from "./domain/user/user.ts";

// Tx は infrastructure だけが生成できる不透明型。偽 port 間で受け渡すだけのため空値を使う。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };
const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const friendUserId = parseUserId("22222222-2222-4222-8222-222222222222");
const friendshipId = parseFriendshipId("33333333-3333-4333-8333-333333333333");
const now = new Date("2026-10-28T00:00:00.000Z");
const accepted: AcceptedFriendship = {
  id: friendshipId,
  requesterId: userId,
  receiverId: friendUserId,
  requestedAt: now,
  status: "accepted",
  acceptedAt: now,
};
const clock: Clock = { now: () => now };

class FakeFriendships implements FriendshipRepository {
  readonly friendIds: UserId[];
  readonly existing: Friendship | null;
  pairQuery: { a: UserId; b: UserId; forUpdate: boolean } | null = null;
  saved: Friendship | null = null;

  constructor(friendIds: UserId[] = [], existing: Friendship | null = null) {
    this.friendIds = friendIds;
    this.existing = existing;
  }

  findById(): Promise<Friendship | null> {
    return Promise.reject(new Error("使わない"));
  }

  findByPair(
    actualTx: Tx,
    a: UserId,
    b: UserId,
    options?: { forUpdate?: boolean },
  ): Promise<Friendship | null> {
    assert.equal(actualTx, tx);
    this.pairQuery = { a, b, forUpdate: options?.forUpdate === true };
    return Promise.resolve(this.existing);
  }

  save(actualTx: Tx, friendship: Friendship): Promise<void> {
    assert.equal(actualTx, tx);
    this.saved = friendship;
    return Promise.resolve();
  }

  areFriends(): Promise<boolean> {
    return Promise.resolve(false);
  }

  countFriends(): Promise<number> {
    return Promise.resolve(0);
  }

  listFriendIds(actualTx: Tx, actualUserId: UserId): Promise<UserId[]> {
    assert.equal(actualTx, tx);
    assert.equal(actualUserId, userId);
    return Promise.resolve(this.friendIds);
  }

  listIncomingPending(): Promise<never[]> {
    return Promise.resolve([]);
  }

  listOutgoingPending(): Promise<never[]> {
    return Promise.resolve([]);
  }

  listBlockedBy(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

class FakeUsers implements UserRepository {
  readonly entries: User[];
  findByIdsCalls: readonly UserId[] | null = null;

  constructor(entries: User[] = []) {
    this.entries = entries;
  }

  findById(): Promise<User | null> {
    return Promise.reject(new Error("使わない"));
  }

  findByIds(_actualTx: Tx, ids: readonly UserId[]): Promise<User[]> {
    this.findByIdsCalls = ids;
    return Promise.resolve(this.entries);
  }

  save(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  getStats(): never {
    throw new Error("使わない");
  }
}

function assertDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  return assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test("ListFriends はフレンドがいなければ空一覧を返し、ユーザーを検索しない", async () => {
  const users = new FakeUsers();
  const result = await new ListFriendsUseCase(uow, new FakeFriendships(), users).execute({ userId });

  assert.deepEqual(result, []);
  assert.equal(users.findByIdsCalls, null);
});

test("ListFriends はフレンドのプロフィールを UserSummary に変換して返す", async () => {
  const friend = registerUser(friendUserId, "フレンド", now);
  const friendships = new FakeFriendships([friendUserId]);
  const users = new FakeUsers([friend]);
  const result = await new ListFriendsUseCase(uow, friendships, users).execute({ userId });

  assert.deepEqual(users.findByIdsCalls, [friendUserId]);
  assert.deepEqual(result, [{ userId: friendUserId, nickname: friend.nickname }]);
});

test("RemoveFriend はペアをロックし、removed の関係を保存する", async () => {
  const friendships = new FakeFriendships([], accepted);
  const result = await new RemoveFriendUseCase(uow, clock, friendships).execute({ userId, friendUserId });

  assert.equal(result, null);
  assert.deepEqual(friendships.pairQuery, { a: userId, b: friendUserId, forUpdate: true });
  assert.deepEqual(friendships.saved, {
    id: friendshipId,
    requesterId: userId,
    receiverId: friendUserId,
    requestedAt: now,
    status: "removed",
  });
});

test("RemoveFriend は関係がなければ NOT_FOUND で失敗する", async () => {
  await assertDomainError(
    new RemoveFriendUseCase(uow, clock, new FakeFriendships()).execute({ userId, friendUserId }),
    "NOT_FOUND",
  );
});

test("RemoveFriend は accepted 以外の関係なら STATE_CONFLICT で失敗する", async () => {
  const pending: PendingFriendship = {
    id: friendshipId,
    requesterId: userId,
    receiverId: friendUserId,
    requestedAt: now,
    status: "pending",
  };
  await assertDomainError(
    new RemoveFriendUseCase(uow, clock, new FakeFriendships([], pending)).execute({ userId, friendUserId }),
    "STATE_CONFLICT",
  );
});
