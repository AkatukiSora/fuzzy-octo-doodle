import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "./application/ports/clock.port.ts";
import type { FriendInviteRepository } from "./application/ports/friendship.repository.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { UserRepository } from "./application/ports/user.repository.ts";
import { CreateFriendInviteUseCase } from "./application/usecases/friends/create-friend-invite.usecase.ts";
import { GetFriendInviteUseCase } from "./application/usecases/friends/get-friend-invite.usecase.ts";
import { DomainError } from "./domain/shared/errors.ts";
import type { UserId } from "./domain/shared/ids.ts";
import { parseUserId } from "./domain/shared/id-parsers.ts";
import type { FriendInvite } from "./domain/friendship/friend-invite.ts";
import { registerUser, type User } from "./domain/user/user.ts";

// Tx は実装（infrastructure）だけが作れる不透明な型。テストでは値を使わず、port 間の受け渡しだけを確認する。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: (fn) => fn(tx) };
const inviterId = parseUserId("11111111-1111-4111-8111-111111111111");
const createdAt = new Date("2026-10-28T00:00:00.000Z");
const activeInvite: FriendInvite = {
  id: "invite-id",
  inviterId,
  token: "existing-token",
  isActive: true,
  createdAt,
};

class FakeInvites implements FriendInviteRepository {
  readonly byInviter: FriendInvite | null;
  readonly byToken: FriendInvite | null;
  inserted: FriendInvite | null = null;
  queriedToken: string | null = null;

  constructor(byInviter: FriendInvite | null = null, byToken: FriendInvite | null = null) {
    this.byInviter = byInviter;
    this.byToken = byToken;
  }

  findActiveByInviter(actualTx: Tx, inviter: UserId): Promise<FriendInvite | null> {
    assert.equal(actualTx, tx);
    assert.equal(inviter, inviterId);
    return Promise.resolve(this.byInviter);
  }

  findActiveByToken(actualTx: Tx, token: string): Promise<FriendInvite | null> {
    assert.equal(actualTx, tx);
    this.queriedToken = token;
    return Promise.resolve(this.byToken);
  }

  insert(actualTx: Tx, invite: FriendInvite): Promise<void> {
    assert.equal(actualTx, tx);
    this.inserted = invite;
    return Promise.resolve();
  }
}

class FakeUsers implements UserRepository {
  readonly user: User | null;

  constructor(user: User | null) {
    this.user = user;
  }

  findById(actualTx: Tx, id: UserId): Promise<User | null> {
    assert.equal(actualTx, tx);
    assert.equal(id, inviterId);
    return Promise.resolve(this.user);
  }

  findByIds(): Promise<User[]> {
    return Promise.reject(new Error("使わない"));
  }

  save(): Promise<void> {
    return Promise.reject(new Error("使わない"));
  }

  getStats(): never {
    throw new Error("使わない");
  }
}

test("CreateFriendInvite は有効な招待を再利用する", async () => {
  const invites = new FakeInvites(activeInvite);
  const clock: Clock = { now: () => createdAt };
  const ids: IdGenerator = {
    uuid: () => {
      throw new Error("既存招待では UUID を採番しない");
    },
    inviteToken: () => {
      throw new Error("既存招待では token を採番しない");
    },
  };

  const result = await new CreateFriendInviteUseCase(uow, clock, ids, invites).execute({ userId: inviterId });

  assert.deepEqual(result, { token: activeInvite.token, createdAt });
  assert.equal(invites.inserted, null);
});

test("CreateFriendInvite は有効な招待がなければ保存して返す", async () => {
  const invites = new FakeInvites();
  const clock: Clock = { now: () => createdAt };
  const ids: IdGenerator = { uuid: () => "new-invite-id", inviteToken: () => "new-token" };

  const result = await new CreateFriendInviteUseCase(uow, clock, ids, invites).execute({ userId: inviterId });

  assert.deepEqual(invites.inserted, {
    id: "new-invite-id",
    inviterId,
    token: "new-token",
    isActive: true,
    createdAt,
  });
  assert.deepEqual(result, { token: "new-token", createdAt });
});

test("GetFriendInvite は公開プロフィールとして招待者 ID とニックネームだけを返す", async () => {
  const user = registerUser(inviterId, "招待者", createdAt);
  const invites = new FakeInvites(null, activeInvite);
  const result = await new GetFriendInviteUseCase(uow, invites, new FakeUsers(user)).execute({ token: activeInvite.token });

  assert.equal(invites.queriedToken, activeInvite.token);
  assert.deepEqual(result, { userId: inviterId, nickname: user.nickname });
});

test("GetFriendInvite は有効な招待がなければ NOT_FOUND で失敗する", async () => {
  await assert.rejects(
    new GetFriendInviteUseCase(uow, new FakeInvites(), new FakeUsers(null)).execute({ token: "missing-token" }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "NOT_FOUND");
      return true;
    },
  );
});

test("GetFriendInvite は招待者がなければ NOT_FOUND で失敗する", async () => {
  await assert.rejects(
    new GetFriendInviteUseCase(uow, new FakeInvites(null, activeInvite), new FakeUsers(null)).execute({
      token: activeInvite.token,
    }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "NOT_FOUND");
      return true;
    },
  );
});
