import type { UserId } from "../shared/ids.ts";
import type { IdempotencyKey } from "../shared/idempotency.ts";
import { DomainError } from "../shared/errors.ts";

export const USER_REPORT_REASONS = ["harassment", "spam", "inappropriate", "other"] as const;
export type UserReportReason = typeof USER_REPORT_REASONS[number];
export interface UserReport {
  id: string;
  reporterId: UserId;
  targetUserId: UserId;
  reason: UserReportReason;
  detail: string;
  key: IdempotencyKey;
  createdAt: Date;
}
export function validateUserReport(reason: UserReportReason, detail: string): string {
  const trimmed = detail.trim();
  if (trimmed.length > 1000 || (reason === "other" && trimmed.length === 0)) {
    throw new DomainError("VALIDATION_ERROR", "通報の詳細は1000文字以内で入力してください。「その他」の場合は入力が必要です");
  }
  return trimmed;
}
