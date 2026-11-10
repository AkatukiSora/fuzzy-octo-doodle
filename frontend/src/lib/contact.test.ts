import assert from "node:assert/strict";
import test from "node:test";
import type { ContactDraft } from "./contact.ts";
import { validateContact } from "./contact.ts";
import { contactApi } from "./contactApi.ts";
import { inquiryImageError } from "./inquiryImages.ts";

const valid: ContactDraft = { category: "other", subject: "件名", detail: "詳細", images: [] };
test("contact requires a known category and nonblank subject and body", () => {
  assert.deepEqual(validateContact(valid), {});
  assert.deepEqual(Object.keys(validateContact({ category: "unknown", subject: " \n ", detail: " \t", images: [] })), ["category", "subject", "detail"]);
});
test("contact accepts exactly 1000 characters and rejects overflow", () => {
  assert.deepEqual(validateContact({ ...valid, detail: "あ".repeat(1000) }), {});
  assert.ok(validateContact({ ...valid, detail: "あ".repeat(1001) }).detail);
});
test("shared inquiry image validation rejects excess and non-image attachments", () => {
  assert.equal(inquiryImageError(Array.from({ length: 3 }, () => ({ type: "image/png" }))), null);
  assert.ok(inquiryImageError(Array.from({ length: 4 }, () => ({ type: "image/png" }))));
  assert.ok(inquiryImageError([{ type: "image/svg+xml" }]));
  assert.ok(inquiryImageError([{ type: "text/html" }]));
  const images = [new File(["not-an-image"], "text.txt", { type: "text/plain" })];
  assert.ok(validateContact({ ...valid, images }).images);
});
test("unimplemented contact never returns a successful submission or receipt", async () => {
  assert.deepEqual(await contactApi.submit(valid), { kind: "unavailable" });
  assert.deepEqual(await contactApi.completion(), { kind: "unavailable" });
});
