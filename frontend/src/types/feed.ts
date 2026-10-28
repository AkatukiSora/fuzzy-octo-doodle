export type FeedFilter = "all" | "objected";

export interface FeedReaction {
  emoji: string;
  count: number;
  reacted?: boolean;
}

export interface FeedPost {
  id: string;
  userName: string;
  avatarUrl?: string;
  timeAgo: string;
  taskTitle: string;
  status: string;
  remainingTime?: string;
  reactions: FeedReaction[];
}

export interface FeedResponse {
  items: FeedPost[];
  nextCursor: string | null;
}
