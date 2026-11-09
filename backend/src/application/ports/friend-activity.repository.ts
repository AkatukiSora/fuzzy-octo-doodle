import type { UserId } from "../../domain/shared/ids.ts";
import type { UserStats } from "../../domain/user/user.ts";
import type { Task } from "../../domain/task/task.ts";
import type { Page } from "./task.repository.ts";
import type { Tx } from "./unit-of-work.port.ts";

export interface FriendActivityQuery {
  owner: UserId;
  sort: "soonest" | "latest";
  limit: number;
  cursor?: string;
}
export interface FriendActivityCounts extends UserStats {
  activeCount: number;
  overdueCount: number;
}
export interface FriendActivityRepository {
  counts(tx: Tx, owner: UserId, now: Date): Promise<FriendActivityCounts>;
  list(tx: Tx, query: FriendActivityQuery): Promise<Page<Task>>;
}
export const FRIEND_ACTIVITY_REPOSITORY = Symbol("FriendActivityRepository");
