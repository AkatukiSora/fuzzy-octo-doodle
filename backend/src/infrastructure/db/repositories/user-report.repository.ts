import type { UserReportRepository } from "../../../application/ports/user-report.repository.ts";
import type { Tx } from "../../../application/ports/unit-of-work.port.ts";
import type { UserReport } from "../../../domain/friendship/user-report.ts";
import { USER_REPORT_REASONS } from "../../../domain/friendship/user-report.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { parseUserId } from "../../../domain/shared/id-parsers.ts";
import type { IdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { parseIdempotencyKey } from "../../../domain/shared/idempotency.ts";
import { dbOf } from "../tx.ts";
import { insertUnlessDuplicate } from "../errors.ts";

export class KyselyUserReportRepository implements UserReportRepository {
  async findByKey(tx: Tx, reporter: UserId, key: IdempotencyKey): Promise<UserReport | null> {
    const row = await dbOf(tx).selectFrom("user_reports").selectAll().where("reporter_id", "=", reporter).where("idempotency_key", "=", key).executeTakeFirst();
    if (row === undefined) return null;
    const reason = USER_REPORT_REASONS.find(value => value === row.reason_type);
    if (reason === undefined) throw new Error("Invalid user report reason in database");
    return { id: row.id, reporterId: parseUserId(row.reporter_id), targetUserId: parseUserId(row.target_user_id), reason, detail: row.reason_detail, key: parseIdempotencyKey(row.idempotency_key), createdAt: row.created_at };
  }
  insert(tx: Tx, report: UserReport): Promise<boolean> {
    return insertUnlessDuplicate(tx, q => q.insertInto("user_reports").values({ id: report.id, reporter_id: report.reporterId, target_user_id: report.targetUserId, reason_type: report.reason, reason_detail: report.detail, idempotency_key: report.key, created_at: report.createdAt }).execute());
  }
}
