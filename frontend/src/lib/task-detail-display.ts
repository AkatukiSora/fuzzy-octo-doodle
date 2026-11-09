import type { TaskStatus } from "../types/task.ts";

export function needsTaskCountdown(status: TaskStatus): boolean {
  return status === "active" || status === "reviewing" || status === "disputed";
}

/** ISO timestamps from the API represent instants; no local date arithmetic. */
export function taskRemainingText(deadlineAt: string, status: TaskStatus, now: number): string {
  if (status === "success") return "完了";
  if (status === "failed") return "期限切れ";
  if (status === "indeterminate") return "判定終了";
  if (status === "closed") return "終了";
  const difference = Date.parse(deadlineAt) - now;
  if (!Number.isFinite(difference)) return "期限不明";
  if (difference <= 0) return "期限切れ";
  // Round up to avoid showing zero minutes while time remains.
  const minutes = Math.ceil(difference / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  if (days > 0) return `残り${String(days)}日 ${String(hours)}時間`;
  if (minutes >= 60) return `残り${String(Math.floor(minutes / 60))}時間 ${String(minutes % 60)}分`;
  return `残り${String(minutes)}分`;
}
