import assert from "node:assert/strict";
import test from "node:test";
import { decodeCursor, encodeCursor } from "./infrastructure/db/cursor.ts";

const encodeRaw = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

test("cursor preserves six-digit UTC precision and accepts legacy millisecond cursors", () => {
  const preciseAt = "2026-11-06T10:35:26.700693Z";
  const decoded = decodeCursor(encodeRaw({ t: preciseAt, id: "task-id" }));

  assert.equal(decoded.at.toISOString(), "2026-11-06T10:35:26.700Z");
  assert.equal(decoded.preciseAt, preciseAt);
  assert.deepEqual(JSON.parse(Buffer.from(encodeCursor(decoded), "base64url").toString("utf8")), {
    t: preciseAt,
    id: "task-id",
  });

  const legacy = decodeCursor(encodeRaw({ t: "2026-11-06T10:35:26.700Z", id: "task-id" }));
  assert.equal(legacy.at.toISOString(), "2026-11-06T10:35:26.700Z");
  assert.equal(legacy.preciseAt, "2026-11-06T10:35:26.700Z");
});

test("cursor rejects non-ISO, impossible calendar dates, and unsupported fractional precision", () => {
  for (const t of [
    "November 6, 2026",
    "2026-02-30T10:35:26.700Z",
    "2026-11-06 10:35:26.700Z",
    "2026-11-06T10:35:26.7006931Z",
    "2026-11-06T10:35:26.700+00:00",
  ]) {
    assert.throws(() => decodeCursor(encodeRaw({ t, id: "task-id" })), { code: "VALIDATION_ERROR" });
  }
});
