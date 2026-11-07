import assert from "node:assert/strict";

export async function rollbackFriendsTestData(database, fixture) {
  const { userIds, taskIds, originalDeadlines } = fixture;

  await database.query("BEGIN");
  try {
    await database.query("DELETE FROM notifications WHERE user_id = ANY($1::varchar[])", [userIds]);
    await database.query("DELETE FROM idempotency_requests WHERE user_id = ANY($1::varchar[])", [userIds]);
    await database.query(
      `DELETE FROM friendships
       WHERE user_low_id = ANY($1::varchar[])
          OR user_high_id = ANY($1::varchar[])`,
      [userIds],
    );
    await database.query(
      "DELETE FROM friend_invites WHERE inviter_id = ANY($1::varchar[])",
      [userIds],
    );
    await database.query("DELETE FROM tasks WHERE id = ANY($1::varchar[])", [taskIds]);
    await database.query("DELETE FROM users WHERE id = ANY($1::varchar[])", [userIds]);
    for (const { id, deadlineAt } of originalDeadlines) {
      await database.query(
        "UPDATE tasks SET deadline_at = $2::timestamptz WHERE id = $1",
        [id, deadlineAt],
      );
    }
    await database.query("COMMIT");
  } catch (error) {
    try {
      await database.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Fixture cleanup and transaction rollback both failed");
    }
    throw error;
  }

  const remaining = await database.query(
    `SELECT
       (SELECT count(*)::integer FROM users WHERE id = ANY($1::varchar[])) AS remaining_users,
       (SELECT count(*)::integer FROM tasks WHERE id = ANY($2::varchar[])) AS remaining_tasks,
       (SELECT count(*)::integer FROM friend_invites WHERE inviter_id = ANY($1::varchar[])) AS remaining_invites,
       (SELECT count(*)::integer FROM friendships
        WHERE user_low_id = ANY($1::varchar[]) OR user_high_id = ANY($1::varchar[])) AS remaining_friendships,
       (SELECT count(*)::integer FROM notifications WHERE user_id = ANY($1::varchar[])) AS remaining_notifications,
       (SELECT count(*)::integer FROM idempotency_requests WHERE user_id = ANY($1::varchar[])) AS remaining_idempotency`,
    [userIds, taskIds],
  );
  assert.deepEqual(remaining.rows[0], {
    remaining_users: 0,
    remaining_tasks: 0,
    remaining_invites: 0,
    remaining_friendships: 0,
    remaining_notifications: 0,
    remaining_idempotency: 0,
  }, "verification fixtures must be removed");

  const restored = await database.query(
    `SELECT id, to_char(deadline_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deadline_at
     FROM tasks
     WHERE id = ANY($1::varchar[])
     ORDER BY id`,
    [originalDeadlines.map(({ id }) => id)],
  );
  assert.deepEqual(
    restored.rows,
    [...originalDeadlines]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, deadlineAt }) => ({ id, deadline_at: deadlineAt })),
    "seed task deadlines must be restored with microsecond precision",
  );
  console.log("ROLLBACK verified: test rows removed and seed deadlines restored");
}
