import type { TaskStatus } from "./task";

export type FeedFilter = "all" | "objected";

export type ReactionType = "support" | "fire" | "congrats" | "laugh";

export interface FeedReaction {
  type: ReactionType;
  emoji: string;
  count: number;
  reacted?: boolean;
}

export interface FeedPost {
  id: string;
  // 異議一覧のtaskIdと投稿を照合するためのID。
  taskId: string;
  userName: string;
  avatarUrl?: string;
  timeAgo: string;
  activityLabel?: string;
  taskTitle: string;
  status: string;
  statusKey: TaskStatus;
  deadlineAt?: string;
  reviewEndsAt?: string;
  reactions: FeedReaction[];
}

export interface FeedResponse {
  items: FeedPost[];
  nextCursor: string | null;
}
