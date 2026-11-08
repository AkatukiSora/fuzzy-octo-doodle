import { z } from "zod";
import type { FeedFilter, FeedPost, FeedResponse, ReactionType } from "../types/feed.ts";

const reactionTypes = z.enum(["support", "fire", "congrats", "laugh"]);
const statusLabels = {
  active: "進行中",
  reviewing: "審査中",
  disputed: "追加証拠待ち",
  success: "達成！",
  failed: "未達成",
  indeterminate: "判定不能",
  closed: "終了",
};
const activityLabels = {
  created: "タスクを作成しました",
  reported: "達成報告をしました",
  failed: "タスクが未達成になりました",
};
const reactionDefinitions: { type: ReactionType; emoji: string }[] = [
  { type: "support", emoji: "👏" },
  { type: "fire", emoji: "🔥" },
  { type: "congrats", emoji: "🎉" },
  { type: "laugh", emoji: "😂" },
];

// backend/domain/feed/feed-view.ts のうちカードで消費する JSON フィールド。
// HTTP 境界で一度だけ検証し、コンポーネントには表示用 FeedPost を渡す。
const feedResponseSchema = z.object({
  items: z.array(z.object({
    postId: z.string().min(1),
    postType: z.enum(["created", "reported", "failed"]),
    postedAt: z.iso.datetime(),
    author: z.object({ nickname: z.string() }),
    task: z.object({
      id: z.string().min(1),
      title: z.string(),
      status: z.enum(["active", "reviewing", "disputed", "success", "failed", "indeterminate", "closed"]),
      deadlineAt: z.iso.datetime(),
    }),
    reactionCounts: z.record(reactionTypes, z.number().int().nonnegative()),
    myReaction: reactionTypes.nullable(),
  })),
  nextCursor: z.string().min(1).nullable(),
});

export function parseFeedResponse(value: unknown, now = Date.now()): FeedResponse {
  const result = feedResponseSchema.safeParse(value);
  if (!result.success) throw new Error("投稿一覧の形式が不正です。");
  return {
    items: result.data.items.map((item) => {
      const minutes = Math.max(0, Math.floor((now - Date.parse(item.postedAt)) / 60_000));
      const timeAgo = minutes < 1 ? "たった今"
        : minutes < 60 ? `${String(minutes)}分前`
        : minutes < 1440 ? `${String(Math.floor(minutes / 60))}時間前`
        : `${String(Math.floor(minutes / 1440))}日前`;
      return {
        id: item.postId,
        taskId: item.task.id,
        userName: item.author.nickname,
        timeAgo,
        activityLabel: activityLabels[item.postType],
        taskTitle: item.task.title,
        status: statusLabels[item.task.status],
        statusKey: item.task.status,
        // FeedItemView は審査期限を返さない。元の達成期限を審査期限に流用しない。
        ...(item.task.status === "active" ? { deadlineAt: item.task.deadlineAt } : {}),
        reactions: reactionDefinitions.map(({ type, emoji }) => ({
          type,
          emoji,
          count: item.reactionCounts[type],
          reacted: item.myReaction === type,
        })),
      };
    }),
    nextCursor: result.data.nextCursor,
  };
}

export async function sendReaction(postId: string, type: ReactionType, reacted: boolean): Promise<void> {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/reaction`, {
    method: reacted ? "DELETE" : "PUT",
    ...(reacted ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    }),
  });
  if (!response.ok) throw new Error("リアクションを送信できませんでした。");
}

export async function fetchFeed(signal: AbortSignal, filter: FeedFilter = "all"): Promise<FeedPost[]> {
  const posts: FeedPost[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ filter, limit: "50" });
    if (cursor !== null) query.set("cursor", cursor);
    const response = await fetch(`/api/feed?${query.toString()}`, { signal });
    if (!response.ok) throw new Error("投稿一覧を取得できませんでした。");
    const data: unknown = await response.json();
    const page = parseFeedResponse(data);
    posts.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return posts;
}
