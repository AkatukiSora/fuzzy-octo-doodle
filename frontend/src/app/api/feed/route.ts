import { NextResponse } from "next/server";
import type { FeedPost, FeedResponse } from "../../../types/feed";

// 仮の期限日時を「現在から何時間後」としてISO形式で作る。
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// 投稿一覧APIが返すデータの仮データ。taskIdで異議一覧と結び付ける。
const mockPosts: FeedPost[] = [
  {
    id: "post-1",
    taskId: "task-1",
    userName: "さくら",
    timeAgo: "2時間前",
    taskTitle: "毎朝30分散歩する",
    status: "達成！",
    reactions: [
      { emoji: "👏", count: 3 },
      { emoji: "🔥", count: 1 },
    ],
  },
  {
    id: "post-2",
    taskId: "task-2",
    userName: "たくみ",
    timeAgo: "昨日",
    taskTitle: "毎日英単語を20個覚える",
    status: "進行中",
    deadlineAt: hoursFromNow(5 * 24),
    reactions: [{ emoji: "🔥", count: 2 }],
  },
  {
    id: "post-3",
    taskId: "task-3",
    userName: "ゆい",
    timeAgo: "3時間前",
    taskTitle: "週に3回、筋トレする",
    status: "審査中",
    reviewEndsAt: hoursFromNow(18),
    reactions: [{ emoji: "💪", count: 4 }],
  },
  {
    id: "post-4",
    taskId: "task-4",
    userName: "はると",
    timeAgo: "5時間前",
    taskTitle: "寝る前に本を読む",
    status: "達成！",
    reactions: [],
  },
];

export function GET() {
  // 投稿一覧をページ形式で返す。仮データは全件返すため次ページはない。
  const response: FeedResponse = {
    items: mockPosts,
    nextCursor: null,
  };

  return NextResponse.json(response);
}
