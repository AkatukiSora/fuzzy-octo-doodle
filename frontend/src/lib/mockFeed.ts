import type { FeedPost } from "../types/feed";

// 未接続のレビュー・異議画面だけで使う表示用サンプル。API 応答には使用しない。

export const mockPosts: FeedPost[] = [
  {
    id: "post-1",
    taskId: "task-1",
    userName: "さくら",
    timeAgo: "2時間前",
    taskTitle: "毎朝30分散歩する",
    status: "達成！",
    statusKey: "success",
    reactions: [
      { type: "support", emoji: "👏", count: 3 },
      { type: "fire", emoji: "🔥", count: 1 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
  {
    id: "post-2",
    taskId: "task-2",
    userName: "たくみ",
    timeAgo: "昨日",
    taskTitle: "毎日英単語を20個覚える",
    status: "進行中",
    statusKey: "active",
    deadlineAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    reactions: [
      { type: "support", emoji: "👏", count: 0 },
      { type: "fire", emoji: "🔥", count: 2 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
  {
    id: "post-3",
    taskId: "task-3",
    userName: "ゆい",
    timeAgo: "3時間前",
    taskTitle: "週に3回、筋トレする",
    status: "審査中",
    statusKey: "reviewing",
    reviewEndsAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
    reactions: [
      { type: "support", emoji: "👏", count: 0 },
      { type: "fire", emoji: "🔥", count: 0 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
  {
    id: "post-4",
    taskId: "task-4",
    userName: "はると",
    timeAgo: "5時間前",
    taskTitle: "寝る前に本を読む",
    status: "達成！",
    statusKey: "success",
    reactions: [
      { type: "support", emoji: "👏", count: 0 },
      { type: "fire", emoji: "🔥", count: 0 },
      { type: "congrats", emoji: "🎉", count: 0 },
      { type: "laugh", emoji: "😂", count: 0 },
    ],
  },
];
