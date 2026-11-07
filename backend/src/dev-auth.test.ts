import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDevAuthUserId } from "./composition/dev-auth.ts";
import { createApp } from "./composition/create-app.ts";

const USER = "11111111-1111-4111-8111-111111111111";

// DB への接続は最初のクエリまで行われない。起動には、形式が正しい接続設定だけあればよい。
process.env["DATABASE_HOST"] = "127.0.0.1";
process.env["DATABASE_NAME"] = "test";
process.env["DATABASE_USER"] = "test";
process.env["DATABASE_PASSWORD"] = "test";
process.env["OBJECT_STORAGE_DRIVER"] = "mock";

test("DEV_AUTH_USER_ID が未設定なら null（本物の認証を使う）", () => {
  assert.equal(loadDevAuthUserId({}), null);
});

test("DEV_AUTH_USER_ID が UUID なら UserId にする", () => {
  assert.equal(loadDevAuthUserId({ DEV_AUTH_USER_ID: USER }), USER);
});

test("DEV_AUTH_USER_ID が UUID でなければ失敗する", () => {
  assert.throws(() => loadDevAuthUserId({ DEV_AUTH_USER_ID: "not-a-uuid" }));
});

test("本番では DEV_AUTH_USER_ID を設定できない", () => {
  assert.throws(() => loadDevAuthUserId({ DEV_AUTH_USER_ID: USER, NODE_ENV: "production" }), /production/);
});

/** 認証が必要なエンドポイント `GET /api/me` を呼び、応答の本文を文字列で返す */
async function callMe(devUserId: string | undefined, method: "GET" | "PATCH"): Promise<string> {
  if (devUserId === undefined) delete process.env["DEV_AUTH_USER_ID"];
  else process.env["DEV_AUTH_USER_ID"] = devUserId;
  const app = await createApp();
  try {
    await app.listen(0, "127.0.0.1");
    const base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    const res = await fetch(`${base}/api/me`, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "PATCH" ? { body: "{}" } : {}),
    });
    return await res.text();
  } finally {
    await app.close();
    delete process.env["DEV_AUTH_USER_ID"];
  }
}

// 骨格の間は、どこで止まったかが応答の本文（未実装の場所の名前）に出る。
// 本物のガードが止めたのなら本文に `SessionAuthGuard` などが入る。それが入らなければ、開発用のガードが通した。

test("DEV_AUTH_USER_ID を設定すると、認証なしで GET がガードを通る", async () => {
  const body = await callMe(USER, "GET");
  assert.ok(!body.includes("SessionAuthGuard"), body);
});

test("DEV_AUTH_USER_ID を設定すると、Origin の検証も省かれ、PATCH もガードを通る", async () => {
  const body = await callMe(USER, "PATCH");
  assert.ok(!body.includes("OriginGuard") && !body.includes("SessionAuthGuard"), body);
});
