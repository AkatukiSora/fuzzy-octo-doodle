import { NextResponse } from "next/server";
import type { FeedFilter, FeedPost, FeedResponse } from "../../../types/feed";

type MockFeedPost = FeedPost & { objected: boolean };

const mockPosts: MockFeedPost[] = [
  {
    id: "post-1",
    userName: "さくら",
    timeAgo: "2時間前",
    taskTitle: "毎朝30分散歩する",
    status: "達成！",
    remainingTime: "達成済み",
    reactions: [
      { emoji: "👏", count: 3 },
      { emoji: "🔥", count: 1 },
    ],
    objected: false,
  },
  {
    id: "post-2",
    userName: "たくみ",
    timeAgo: "昨日",
    taskTitle: "毎日英単語を20個覚える",
    status: "進行中",
    remainingTime: "あと5日",
    reactions: [{ emoji: "🔥", count: 2 }],
    objected: true,
  },
  {
    id: "post-3",
    userName: "ゆい",
    timeAgo: "3時間前",
    taskTitle: "週に3回、筋トレする",
    status: "審査中",
    remainingTime: "確認中",
    reactions: [{ emoji: "💪", count: 4 }],
    objected: false,
  },
  {
    id: "post-4",
    userName: "はると",
    timeAgo: "5時間前",
    taskTitle: "寝る前に本を読む",
    status: "達成！",
    remainingTime: "達成済み",
    reactions: [],
    objected: true,
  },
];

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedFilter = searchParams.get("filter") ?? "all";

  if (requestedFilter !== "all" && requestedFilter !== "objected") {
    return NextResponse.json(
      { message: "filterはallまたはobjectedを指定してください。" },
      { status: 400 },
    );
  }

  const filter: FeedFilter = requestedFilter;
  const filteredPosts = mockPosts.filter(
    (post) => filter === "all" || post.objected,
  );
  const response: FeedResponse = {
    items: filteredPosts.map(({ objected: _objected, ...post }) => post),
    nextCursor: null,
  };

  return NextResponse.json(response);
}
