import assert from "node:assert/strict";
import { test } from "node:test";
import { needsTaskCountdown, taskRemainingText } from "./task-detail-display.ts";

const now = Date.parse("2026-11-08T12:00:00Z");
const deadline = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

test("remaining time rounds up and switches at minute, hour and day boundaries", () => {
  for (const [minutes, expected] of [
    [0.001, "残り1分"], [1, "残り1分"], [59, "残り59分"],
    [60, "残り1時間 0分"], [200, "残り3時間 20分"],
    [1439, "残り23時間 59分"], [1440, "残り1日 0時間"], [3180, "残り2日 5時間"],
  ] as const) assert.equal(taskRemainingText(deadline(minutes), "active", now), expected);
});

test("at and after the deadline, including subsecond boundaries, time is expired", () => {
  assert.equal(taskRemainingText(deadline(0), "active", now), "期限切れ");
  assert.equal(taskRemainingText(deadline(0), "active", now + 1), "期限切れ");
  assert.equal(taskRemainingText(deadline(0), "active", now - 1), "残り1分");
});

test("equivalent timezone offsets give the same result across the local date boundary", () => {
  assert.equal(taskRemainingText("2026-11-09T00:20:00+09:00", "active", now), "残り3時間 20分");
  assert.equal(taskRemainingText("2026-11-08T15:20:00Z", "active", now), "残り3時間 20分");
});

test("ongoing states use the task deadline and finalized states stop counting down", () => {
  for (const status of ["active", "reviewing", "disputed"] as const) {
    assert.equal(needsTaskCountdown(status), true);
    assert.equal(taskRemainingText(deadline(200), status, now), "残り3時間 20分");
  }
  for (const [status, label] of [["success", "完了"], ["failed", "期限切れ"], ["indeterminate", "判定終了"], ["closed", "終了"]] as const) {
    assert.equal(needsTaskCountdown(status), false);
    assert.equal(taskRemainingText(deadline(200), status, now), label);
  }
  assert.equal(taskRemainingText("invalid", "active", now), "期限不明");
});

test("advancing the clock updates the text without new deadline data", () => {
  assert.equal(taskRemainingText(deadline(61), "active", now), "残り1時間 1分");
  assert.equal(taskRemainingText(deadline(61), "active", now + 60_000), "残り1時間 0分");
  assert.equal(taskRemainingText(deadline(61), "active", now + 61 * 60_000), "期限切れ");
});
