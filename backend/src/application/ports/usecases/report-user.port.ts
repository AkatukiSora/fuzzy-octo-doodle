import type { UserId } from "../../../domain/shared/ids.ts";
import type { IdempotencyKey } from "../../../domain/shared/idempotency.ts";
import type { UserReportReason } from "../../../domain/friendship/user-report.ts";

export interface ReportUserInput {
  userId: UserId;
  targetUserId: UserId;
  reason: UserReportReason;
  detail: string;
  idempotencyKey: IdempotencyKey;
}
export interface UserReportReceipt { id: string; createdAt: Date }
