import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import { parseStoragePath } from "./domain/shared/storage-path.ts";
import { MockPaymentGateway } from "./infrastructure/payment/mock-payment-gateway.ts";
import { MockObjectStorage } from "./infrastructure/storage/mock-object-storage.ts";

const path = parseStoragePath("evidence/abc/photo-1.jpg");

test("モックの保存先は、同一オリジンの検証可能なPUT URLを返す", async () => {
  const storage = new MockObjectStorage();
  const url = await storage.createSignedUploadUrl(path, 300);
  assert.ok(url.startsWith("/api/mock-storage/"));
  assert.equal(storage.authorize(url.slice("/api/mock-storage/".length), "PUT"), path);
});

test("モックの保存先は、未保存の画像を存在すると扱わない", async () => {
  assert.equal(await new MockObjectStorage().exists(path), false);
});

test("モックの決済は、作成前の確認が常に成功する", async () => {
  await new MockPaymentGateway().assertCanCreateTask(parseUserId("11111111-1111-4111-8111-111111111111"));
});

test("モックの決済は、請求の依頼をログに出す", async (t) => {
  const log = t.mock.method(console, "log", () => undefined);
  await new MockPaymentGateway().requestCharge({
    taskId: parseTaskId("22222222-2222-4222-8222-222222222222"),
    userId: parseUserId("11111111-1111-4111-8111-111111111111"),
    amount: 1000,
  });
  assert.equal(log.mock.callCount(), 1);
  assert.match(String(log.mock.calls[0]?.arguments[0]), /"amount":1000/);
});
