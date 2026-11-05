import assert from "node:assert/strict";
import { test } from "node:test";
import { hashRequest } from "./application/shared/request-hash.ts";
import { parseTaskId } from "./domain/shared/id-parsers.ts";

const taskId = parseTaskId("11111111-1111-4111-8111-111111111111");
const base = {
  title: "t",
  achievementCondition: "a",
  evidenceMethod: "e",
  deadlineAt: "2026-10-31T12:00:00.000Z",
  penaltyAmount: 100,
  isPenaltyPublic: false,
  originalTaskId: null,
} as const;

test("同じ内容なら、項目の並びが違っても同じハッシュになる", () => {
  const reordered = {
    originalTaskId: null,
    isPenaltyPublic: false,
    penaltyAmount: 100,
    deadlineAt: "2026-10-31T12:00:00.000Z",
    evidenceMethod: "e",
    achievementCondition: "a",
    title: "t",
  };
  assert.equal(hashRequest("create_task", base), hashRequest("create_task", reordered));
});

test("内容が違えば違うハッシュになる（null と値も区別する）", () => {
  assert.notEqual(hashRequest("create_task", base), hashRequest("create_task", { ...base, originalTaskId: taskId }));
  assert.notEqual(hashRequest("create_task", base), hashRequest("create_task", { ...base, title: "t2" }));
  assert.notEqual(
    hashRequest("create_task", base),
    hashRequest("create_task", { ...base, deadlineAt: "2026-11-01T12:00:00.000Z" }),
  );
  assert.notEqual(
    hashRequest("create_task", base),
    hashRequest("create_task", { ...base, penaltyAmount: 200 }),
  );
  assert.notEqual(
    hashRequest("create_task", base),
    hashRequest("create_task", { ...base, isPenaltyPublic: true }),
  );
});

test("ハッシュは SHA-256 の 16 進 64 文字である", () => {
  assert.match(hashRequest("create_task", base), /^[0-9a-f]{64}$/);
});
