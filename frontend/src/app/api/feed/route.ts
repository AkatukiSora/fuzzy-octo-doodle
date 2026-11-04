import { NextResponse } from "next/server";
import { getPostsForFeed } from "../../../lib/mockFeed";
import type { FeedResponse } from "../../../types/feed";

export function GET() {
  const response: FeedResponse = {
    items: getPostsForFeed(),
    nextCursor: null,
  };

  return NextResponse.json(response);
}
