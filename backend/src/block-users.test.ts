import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import { BlockUserUseCase } from "./application/usecases/friends/block-user.usecase.ts";
import { UnblockUserUseCase } from "./application/usecases/friends/unblock-user.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseFriendshipId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { UserId } from "./domain/shared/ids.ts";
import type {
  AcceptedFriendship,
  BlockedFriendship,
  Friendship,
  PendingFriendship,
} from "./domain/friendship/friendship.ts";

// Tx は実装（infrastructure）だけが作れる不透明な型。テストでは値を使わず、port 間の受け渡しだけを確認する。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };
const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const targetUserId = parseUserId("22222222-2222-4222-8222-222222222222");
const friendshipId = parseFriendshipId("33333333-3333-4333-8333-333333333333");
const requestedAt = new Date("2026-10-28T00:00:00.000Z");

const accepted: AcceptedFriendship = {
  id: friendshipId,
  requesterId: userId,
  receiverId: targetUserId,
  requestedAt,
  status: "accepted",
  acceptedAt: requestedAt,
};
const blockedByUser: BlockedFriendship = {
  id: friendshipId,
  requesterId: userId,
  receiverId: targetUserId,
  requestedAt,
  status: "blocked",
  blockedBy: userId,
};
const blockedByTarget: BlockedFriendship = { ...blockedByUser, blockedBy: targetUserId };

class FakeFriendships implements FriendshipRepository {
  readonly existing: Friendship | null;
  saved: Friendship | null = null;
  pairQuery: { a: UserId; b: UserId; forUpdate: boolean } | null = null;

  constructor(existing: Friendship | null = null) {
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

  listFriendIds(): Promise<UserId[]> {
    return Promise.resolve([]);
  }

  listIncomingPending(): Promise<PendingFriendship[]> {
    return Promise.resolve([]);
  }

  listOutgoingPending(): Promise<PendingFriendship[]> {
    return Promise.resolve([]);
  }

  listBlockedBy(): Promise<BlockedFriendship[]> {
    return Promise.resolve([]);
  }
}

const clock: Clock = { now: () => requestedAt };
const ids: IdGenerator = {
  uuid: () => "44444444-4444-4444-8444-444444444444",
  inviteToken: () => "unused-token",
};

function assertDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  return assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test("BlockUser はペアをロックし、新しい blocked 関係を保存する", async () => {
  const friendships = new FakeFriendships();
  const result = await new BlockUserUseCase(uow, clock, friendships, ids).execute({ userId, targetUserId });

  assert.equal(result, null);
  assert.deepEqual(friendships.pairQuery, { a: userId, b: targetUserId, forUpdate: true });
  assert.deepEqual(friendships.saved, {
    id: parseFriendshipId("44444444-4444-4444-8444-444444444444"),
    requesterId: userId,
    receiverId: targetUserId,
    requestedAt,
    status: "blocked",
    blockedBy: userId,
  });
});

test("BlockUser は既存関係を同じ ID で blocked にする", async () => {
  const friendships = new FakeFriendships(accepted);

  await new BlockUserUseCase(uow, clock, friendships, ids).execute({ userId, targetUserId });

  assert.equal(friendships.saved?.id, friendshipId);
  assert.deepEqual(friendships.saved, {
    id: friendshipId,
    requesterId: userId,
    receiverId: targetUserId,
    requestedAt,
    status: "blocked",
    blockedBy: userId,
  });
});

test("BlockUser は自分自身をブロックできない", async () => {
  await assertDomainError(
    new BlockUserUseCase(uow, clock, new FakeFriendships(), ids).execute({ userId, targetUserId: userId }),
    "VALIDATION_ERROR",
  );
});

test("BlockUser は相手が設定したブロックを上書きできない", async () => {
  await assertDomainError(
    new BlockUserUseCase(uow, clock, new FakeFriendships(blockedByTarget), ids).execute({ userId, targetUserId }),
    "STATE_CONFLICT",
  );
});

test("UnblockUser は本人のブロックを removed にして保存する", async () => {
  const friendships = new FakeFriendships(blockedByUser);
  const result = await new UnblockUserUseCase(uow, clock, friendships).execute({ userId, targetUserId });

  assert.equal(result, null);
  assert.deepEqual(friendships.pairQuery, { a: userId, b: targetUserId, forUpdate: true });
  assert.deepEqual(friendships.saved, {
    id: friendshipId,
    requesterId: userId,
    receiverId: targetUserId,
    requestedAt,
    status: "removed",
  });
});

test("UnblockUser は関係がなければ NOT_FOUND で失敗する", async () => {
  await assertDomainError(
    new UnblockUserUseCase(uow, clock, new FakeFriendships()).execute({ userId, targetUserId }),
    "NOT_FOUND",
  );
});

test("UnblockUser は blocked 以外の関係を解除できない", async () => {
  await assertDomainError(
    new UnblockUserUseCase(uow, clock, new FakeFriendships(accepted)).execute({ userId, targetUserId }),
    "STATE_CONFLICT",
  );
});

test("UnblockUser は相手が設定したブロックを解除できない", async () => {
  await assertDomainError(
    new UnblockUserUseCase(uow, clock, new FakeFriendships(blockedByTarget)).execute({ userId, targetUserId }),
    "FORBIDDEN",
  );
});
