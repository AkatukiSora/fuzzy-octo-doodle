import { sql } from "kysely";
import type { FriendActivityCounts, FriendActivityQuery, FriendActivityRepository } from "../../../application/ports/friend-activity.repository.ts";
import type { Tx } from "../../../application/ports/unit-of-work.port.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { dbOf } from "../tx.ts";
import { decodeCursor, toPage } from "../cursor.ts";
import { toNumber } from "../mappers/common.ts";
import { rowToTask } from "../mappers/task.mapper.ts";

const due = sql<Date>`CASE WHEN status = 'reviewing' THEN review_deadline_at WHEN status = 'disputed' THEN additional_evidence_deadline_at ELSE deadline_at END`;

export class KyselyFriendActivityRepository implements FriendActivityRepository {
  async counts(tx: Tx, owner: UserId, now: Date): Promise<FriendActivityCounts> {
    const row = await dbOf(tx).selectFrom("tasks").where("user_id", "=", owner).select([
      sql<number>`coalesce(sum(case when status = 'success' then 1 else 0 end),0)`.as("success"),
      sql<number>`coalesce(sum(case when status = 'failed' then 1 else 0 end),0)`.as("failed"),
      sql<number>`coalesce(sum(case when status = 'indeterminate' then 1 else 0 end),0)`.as("indeterminate"),
      sql<number>`coalesce(sum(case when status = 'reviewing' or (status = 'active' and deadline_at >= ${now}) or (status = 'disputed' and additional_evidence_deadline_at >= ${now}) then 1 else 0 end),0)`.as("active"),
      sql<number>`coalesce(sum(case when status = 'failed' or (status = 'active' and deadline_at < ${now}) or (status = 'disputed' and additional_evidence_deadline_at < ${now}) then 1 else 0 end),0)`.as("overdue"),
    ]).executeTakeFirstOrThrow();
    return { successCount: toNumber(row.success), failedCount: toNumber(row.failed), indeterminateCount: toNumber(row.indeterminate), activeCount: toNumber(row.active), overdueCount: toNumber(row.overdue) };
  }

  async list(tx: Tx, query: FriendActivityQuery) {
    let q = dbOf(tx).selectFrom("tasks").selectAll()
      .select(due.as("due_at"))
      .select(sql<string>`to_char(${due} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as("cursor_at"))
      .where("user_id", "=", query.owner).where("status", "in", ["active", "reviewing", "disputed"]);
    const ascending = query.sort === "soonest";
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      const at = sql<Date>`${cursor.preciseAt ?? cursor.at.toISOString()}::timestamptz`;
      q = q.where(eb => eb.or([eb(due, ascending ? ">" : "<", at), eb.and([eb(due, "=", at), eb("id", ascending ? ">" : "<", cursor.id)])]));
    }
    const rows = await q.orderBy(due, ascending ? "asc" : "desc").orderBy("id", ascending ? "asc" : "desc").limit(query.limit + 1).execute();
    return toPage(rows, query.limit, rowToTask, row => ({ at: row.due_at, preciseAt: row.cursor_at, id: row.id }));
  }
}
