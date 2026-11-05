import assert from "node:assert/strict";
import { test } from "node:test";
import { CorruptRowError } from "./infrastructure/db/mappers/common.ts";
import { parseResponseBody } from "./infrastructure/db/mappers/idempotency-response.mapper.ts";

/** DB に保存されるのと同じく、JSON 文字列を経由した値にする（Date は ISO 文字列になる） */
function viaJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function ownerTask(deadlineAt: Date | string): unknown {
  return viaJson({
    id: TASK_ID,
    ownerId: USER_ID,
    title: "タイトル",
    achievementCondition: "条件",
    evidenceMethod: "方法",
    deadlineAt,
    status: "active",
    isPenaltyPublic: true,
    createdAt: new Date("2026-10-31T00:00:00.000Z"),
    viewer: "owner",
    penaltyAmount: 1000,
  });
}

test("保存済みの本人向けタスクは、日付が Date に戻る", () => {
  const view = parseResponseBody("complete_evidence_upload", ownerTask(new Date("2026-11-01T00:00:00.000Z")));
  assert.ok(view.deadlineAt instanceof Date);
  assert.equal(view.deadlineAt.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(view.createdAt.toISOString(), "2026-10-31T00:00:00.000Z");
});

test("日時が不正なら CorruptRowError で失敗する", () => {
  assert.throws(() => parseResponseBody("create_task", ownerTask("not-a-date")), CorruptRowError);
});

test("異議の round が 1 か 2 でなければ失敗する", () => {
  const body = viaJson({
    id: TASK_ID,
    taskId: TASK_ID,
    round: 3,
    reasonType: "other",
    reasonDetail: null,
    withdrawn: false,
    createdAt: new Date("2026-10-31T00:00:00.000Z"),
  });
  assert.throws(() => parseResponseBody("create_objection", body), CorruptRowError);
});
test("保存済みのフレンド申請は、日付が Date に戻る", () => {
  const body = viaJson({
    id: TASK_ID,
    requester: { userId: USER_ID, nickname: "a" },
    addressee: { userId: TASK_ID, nickname: "b" },
    requestedAt: new Date("2026-10-31T00:00:00.000Z"),
  });
  const view = parseResponseBody("create_friend_request", body);
  assert.equal(view.requestedAt.toISOString(), "2026-10-31T00:00:00.000Z");
});