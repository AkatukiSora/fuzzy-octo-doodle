import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "./composition/create-app.ts";

// DB への接続は最初のクエリまで行われない。起動の確認には、形式が正しい接続設定だけあればよい。
process.env["DATABASE_HOST"] = "127.0.0.1";
process.env["DATABASE_NAME"] = "test";
process.env["DATABASE_USER"] = "test";
process.env["DATABASE_PASSWORD"] = "test";
process.env["OBJECT_STORAGE_DRIVER"] = "mock";

let app: INestApplication;
let base = "";

before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
});

after(async () => {
  await app.close();
});

test("GET /healthz returns ok", async () => {
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});
