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
  taskTitle: string;
  status: string;
  deadlineAt?: string;
  reviewEndsAt?: string;
  reactions: FeedReaction[];
}

export interface ObjectionListItem {
  id: string;
  // このtaskIdを投稿データと比較して、異議対象の投稿を判別する。
  taskId: string;
  createdAt: string;
}

export interface ObjectionListResponse {
  items: ObjectionListItem[];
  // nullなら最終ページ。それ以外なら次回取得に使うカーソル。
  nextCursor: string | null;
}

export interface FeedResponse {
  items: FeedPost[];
  nextCursor: string | null;
}
