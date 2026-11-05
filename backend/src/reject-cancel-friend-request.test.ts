import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { UserRepository } from "./application/ports/user.repository.ts";
import { CancelFriendRequestUseCase } from "./application/usecases/friends/cancel-friend-request.usecase.ts";
import { RejectFriendRequestUseCase } from "./application/usecases/friends/reject-friend-request.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseFriendshipId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { Friendship, PendingFriendship } from "./domain/friendship/friendship.ts";
import type { FriendRequestView } from "./domain/friendship/friend-views.ts";
import type { FriendshipId, UserId } from "./domain/shared/ids.ts";
import { registerUser, type User } from "./domain/user/user.ts";

// Tx は infra だけが生成でき、テストでは port 間の受け渡しにだけ使う。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };
const requesterId = parseUserId("11111111-1111-4111-8111-111111111111");
const receiverId = parseUserId("22222222-2222-4222-8222-222222222222");
const friendshipId = parseFriendshipId("33333333-3333-4333-8333-333333333333");
const requestedAt = new Date("2026-10-27T00:00:00.000Z");
const pending: PendingFriendship = {
  id: friendshipId,
  requesterId,
  receiverId,
  requestedAt,
  status: "pending",
};
const requester = registerUser(requesterId, "申請者", requestedAt);
const receiver = registerUser(receiverId, "受信者", requestedAt);
const expectedView: FriendRequestView = {
  id: friendshipId,
  requester: { userId: requesterId, nickname: requester.nickname },
  addressee: { userId: receiverId, nickname: receiver.nickname },
  requestedAt,
};

class FakeFriendships implements FriendshipRepository {
  readonly existing: Friendship | null;
  queriedId: FriendshipId | null = null;
  queriedForUpdate: boolean | undefined;
  saved: Friendship | null = null;

  constructor(existing: Friendship | null) {
    this.existing = existing;
  }

  findById(_actualTx: Tx, id: FriendshipId, opts?: { forUpdate?: boolean }): Promise<Friendship | null> {
    this.queriedId = id;
    this.queriedForUpdate = opts?.forUpdate;
    return Promise.resolve(this.existing);
  }

  findByPair(): Promise<Friendship | null> {
    return Promise.reject(new Error("使わない"));
  }

  save(_actualTx: Tx, friendship: Friendship): Promise<void> {
    this.saved = friendship;
    return Promise.resolve();
  }

  areFriends(): Promise<boolean> {
    return Promise.resolve(false);
  }

  countFriends(): Promise<number> {
    return Promise.resolve(0);
  }

  listFriendIds(): Promise<UserId[]> {
    return Promise.resolve([]);
  }

  listIncomingPending(): Promise<PendingFriendship[]> {
    return Promise.resolve([]);
  }

  listOutgoingPending(): Promise<PendingFriendship[]> {
    return Promise.resolve([]);
  }

  listBlockedBy(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

class FakeUsers implements UserRepository {
  readonly results: User[];
  queriedIds: readonly UserId[] = [];

  constructor(results: User[]) {
    this.results = results;
  }

  findById(): Promise<User | null> {
    return Promise.reject(new Error("使わない"));
  }

  findByIds(_actualTx: Tx, ids: readonly UserId[]): Promise<User[]> {
    this.queriedIds = ids;
    return Promise.resolve(this.results);
  }

  save(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  getStats(): never {
    throw new Error("使わない");
  }
}

function setup(existing: Friendship | null, users: User[] = [requester, receiver]) {
  const friendships = new FakeFriendships(existing);
  const userRepository = new FakeUsers(users);
  const clock: Clock = { now: () => requestedAt };
  return {
    friendships,
    users: userRepository,
    reject: new RejectFriendRequestUseCase(uow, clock, friendships, userRepository),
    cancel: new CancelFriendRequestUseCase(uow, clock, friendships, userRepository),
  };
}

async function assertDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test("RejectFriendRequest は受信者本人が pending 申請を拒否する", async () => {
  const fixture = setup(pending);

  const result = await fixture.reject.execute({ userId: receiverId, friendshipId });

  assert.equal(fixture.friendships.queriedId, friendshipId);
  assert.equal(fixture.friendships.queriedForUpdate, true);
  assert.deepEqual(fixture.friendships.saved, { ...pending, status: "rejected" });
  assert.deepEqual(fixture.users.queriedIds, [requesterId, receiverId]);
  assert.deepEqual(result, expectedView);
});

test("RejectFriendRequest は申請がなければ NOT_FOUND にする", async () => {
  const fixture = setup(null);

  await assertDomainError(fixture.reject.execute({ userId: receiverId, friendshipId }), "NOT_FOUND");
  assert.equal(fixture.friendships.saved, null);
});

test("RejectFriendRequest は pending 以外の申請を STATE_CONFLICT にする", async () => {
  const fixture = setup({ ...pending, status: "cancelled" });

  await assertDomainError(fixture.reject.execute({ userId: receiverId, friendshipId }), "STATE_CONFLICT");
  assert.equal(fixture.friendships.queriedForUpdate, true);
  assert.equal(fixture.friendships.saved, null);
});

test("RejectFriendRequest は申請者による拒否を FORBIDDEN にする", async () => {
  const fixture = setup(pending);

  await assertDomainError(fixture.reject.execute({ userId: requesterId, friendshipId }), "FORBIDDEN");
  assert.equal(fixture.friendships.saved, null);
});

test("CancelFriendRequest は申請者本人が pending 申請を取り消す", async () => {
  const fixture = setup(pending);

  const result = await fixture.cancel.execute({ userId: requesterId, friendshipId });

  assert.equal(fixture.friendships.queriedId, friendshipId);
  assert.equal(fixture.friendships.queriedForUpdate, true);
  assert.deepEqual(fixture.friendships.saved, { ...pending, status: "cancelled" });
  assert.deepEqual(fixture.users.queriedIds, [requesterId, receiverId]);
  assert.deepEqual(result, expectedView);
});

test("CancelFriendRequest は申請がなければ NOT_FOUND にする", async () => {
  const fixture = setup(null);

  await assertDomainError(fixture.cancel.execute({ userId: requesterId, friendshipId }), "NOT_FOUND");
  assert.equal(fixture.friendships.saved, null);
});

test("CancelFriendRequest は pending 以外の申請を STATE_CONFLICT にする", async () => {
  const fixture = setup({ ...pending, status: "rejected" });

  await assertDomainError(fixture.cancel.execute({ userId: requesterId, friendshipId }), "STATE_CONFLICT");
  assert.equal(fixture.friendships.queriedForUpdate, true);
  assert.equal(fixture.friendships.saved, null);
});

test("CancelFriendRequest は受信者による取消を FORBIDDEN にする", async () => {
  const fixture = setup(pending);

  await assertDomainError(fixture.cancel.execute({ userId: receiverId, friendshipId }), "FORBIDDEN");
  assert.equal(fixture.friendships.saved, null);
});
