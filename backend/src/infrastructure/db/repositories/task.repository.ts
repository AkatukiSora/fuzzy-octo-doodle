import { sql } from "kysely";
import type { ActiveTask, DisputedTask, ReviewingTask, Task } from "../../../domain/task/task.ts";
import type { TaskId, UserId } from "../../../domain/shared/ids.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import type { ListMyTasksQuery, Page, TaskRepository } from "../../../application/ports/task.repository.ts";
import type { Tx } from "../../../application/ports/unit-of-work.port.ts";
import { decodeCursor, toPage } from "../cursor.ts";
import { nonNull, toNumber } from "../mappers/common.ts";
import { onlyStatus, rowToTask, taskStateColumns, taskToRow } from "../mappers/task.mapper.ts";
import { dbOf } from "../tx.ts";

/** LIKE のワイルドカードをエスケープする（既定のエスケープ文字はバックスラッシュ） */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class KyselyTaskRepository implements TaskRepository {
  async insert(tx: Tx, task: ActiveTask): Promise<void> {
    await dbOf(tx).insertInto("tasks").values(taskToRow(task)).execute();
  }

  async findById(tx: Tx, id: TaskId): Promise<Task | null> {
    const row = await dbOf(tx).selectFrom("tasks").selectAll().where("id", "=", id).executeTakeFirst();
    return row === undefined ? null : rowToTask(row);
  }

  async findByIds(tx: Tx, ids: readonly TaskId[]): Promise<Task[]> {
    if (ids.length === 0) return [];
    const rows = await dbOf(tx).selectFrom("tasks").selectAll().where("id", "in", [...ids]).execute();
    return rows.map(rowToTask);
  }

  async findByIdForUpdate(tx: Tx, id: TaskId): Promise<Task | null> {
    const row = await dbOf(tx).selectFrom("tasks").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    return row === undefined ? null : rowToTask(row);
  }

  async save(tx: Tx, task: Task): Promise<void> {
    await dbOf(tx).updateTable("tasks").set(taskStateColumns(task)).where("id", "=", task.id).execute();
  }

  async countActiveInitial(tx: Tx, owner: UserId): Promise<number> {
    const row = await dbOf(tx)
      .selectFrom("tasks")
      .select((eb) => eb.fn.countAll<string | number | bigint>().as("c"))
      .where("user_id", "=", owner)
      .where("status", "=", "active")
      .executeTakeFirst();
    return row === undefined ? 0 : toNumber(row.c);
  }

  /** ユーザー行の排他ロックで同一ユーザーの作成を直列化する（製品固有のアドバイザリロックを使わない） */
  async lockUserForCreation(tx: Tx, owner: UserId): Promise<void> {
    const row = await dbOf(tx).selectFrom("users").select("id").where("id", "=", owner).forUpdate().executeTakeFirst();
    if (row === undefined) throw new DomainError("NOT_FOUND", "ユーザーが見つかりません");
  }

  async listByOwner(tx: Tx, q: ListMyTasksQuery): Promise<Page<Task>> {
    const active = q.view === "active";
    const cursorColumn = active ? "deadline_at" : "finalized_at";
    let qb = dbOf(tx)
      .selectFrom("tasks")
      .selectAll()
      .select(sql<string>`to_char(${sql.ref(cursorColumn)} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as("cursor_at"))
      .where("user_id", "=", q.owner)
      .where("status", "in", active ? ["active", "reviewing", "disputed"] : ["success", "failed", "indeterminate", "closed"]);
    if (q.status !== undefined) qb = qb.where("status", "=", q.status);
    if (q.search !== undefined && q.search.trim() !== "") {
      const pattern = `%${escapeLike(q.search.trim().toLowerCase())}%`;
      qb = qb.where((eb) => eb(eb.fn<string>("lower", ["title"]), "like", pattern));
    }
    if (q.cursor !== undefined) {
      const c = decodeCursor(q.cursor);
      const cursorAt = sql<Date>`${c.preciseAt ?? c.at.toISOString()}::timestamptz`;
      qb = active
        ? qb.where((eb) => eb.or([eb(eb.ref(cursorColumn), ">", cursorAt), eb.and([eb(eb.ref(cursorColumn), "=", cursorAt), eb("id", ">", c.id)])]))
        : qb.where((eb) => eb.or([eb(eb.ref(cursorColumn), "<", cursorAt), eb.and([eb(eb.ref(cursorColumn), "=", cursorAt), eb("id", "<", c.id)])]));
    }
    qb = active
      ? qb.orderBy("deadline_at", "asc").orderBy("id", "asc")
      : qb.orderBy("finalized_at", "desc").orderBy("id", "desc");
    const rows = await qb.limit(q.limit + 1).execute();
    return toPage(rows, q.limit, rowToTask, (r) => ({
      at: active ? r.deadline_at : nonNull(r.finalized_at, "tasks", "finalized_at"),
      preciseAt: r.cursor_at,
      id: r.id,
    }));
  }

  async lockExpiredInitial(tx: Tx, now: Date, limit: number): Promise<ActiveTask[]> {
    const rows = await dbOf(tx)
      .selectFrom("tasks")
      .selectAll()
      .where("status", "=", "active")
      .where("deadline_at", "<", now)
      .orderBy("deadline_at")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
    return onlyStatus(rows, "active");
  }

  async lockReviewEnded(tx: Tx, now: Date, limit: number): Promise<ReviewingTask[]> {
    const rows = await dbOf(tx)
      .selectFrom("tasks")
      .selectAll()
      .where("status", "=", "reviewing")
      .where("review_deadline_at", "<=", now)
      .orderBy("review_deadline_at")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
    return onlyStatus(rows, "reviewing");
  }

  async lockExpiredAdditional(tx: Tx, now: Date, limit: number): Promise<DisputedTask[]> {
    const rows = await dbOf(tx)
      .selectFrom("tasks")
      .selectAll()
      .where("status", "=", "disputed")
      .where("additional_evidence_deadline_at", "<", now)
      .orderBy("additional_evidence_deadline_at")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
    return onlyStatus(rows, "disputed");
  }
}
