import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchFriends, fetchInviter, fetchInviteStatus, FriendsApiError, inviteStatusFor, respondToFriendRequest, sendFriendRequest } from "./friendsApi.ts";

const inviter = { userId: "11111111-1111-4111-8111-111111111111", nickname: "招待者" };
const viewer = { userId: "22222222-2222-4222-8222-222222222222", nickname: "申請者" };
const pending = { id: "33333333-3333-4333-8333-333333333333", requester: viewer, addressee: inviter, requestedAt: "2026-11-09T00:00:00.000Z" };

test("invite status distinguishes pending in both directions and friendship with the correct person", () => {
  assert.equal(inviteStatusFor(inviter.userId, [], [], []), "ready");
  assert.equal(inviteStatusFor(inviter.userId, [], [], [pending]), "outgoing");
  assert.equal(inviteStatusFor(inviter.userId, [], [{ ...pending, requester: inviter, addressee: viewer }], []), "incoming");
  assert.equal(inviteStatusFor(inviter.userId, [inviter], [], []), "friends");
  assert.equal(inviteStatusFor(viewer.userId, [], [], [pending]), "ready");
});

test("public invite lookup encodes tokens and does not turn a server failure into an invalid invite", async (t) => {
  t.mock.method(globalThis, "fetch", (url: string) => {
    assert.equal(url, "/api/friend-invites/a%2Fb%3Fc");
    return Promise.resolve(Response.json(inviter));
  });
  assert.deepEqual(await fetchInviter("a/b?c"), inviter);
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 500 })));
  await assert.rejects(fetchInviter("token"), error => error instanceof FriendsApiError && error.status === 500);
});

test("self and unauthenticated viewers cannot enter the request-ready state", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json({ id: inviter.userId })));
  assert.equal(await fetchInviteStatus(inviter.userId), "self");
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 401 })));
  assert.equal(await fetchInviteStatus(inviter.userId), "login");
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 503 })));
  await assert.rejects(fetchInviteStatus(inviter.userId));
});

test("request creation sends only the invite token with the supplied retry key", async (t) => {
  const keys: string[] = [];
  t.mock.method(globalThis, "fetch", (url: string, options: RequestInit) => {
    assert.equal(url, "/api/friend-requests");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.body, JSON.stringify({ inviteToken: "token" }));
    keys.push(new Headers(options.headers).get("Idempotency-Key") ?? "");
    return Promise.resolve(Response.json(pending, { status: 201 }));
  });
  assert.deepEqual(await sendFriendRequest("token", "retry-key"), pending);
  await sendFriendRequest("token", "retry-key");
  assert.deepEqual(keys, ["retry-key", "retry-key"]);
});

test("acceptance uses the existing endpoint, and failures and malformed lists are surfaced", async (t) => {
  t.mock.method(globalThis, "fetch", (url: string, options: RequestInit) => {
    assert.equal(url, `/api/friend-requests/${pending.id}/accept`);
    assert.equal(options.method, "POST");
    return Promise.resolve(Response.json(pending));
  });
  await respondToFriendRequest(pending.id, "accept");
  t.mock.method(globalThis, "fetch", () => Promise.resolve(new Response(null, { status: 409 })));
  await assert.rejects(sendFriendRequest("token", "key"), error => error instanceof FriendsApiError && error.status === 409);
  t.mock.method(globalThis, "fetch", () => Promise.resolve(Response.json([{ nickname: "missing id" }])));
  await assert.rejects(fetchFriends());
});
