import type { UserReport } from "../../domain/friendship/user-report.ts";
import type { UserId } from "../../domain/shared/ids.ts";
import type { IdempotencyKey } from "../../domain/shared/idempotency.ts";
import type { Tx } from "./unit-of-work.port.ts";

export interface UserReportRepository {
  findByKey(tx: Tx, reporter: UserId, key: IdempotencyKey): Promise<UserReport | null>;
  /** 一意制約の競合時はfalse。トランザクションを壊さず保存済み記録を再取得できる。 */
  insert(tx: Tx, report: UserReport): Promise<boolean>;
}
export const USER_REPORT_REPOSITORY = Symbol("UserReportRepository");
