import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { FriendshipRepository, FriendInviteRepository } from "./application/ports/friendship.repository.ts";
import type { IdempotencyRecord, IdempotencyRepository } from "./application/ports/idempotency.repository.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { NotificationRepository } from "./application/ports/notification.repository.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { UserRepository } from "./application/ports/user.repository.ts";
import type { Page } from "./application/ports/task.repository.ts";
import { parseResponseBody } from "./infrastructure/db/mappers/idempotency-response.mapper.ts";
import { hashRequest } from "./application/shared/request-hash.ts";
import { CreateFriendRequestUseCase } from "./application/usecases/friends/create-friend-request.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { parseFriendshipId, parseNotificationId, parseUserId } from "./domain/shared/id-parsers.ts";
import { parseIdempotencyKey, type IdempotencyKey } from "./domain/shared/idempotency.ts";
import type { Friendship, PendingFriendship } from "./domain/friendship/friendship.ts";
import type { FriendInvite } from "./domain/friendship/friend-invite.ts";
import type { FriendRequestView } from "./domain/friendship/friend-views.ts";
import type { Notification } from "./domain/notification/notification.ts";
import type { IdempotentOperation, IdempotentResponseStatus, RequestHash } from "./domain/shared/idempotency.ts";
import type { UserId } from "./domain/shared/ids.ts";
import type { ResponsePayloads } from "./domain/shared/response-payloads.ts";
import { registerUser, type User } from "./domain/user/user.ts";

// Tx は infra だけが生成でき、テストでは port 間の受け渡しにだけ使う。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };
const requesterId = parseUserId("11111111-1111-4111-8111-111111111111");
const inviterId = parseUserId("22222222-2222-4222-8222-222222222222");
const friendshipId = parseFriendshipId("33333333-3333-4333-8333-333333333333");
const notificationId = parseNotificationId("44444444-4444-4444-8444-444444444444");
const idempotencyKey = parseIdempotencyKey("55555555-5555-4555-8555-555555555555");
const now = new Date("2026-10-28T00:00:00.000Z");
const invite: FriendInvite = { id: "invite-id", inviterId, token: "invite-token", isActive: true, createdAt: now };
const requester = registerUser(requesterId, "申請者", now);
const inviter = registerUser(inviterId, "招待者", now);
const input = { userId: requesterId, idempotencyKey, inviteToken: invite.token };
const expectedView: FriendRequestView = {
  id: friendshipId,
  requester: { userId: requesterId, nickname: requester.nickname },
  addressee: { userId: inviterId, nickname: inviter.nickname },
  requestedAt: now,
};

class FakeInvites implements FriendInviteRepository {
  readonly result: FriendInvite | null;
  queriedToken: string | null = null;

  constructor(result: FriendInvite | null) {
    this.result = result;
  }

  findActiveByInviter(): Promise<FriendInvite | null> {
    return Promise.reject(new Error("使わない"));
  }

  findActiveByToken(_actualTx: Tx, token: string): Promise<FriendInvite | null> {
    this.queriedToken = token;
    return Promise.resolve(this.result);
  }

  insert(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }
}

class FakeFriendships implements FriendshipRepository {
  readonly existing: Friendship | null;
  saved: Friendship | null = null;
  pairLookup: { a: UserId; b: UserId; forUpdate: boolean } | null = null;

  constructor(existing: Friendship | null = null) {
    this.existing = existing;
  }

  findById(): Promise<Friendship | null> {
    return Promise.reject(new Error("使わない"));
  }

  findByPair(_actualTx: Tx, a: UserId, b: UserId, options?: { forUpdate?: boolean }): Promise<Friendship | null> {
    this.pairLookup = { a, b, forUpdate: options?.forUpdate === true };
    return Promise.resolve(this.existing);
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

class FakeNotifications implements NotificationRepository {
  inserted: Notification | null = null;

  insertIfAbsent(_actualTx: Tx, notification: Notification): Promise<void> {
    this.inserted = notification;
    return Promise.resolve();
  }

  list(): Promise<Page<Notification>> {
    return Promise.reject(new Error("使わない"));
  }

  countUnread(): Promise<number> {
    return Promise.reject(new Error("使わない"));
  }

  markRead(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  markAllRead(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }
}

class FakeIdempotency implements IdempotencyRepository {
  record: IdempotencyRecord<"create_friend_request"> | null;
  completed: { status: IdempotentResponseStatus; body: unknown } | null = null;

  constructor(record: IdempotencyRecord<"create_friend_request"> | null = null) {
    this.record = record;
  }

  reserve<O extends IdempotentOperation>(
    _actualTx: Tx,
    _user: UserId,
    operation: O,
    _key: IdempotencyKey,
    _requestHash: RequestHash,
    _now: Date,
  ): Promise<IdempotencyRecord<O> | null> {
    if (operation !== "create_friend_request") throw new Error("想定外の操作");
    if (this.record === null) return Promise.resolve(null);
    const responseBody =
      this.record.responseBody === null
        ? null
        : parseResponseBody(operation, JSON.parse(JSON.stringify(this.record.responseBody)));
    return Promise.resolve({ ...this.record, responseBody });
  }

  complete<O extends IdempotentOperation>(
    _actualTx: Tx,
    _user: UserId,
    operation: O,
    _key: IdempotencyKey,
    status: IdempotentResponseStatus,
    body: ResponsePayloads[O],
  ): Promise<void> {
    if (operation !== "create_friend_request") throw new Error("想定外の操作");
    this.completed = { status, body };
    return Promise.resolve();
  }
}

class FakeIds implements IdGenerator {
  private readonly values: string[];

  constructor(values: string[]) {
    this.values = values;
  }

  uuid(): string {
    const value = this.values.shift();
    if (value === undefined) throw new Error("UUID の採番回数が想定外です");
    return value;
  }

  inviteToken(): string {
    throw new Error("使わない");
  }
}

function setup(options: {
  activeInvite?: FriendInvite | null;
  users?: User[];
  idempotencyRecord?: IdempotencyRecord<"create_friend_request"> | null;
} = {}) {
  const invites = new FakeInvites(options.activeInvite === undefined ? invite : options.activeInvite);
  const friendships = new FakeFriendships();
  const users = new FakeUsers(options.users ?? [requester, inviter]);
  const notifications = new FakeNotifications();
  const idempotency = new FakeIdempotency(options.idempotencyRecord ?? null);
  const ids = new FakeIds([friendshipId, notificationId]);
  const clock: Clock = { now: () => now };
  const useCase = new CreateFriendRequestUseCase(uow, clock, ids, idempotency, invites, friendships, users, notifications);
  return { useCase, invites, friendships, users, notifications, idempotency };
}

async function assertDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test("CreateFriendRequest は申請・通知・201 の冪等レスポンスを同じ処理で保存する", async () => {
  const fixture = setup();
  const result = await fixture.useCase.execute(input);

  assert.deepEqual(fixture.invites.queriedToken, invite.token);
  assert.deepEqual(fixture.friendships.pairLookup, { a: requesterId, b: inviterId, forUpdate: true });
  assert.deepEqual(fixture.friendships.saved, {
    id: friendshipId,
    requesterId,
    receiverId: inviterId,
    requestedAt: now,
    status: "pending",
  });
  assert.deepEqual(fixture.users.queriedIds, [requesterId, inviterId]);
  assert.deepEqual(result, expectedView);
  assert.deepEqual(fixture.notifications.inserted, {
    id: notificationId,
    userId: inviterId,
    type: "friend_request",
    title: "フレンド申請が届きました",
    body: "申請者さんからフレンド申請が届きました",
    relatedTaskId: null,
    readAt: null,
    createdAt: now,
    deduplicationKey: `create_friend_request:${requesterId}:${idempotencyKey}`,
  });
  assert.deepEqual(fixture.idempotency.completed, { status: 201, body: expectedView });
});

test("CreateFriendRequest は同じ内容の完了済み要求で保存済みレスポンスを返す", async () => {
  const requestHash = hashRequest("create_friend_request", { inviteToken: input.inviteToken });
  const fixture = setup({
    idempotencyRecord: { requestHash, responseStatus: 201, responseBody: expectedView },
  });

  const result = await fixture.useCase.execute(input);

  assert.deepEqual(result, expectedView);
  assert.equal(fixture.invites.queriedToken, null);
  assert.equal(fixture.friendships.pairLookup, null);
  assert.equal(fixture.notifications.inserted, null);
  assert.equal(fixture.idempotency.completed, null);
});

test("CreateFriendRequest は同じキーが別の要求内容に使われたら IDEMPOTENCY_KEY_REUSED にする", async () => {
  const requestHash = hashRequest("create_friend_request", { inviteToken: "another-token" });
  const fixture = setup({ idempotencyRecord: { requestHash, responseStatus: null, responseBody: null } });

  await assertDomainError(fixture.useCase.execute(input), "IDEMPOTENCY_KEY_REUSED");
  assert.equal(fixture.invites.queriedToken, null);
  assert.equal(fixture.friendships.saved, null);
});

test("CreateFriendRequest は有効な招待がなければ NOT_FOUND にする", async () => {
  const fixture = setup({ activeInvite: null });

  await assertDomainError(fixture.useCase.execute(input), "NOT_FOUND");
  assert.equal(fixture.friendships.pairLookup, null);
  assert.equal(fixture.notifications.inserted, null);
});
