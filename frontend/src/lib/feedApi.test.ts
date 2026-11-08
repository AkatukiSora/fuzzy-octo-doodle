import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchFeed, parseFeedResponse, sendReaction } from "./feedApi.ts";

// backend/domain/feed/feed-view.ts の JSON 表現。表示用 FeedPost と混同しない。
const item = {
  postId: "post-1",
  postType: "created",
  postedAt: "2026-11-06T04:00:00.000Z",
  author: { userId: "user-1", nickname: "さくら" },
  task: {
    id: "task-1",
    ownerId: "user-1",
    title: "毎朝散歩する",
    achievementCondition: "30分歩く",
    evidenceMethod: "写真",
    deadlineAt: "2026-11-07T04:00:00.000Z",
    createdAt: "2026-11-06T04:00:00.000Z",
    status: "active",
    viewer: "friend",
    isPenaltyPublic: false,
  },
  reactionCounts: { support: 3, fire: 2, congrats: 1, laugh: 0 },
  myReaction: "fire",
};

test("バックエンドの投稿をカードへ渡せる形に変換する", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(Response.json({ items: [item], nextCursor: null })),
  );
  const posts = await fetchFeed(new AbortController().signal);
  const post = posts[0];
  assert.ok(post);
  assert.equal(post.userName.charAt(0), item.author.nickname.charAt(0));
  assert.equal(post.id, item.postId);
  assert.equal(post.taskId, item.task.id);
  assert.equal(post.taskTitle, item.task.title);
  assert.equal(post.deadlineAt, item.task.deadlineAt);
  assert.deepEqual(post.reactions.map(({ type, count, reacted }) => ({ type, count, reacted })), [
    { type: "support", count: 3, reacted: false },
    { type: "fire", count: 2, reacted: true },
    { type: "congrats", count: 1, reacted: false },
    { type: "laugh", count: 0, reacted: false },
  ]);
});

test("異議フィルターを API に渡し、次ページも同じ条件で取得する", async (t) => {
  const requests: URL[] = [];
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), "https://example.test");
    requests.push(url);
    assert.equal(init?.signal, signal);
    return Promise.resolve(Response.json(requests.length === 1
      ? { items: [item], nextCursor: "cursor+/=" }
      : { items: [{ ...item, postId: "post-older" }], nextCursor: null }));
  });
  const posts = await fetchFeed(signal, "objected");
  assert.equal(requests[0]?.searchParams.get("filter"), "objected");
  assert.equal(requests[1]?.searchParams.get("filter"), "objected");
  assert.equal(requests[1].searchParams.get("cursor"), "cursor+/=");
  assert.deepEqual(posts.map((post) => post.id), [item.postId, "post-older"]);
});

test("リアクションを type キーで送信し、本文のない 204 を受け付ける", async (t) => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: input instanceof Request ? input.url : input.toString(), init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  await sendReaction(item.postId, "fire", false);
  await sendReaction(item.postId, "fire", true);
  const [put, remove] = requests;
  assert.ok(put?.init);
  assert.ok(remove?.init);
  assert.equal(put.url, `/api/posts/${item.postId}/reaction`);
  assert.equal(put.init.method, "PUT");
  assert.equal(put.init.body, JSON.stringify({ type: "fire" }));
  assert.equal(remove.init.method, "DELETE");
  assert.equal(remove.init.body, undefined);
});

test("壊れた投稿はカードに渡さず API 境界で拒否する", () => {
  const invalidItems = [
    { ...item, author: {} },
    { ...item, task: { ...item.task, title: null } },
    { ...item, postedAt: "not-a-date" },
    { ...item, reactionCounts: { support: 1 } },
    { ...item, myReaction: "unknown" },
  ];
  for (const invalid of invalidItems) {
    assert.throws(() => parseFeedResponse({ items: [invalid], nextCursor: null }), /形式が不正/);
  }
});

test("投稿時刻を相対表示し、審査期限のない投稿に期限を捏造しない", () => {
  const { items } = parseFeedResponse({
    items: [{ ...item, postType: "reported", task: { ...item.task, status: "reviewing" } }],
    nextCursor: null,
  }, Date.parse(item.postedAt) + 3 * 60 * 60_000);
  const [post] = items;
  assert.ok(post);
  assert.equal(post.timeAgo, "3時間前");
  assert.equal(post.status, "審査中");
  assert.equal(post.activityLabel, "達成報告をしました");
  assert.equal(post.deadlineAt, undefined);
  assert.equal(post.reviewEndsAt, undefined);
});

test("all implemented task statuses retain their typed key for badge colors", () => {
  const statuses = ["active", "reviewing", "disputed", "success", "failed", "indeterminate", "closed"] as const;
  for (const status of statuses) {
    const post = parseFeedResponse({ items: [{ ...item, task: { ...item.task, status } }], nextCursor: null }).items[0];
    assert.ok(post);
    assert.equal(post.statusKey, status);
    assert.ok(post.status);
  }
});
