import assert from "node:assert/strict";
import { test } from "node:test";
import { activitySchema, fetchFriendActivity, isTaskOverdue, reportFriend, setUserBlocked, type FriendActivityTask } from "./friendDetailApi.ts";

const task: FriendActivityTask = { id: "11111111-1111-4111-8111-111111111111", title: "金額非公開", achievementCondition: "写真", deadlineAt: "2026-11-09T00:00:00Z", dueAt: "2026-11-10T00:00:00Z", status: "active", viewer: "friend", isPenaltyPublic: false };
const data = { friend: { userId: task.id, nickname: "フレンド" }, stats: { successRate: null, activeCount: 1, overdueCount: 0 }, tasks: { items: [task], nextCursor: "next/cursor" } };

test("friend activity validates private amounts and represents no completion data as null", () => {
  assert.equal(activitySchema.parse(data).stats.successRate, null);
  assert.throws(() => activitySchema.parse({ ...data, tasks: { items: [{ ...task, penaltyAmount: 1234 }], nextCursor: null } }));
  assert.equal(activitySchema.parse(data).tasks.items[0]?.title, "金額非公開");
});

test("sorting and pagination are sent to the real activity API contract", async t => {
  t.mock.method(globalThis, "fetch", (url: string) => {
    assert.equal(url, `/api/friends/${task.id}/activity?sort=latest&limit=20&cursor=next%2Fcursor`);
    return Promise.resolve(Response.json(data));
  });
  await fetchFriendActivity(task.id, "latest", undefined, "next/cursor");
});

test("overdue uses submission deadline, not the original deadline of submitted tasks", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  assert.equal(isTaskOverdue(task, now), false);
  assert.equal(isTaskOverdue({ ...task, dueAt: task.deadlineAt }, now), true);
  assert.equal(isTaskOverdue({ ...task, status: "reviewing", dueAt: task.deadlineAt }, now), false);
  assert.equal(isTaskOverdue({ ...task, status: "disputed", dueAt: task.deadlineAt }, now), true);
  assert.equal(isTaskOverdue({ ...task, status: "failed" }, now), true);
});

test("report keeps the retry key and block/unblock use existing endpoints", async t => {
  t.mock.method(globalThis, "fetch", (url: string, options: RequestInit) => {
    assert.equal(url, `/api/friends/${task.id}/report`);
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), "same-key");
    assert.equal(options.body, JSON.stringify({ reason: "spam", detail: "理由" }));
    return Promise.resolve(Response.json({ id: task.id, createdAt: task.deadlineAt }));
  });
  await reportFriend(task.id, { reason: "spam", detail: "理由" }, "same-key");
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", (url: string, options: RequestInit) => {
    assert.equal(url, `/api/users/${task.id}/block`);
    methods.push(options.method ?? "");
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  await setUserBlocked(task.id, true); await setUserBlocked(task.id, false);
  assert.deepEqual(methods, ["POST", "DELETE"]);
});
