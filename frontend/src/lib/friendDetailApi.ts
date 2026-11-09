import { z } from "zod";

const base = {
  id: z.uuid(), title: z.string(), achievementCondition: z.string(),
  deadlineAt: z.iso.datetime(), dueAt: z.iso.datetime(),
  status: z.enum(["active", "reviewing", "disputed", "failed"]),
  viewer: z.literal("friend"),
};
const taskSchema = z.discriminatedUnion("isPenaltyPublic", [
  z.object({ ...base, isPenaltyPublic: z.literal(true), penaltyAmount: z.number() }),
  z.object({ ...base, isPenaltyPublic: z.literal(false), penaltyAmount: z.never().optional() }),
]);
export const activitySchema = z.object({
  friend: z.object({ userId: z.uuid(), nickname: z.string() }),
  stats: z.object({ successRate: z.number().min(0).max(100).nullable(), activeCount: z.number().int().nonnegative(), overdueCount: z.number().int().nonnegative() }),
  tasks: z.object({ items: z.array(taskSchema), nextCursor: z.string().nullable() }),
});
export type FriendActivity = z.infer<typeof activitySchema>;
export type FriendActivityTask = FriendActivity["tasks"]["items"][number];
export type TaskSort = "soonest" | "latest";
export type ReportReason = "harassment" | "spam" | "inappropriate" | "other";
export interface ReportBody { reason: ReportReason; detail: string }

export class FriendDetailError extends Error {
  readonly status: number;
  constructor(status: number) { super("情報を取得・更新できませんでした。"); this.status = status; }
}
async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...options, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new FriendDetailError(response.status);
  return response.status === 204 ? null : response.json();
}
export async function fetchFriendActivity(id: string, sort: TaskSort, signal?: AbortSignal, cursor?: string): Promise<FriendActivity> {
  const query = new URLSearchParams({ sort, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return activitySchema.parse(await request(`/api/friends/${encodeURIComponent(id)}/activity?${query}`, { signal: signal ?? null }));
}
export async function isUserBlocked(id: string, signal?: AbortSignal): Promise<boolean> {
  const users = z.array(z.object({ userId: z.uuid() })).parse(await request("/api/blocked-users", { signal: signal ?? null }));
  return users.some(user => user.userId === id);
}
export async function setUserBlocked(id: string, blocked: boolean): Promise<void> {
  await request(`/api/users/${encodeURIComponent(id)}/block`, { method: blocked ? "POST" : "DELETE" });
}
export async function reportFriend(id: string, body: ReportBody, key: string): Promise<void> {
  z.object({ id: z.uuid(), createdAt: z.iso.datetime() }).parse(await request(`/api/friends/${encodeURIComponent(id)}/report`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body),
  }));
}

export function isTaskOverdue(task: FriendActivityTask, now: number): boolean {
  return task.status === "failed" || ((task.status === "active" || task.status === "disputed") && Date.parse(task.dueAt) < now);
}
