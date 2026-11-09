import assert from "node:assert/strict";
import test from "node:test";
import type { Payment, PaymentStatus } from "./payments.ts";
import { filterPayments, formatPaymentDate, validateInquiry } from "./payments.ts";
import { paymentReader } from "./paymentApi.ts";

function payment(status: PaymentStatus): Payment {
  return { id: status, status, amount: 500, chargedAt: "2026-11-01T00:00:00Z", reason: "test", method: null, task: { id: "task", title: "test", status: "success", deadlineAt: "2026-10-31T00:00:00Z" }, inquiry: { id: "inquiry", status: "investigating" } };
}
test("filters depend only on payment state; investigation and successful tasks do not imply paid", () => {
  const payments = [payment("paid"), payment("unpaid"), payment("processing"), payment("failed"), payment("cancelled")];
  assert.deepEqual(filterPayments(payments, "completed").map(item => item.id), ["paid"]);
  assert.deepEqual(filterPayments(payments, "incomplete").map(item => item.id), ["unpaid", "processing", "failed"]);
  assert.equal(filterPayments(payments, "all").length, 5);
  assert.deepEqual(filterPayments([], "all"), []);
});
test("inquiry validation enforces reason, nonblank 1–1000 characters and 3 image limit", () => {
  assert.equal(validateInquiry("", "", []).length, 2);
  assert.equal(validateInquiry("other", " \n ", []).length, 1);
  assert.deepEqual(validateInquiry("evidence", "あ".repeat(1000), Array.from({ length: 3 }, () => ({ type: "image/png" }))), []);
  assert.equal(validateInquiry("amount", "あ".repeat(1001), []).length, 1);
  assert.deepEqual(validateInquiry("duplicate", "😀".repeat(1000), []), []);
  assert.equal(validateInquiry("other", "説明", Array.from({ length: 4 }, () => ({ type: "image/jpeg" }))).length, 1);
  assert.equal(validateInquiry("other", "説明", [{ type: "text/html" }]).length, 1);
  assert.equal(validateInquiry("toString", "説明", []).length, 1);
});
test("unimplemented API returns unavailable, never invented history or ID matches", async () => {
  assert.deepEqual(await paymentReader.list(), { kind: "unavailable" });
  assert.deepEqual(await paymentReader.payment("does-not-exist"), { kind: "unavailable" });
  assert.deepEqual(await paymentReader.inquiry("does-not-exist"), { kind: "unavailable" });
});
test("billing dates use JST independent of machine timezone", () => {
  assert.match(formatPaymentDate("2026-11-09T15:00:00Z"), /2026\/11\/10 00:00/);
  assert.equal(formatPaymentDate("bad-date"), "日時不明");
});
