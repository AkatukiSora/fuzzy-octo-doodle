import type { UserId } from "../../../domain/shared/ids.ts";
import type { FriendTaskView } from "../../../domain/task/task-view.ts";
import type { UserSummary } from "../../../domain/friendship/friend-views.ts";
import type { FriendActivityCounts } from "../friend-activity.repository.ts";
import type { Page } from "../task.repository.ts";

export interface GetFriendActivityInput {
  userId: UserId;
  friendUserId: UserId;
  sort: "soonest" | "latest";
  limit: number;
  cursor?: string;
}
export interface FriendActivityView {
  friend: UserSummary;
  stats: FriendActivityCounts & { successRate: number | null };
  tasks: Page<FriendTaskView & { dueAt: Date }>;
}
