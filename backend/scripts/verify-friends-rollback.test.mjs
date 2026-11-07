import assert from "node:assert/strict";
import test from "node:test";

const rollbackModule = await import("./verify-friends-rollback.mjs").catch(() => ({}));
const rollbackFriendsTestData = rollbackModule.rollbackFriendsTestData;

const fixture = {
  userIds: ["fixture-user-a", "fixture-user-b"],
  taskIds: ["fixture-task"],
  originalDeadlines: [
    { id: "seed-task-a", deadlineAt: "2040-01-02T03:04:05.700693Z" },
    { id: "seed-task-b", deadlineAt: "2040-01-02T03:04:05.700900Z" },
  ],
};

class RecordingDatabase {
  calls = [];
  failOn;

  constructor(failOn) {
    this.failOn = failOn;
  }

  async query(sql, values = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.calls.push({ sql: normalizedSql, values });
    if (normalizedSql === this.failOn) throw new Error("simulated cleanup failure");
    if (normalizedSql.startsWith("SELECT") && normalizedSql.includes("remaining_users")) {
      return {
        rows: [{
          remaining_users: 0,
          remaining_tasks: 0,
          remaining_invites: 0,
          remaining_friendships: 0,
          remaining_notifications: 0,
          remaining_idempotency: 0,
        }],
        rowCount: 1,
      };
    }
    if (normalizedSql.startsWith("SELECT id, to_char")) {
      return {
        rows: fixture.originalDeadlines.map(({ id, deadlineAt }) => ({ id, deadline_at: deadlineAt })),
        rowCount: fixture.originalDeadlines.length,
      };
    }
    return { rows: [], rowCount: 0 };
  }
}

test("rollback removes only this run's rows and restores exact seed timestamps", async () => {
  assert.equal(typeof rollbackFriendsTestData, "function", "rollback routine must be implemented");
  const database = new RecordingDatabase();

  await rollbackFriendsTestData(database, fixture);

  const sql = database.calls.map(({ sql: statement }) => statement);
  assert.equal(sql[0], "BEGIN");
  assert.ok(sql.findIndex((statement) => statement.includes("DELETE FROM notifications")) < sql.findIndex((statement) => statement.includes("DELETE FROM users")));
  assert.ok(sql.findIndex((statement) => statement.includes("DELETE FROM friendships")) < sql.findIndex((statement) => statement.includes("DELETE FROM users")));
  assert.ok(sql.findIndex((statement) => statement.includes("DELETE FROM friend_invites")) < sql.findIndex((statement) => statement.includes("DELETE FROM users")));
  assert.ok(sql.findIndex((statement) => statement.includes("DELETE FROM tasks")) < sql.findIndex((statement) => statement.includes("DELETE FROM users")));
  assert.ok(sql.includes("COMMIT"));
  assert.ok(!sql.some((statement) => statement === "DELETE FROM tasks" || statement === "DELETE FROM users"));

  const taskDelete = database.calls.find(({ sql: statement }) => statement.includes("DELETE FROM tasks"));
  assert.deepEqual(taskDelete?.values, [fixture.taskIds]);
  const friendshipDelete = database.calls.find(({ sql: statement }) => statement.includes("DELETE FROM friendships"));
  assert.deepEqual(friendshipDelete?.values, [fixture.userIds]);
  const inviteDelete = database.calls.find(({ sql: statement }) => statement.includes("DELETE FROM friend_invites"));
  assert.deepEqual(inviteDelete?.values, [fixture.userIds]);
  const notificationDelete = database.calls.find(({ sql: statement }) => statement.includes("DELETE FROM notifications"));
  assert.deepEqual(notificationDelete?.values, [fixture.userIds]);
  const idempotencyDelete = database.calls.find(({ sql: statement }) => statement.includes("DELETE FROM idempotency_requests"));
  assert.deepEqual(idempotencyDelete?.values, [fixture.userIds]);
  const userDelete = database.calls.find(({ sql: statement }) => statement.includes("DELETE FROM users"));
  assert.deepEqual(userDelete?.values, [fixture.userIds]);

  const deadlineUpdates = database.calls.filter(({ sql: statement }) => statement.startsWith("UPDATE tasks SET deadline_at"));
  assert.deepEqual(deadlineUpdates.map(({ values }) => values), [
    ["seed-task-a", "2040-01-02T03:04:05.700693Z"],
    ["seed-task-b", "2040-01-02T03:04:05.700900Z"],
  ]);
});

test("rollback aborts its transaction if cleanup fails", async () => {
  assert.equal(typeof rollbackFriendsTestData, "function", "rollback routine must be implemented");
  const database = new RecordingDatabase("DELETE FROM friendships WHERE user_low_id = ANY($1::varchar[]) OR user_high_id = ANY($1::varchar[])");

  await assert.rejects(rollbackFriendsTestData(database, fixture), /simulated cleanup failure/);

  const sql = database.calls.map(({ sql: statement }) => statement);
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
});
