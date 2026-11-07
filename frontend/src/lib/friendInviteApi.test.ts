import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchFriendInviteUrl } from "./friendInviteApi.ts";

test("招待APIに認証付きPOSTを送り、返されたトークンをURLにする", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    assert.equal(url, "/api/friend-invites");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "include");
    assert.equal(init.signal, controller.signal);
    return Promise.resolve(Response.json({ token: "test/a?b", createdAt: "2026-11-07T00:00:00.000Z" }));
  });
  assert.equal(await fetchFriendInviteUrl("https://donee.app", controller.signal), "https://donee.app/invite/test%2Fa%3Fb");
});

for (const status of [401, 404, 500]) {
  test("招待APIのHTTP " + String(status) + "をテストURLで隠さずエラーにする", async (t) => {
    t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status })));
    await assert.rejects(fetchFriendInviteUrl("https://donee.app"), /招待リンクを取得できませんでした/);
  });
}

test("不正な招待レスポンスを拒否する", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json({ token: "" })));
  await assert.rejects(fetchFriendInviteUrl("https://donee.app"));
});
