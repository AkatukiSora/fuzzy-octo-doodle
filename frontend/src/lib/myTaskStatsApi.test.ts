import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchOngoingTaskCount } from "./myTaskStatsApi.ts";

test("ongoing count follows all pages, excludes expired unsubmitted tasks and retains review tasks", async t => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  t.mock.method(Date, "now", () => now);
  const task = (status: string, offset: number) => ({ status, deadlineAt: new Date(now + offset).toISOString() });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", (url: string) => {
    requests.push(url);
    return Promise.resolve(Response.json(requests.length === 1 ? {
      items: [task("active", 1), task("active", -1), task("disputed", -1), task("reviewing", -1)], nextCursor: "page/2",
    } : { items: [task("disputed", 0)], nextCursor: null }));
  });
  assert.equal(await fetchOngoingTaskCount(), 3);
  assert.deepEqual(requests, ["/api/tasks?view=active&limit=50", "/api/tasks?view=active&limit=50&cursor=page%2F2"]);
});

test("unavailable API does not become a misleading zero count", async t => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 500 })));
  await assert.rejects(fetchOngoingTaskCount(), /取得できませんでした/);
});

test("empty active list displays zero", async t => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json({ items: [], nextCursor: null })));
  assert.equal(await fetchOngoingTaskCount(), 0);
});
