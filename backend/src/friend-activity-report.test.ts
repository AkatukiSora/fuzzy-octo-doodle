import assert from "node:assert/strict";
import { test } from "node:test";
import { GetFriendActivityUseCase } from "./application/usecases/friends/get-friend-activity.usecase.ts";
import { ReportUserUseCase } from "./application/usecases/friends/report-user.usecase.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { UserReportRepository } from "./application/ports/user-report.repository.ts";
import type { UserReport } from "./domain/friendship/user-report.ts";
import { validateUserReport } from "./domain/friendship/user-report.ts";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import { parseIdempotencyKey } from "./domain/shared/idempotency.ts";
import { DomainError } from "./domain/shared/errors.ts";
import { createTask } from "./domain/task/task.ts";
import { authorizeTaskCreation, parseTaskDeadline } from "./domain/task/task-policy.ts";
import { registerUser } from "./domain/user/user.ts";
import { KyselyFriendshipRepository } from "./infrastructure/db/repositories/friendship.repository.ts";
import { KyselyUserRepository } from "./infrastructure/db/repositories/user.repository.ts";
import { KyselyFriendActivityRepository } from "./infrastructure/db/repositories/friend-activity.repository.ts";

// 不透明なTxをテストのport間で受け渡すだけで、DB実装には渡さない。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;
const uow: UnitOfWork = { run: fn => fn(tx) };
const viewer = parseUserId("11111111-1111-4111-8111-111111111111");
const target = parseUserId("22222222-2222-4222-8222-222222222222");
const now = new Date("2026-11-09T00:00:00Z");
const clock = { now: () => now };
const ids = { uuid: () => "33333333-3333-4333-8333-333333333333", inviteToken: () => "unused" };
const input = { userId: viewer, targetUserId: target, reason: "spam", detail: "迷惑なリンク", idempotencyKey: parseIdempotencyKey("44444444-4444-4444-8444-444444444444") } as const;

test("activity denies non-friends and blocked pairs before reading profiles, counts or tasks", async t => {
  const friends = new KyselyFriendshipRepository();
  t.mock.method(friends, "areFriends", () => Promise.resolve(false));
  const users = new KyselyUserRepository();
  const profile = t.mock.method(users, "findById", () => Promise.reject(new Error("must not read")));
  const activity = new KyselyFriendActivityRepository();
  const counts = t.mock.method(activity, "counts", () => Promise.reject(new Error("must not read")));
  const useCase = new GetFriendActivityUseCase(uow, friends, users, activity, clock);
  await assert.rejects(useCase.execute({ userId: viewer, friendUserId: target, sort: "soonest", limit: 20 }), e => e instanceof DomainError && e.code === "NOT_FOUND");
  assert.equal(profile.mock.callCount(), 0); assert.equal(counts.mock.callCount(), 0);
});

test("activity preserves private task content but hides amount and uses existing success-rate semantics", async t => {
  const friends = new KyselyFriendshipRepository();
  t.mock.method(friends, "areFriends", () => Promise.resolve(true));
  const users = new KyselyUserRepository();
  t.mock.method(users, "findById", () => Promise.resolve(registerUser(target, "フレンド", now)));
  const activity = new KyselyFriendActivityRepository();
  t.mock.method(activity, "counts", () => Promise.resolve({ successCount: 1, failedCount: 3, indeterminateCount: 8, activeCount: 2, overdueCount: 3 }));
  const task = createTask({ id: parseTaskId(ids.uuid()), ownerId: target, originalTaskId: null, title: "金額は非公開", achievementCondition: "写真を提出する", evidenceMethod: "photo", deadlineAt: parseTaskDeadline(new Date(now.getTime() + 3600000), now), penaltyAmount: 9876, isPenaltyPublic: false, permit: authorizeTaskCreation(0) }, now).next;
  const list = t.mock.method(activity, "list", () => Promise.resolve({ items: [task], nextCursor: "next" }));
  const useCase = new GetFriendActivityUseCase(uow, friends, users, activity, clock);
  const result = await useCase.execute({ userId: viewer, friendUserId: target, sort: "latest", limit: 2, cursor: "cursor" });
  assert.equal(result.stats.successRate, 25);
  assert.equal(result.tasks.items[0]?.title, "金額は非公開");
  assert.equal(Object.hasOwn(result.tasks.items[0], "penaltyAmount"), false);
  assert.equal(result.tasks.nextCursor, "next");
  assert.deepEqual(list.mock.calls[0]?.arguments[1], { owner: target, sort: "latest", limit: 2, cursor: "cursor" });
});

test("report retries return a single receipt and a changed payload with the same key is rejected", async t => {
  const friends = new KyselyFriendshipRepository();
  const access = t.mock.method(friends, "areFriends", () => Promise.resolve(true));
  let saved: UserReport | null = null;
  let writes = 0;
  const reports: UserReportRepository = {
    findByKey: () => Promise.resolve(saved),
    insert: (_tx, report) => { saved = report; writes++; return Promise.resolve(true); },
  };
  const useCase = new ReportUserUseCase(uow, friends, reports, clock, ids);
  const first = await useCase.execute(input);
  access.mock.mockImplementation(() => Promise.resolve(false));
  assert.deepEqual(await useCase.execute(input), first);
  assert.equal(writes, 1);
  await assert.rejects(useCase.execute({ ...input, detail: "changed" }), e => e instanceof DomainError && e.code === "IDEMPOTENCY_KEY_REUSED");
});

test("unauthorized reports cannot be saved and other reason requires details", async t => {
  const friends = new KyselyFriendshipRepository();
  t.mock.method(friends, "areFriends", () => Promise.resolve(false));
  const reports: UserReportRepository = { findByKey: () => Promise.resolve(null), insert: () => Promise.reject(new Error("must not insert")) };
  const useCase = new ReportUserUseCase(uow, friends, reports, clock, ids);
  await assert.rejects(useCase.execute(input), e => e instanceof DomainError && e.code === "NOT_FOUND");
  assert.throws(() => validateUserReport("other", "  "), DomainError);
  assert.throws(() => validateUserReport("spam", "a".repeat(1001)), DomainError);
  assert.equal(validateUserReport("other", " 理由 "), "理由");
});

test("a concurrent duplicate report recovers the winner receipt", async t => {
  const friends = new KyselyFriendshipRepository();
  t.mock.method(friends, "areFriends", () => Promise.resolve(true));
  let reads = 0;
  const winner: UserReport = { id: "55555555-5555-4555-8555-555555555555", reporterId: viewer, targetUserId: target, reason: input.reason, detail: input.detail, key: input.idempotencyKey, createdAt: now };
  const reports: UserReportRepository = { findByKey: () => Promise.resolve(++reads === 1 ? null : winner), insert: () => Promise.resolve(false) };
  assert.deepEqual(await new ReportUserUseCase(uow, friends, reports, clock, ids).execute(input), { id: winner.id, createdAt: now });
});
