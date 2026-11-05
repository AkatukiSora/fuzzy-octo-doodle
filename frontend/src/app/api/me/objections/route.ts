import { NextResponse } from "next/server";
import type {
  ObjectionListItem,
  ObjectionListResponse,
} from "../../../../types/feed";

// 自分が出した異議の仮データ。古い申立ても含めて全期間分を保持する。
// 写真情報は含めず、判定確定後の写真が返らない設計を守る。
const mockObjections: ObjectionListItem[] = [
  {
    id: "objection-1",
    taskId: "task-2",
    createdAt: "2026-10-20T09:00:00.000Z",
  },
  {
    id: "objection-2",
    taskId: "task-4",
    createdAt: "2026-06-12T03:30:00.000Z",
  },
  {
    id: "objection-3",
    taskId: "task-archived",
    createdAt: "2024-02-01T12:00:00.000Z",
  },
];

export function GET(request: Request) {
  // limitは1ページの件数、cursorは次に読み始める位置を表す。
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? "2");
  const cursor = searchParams.get("cursor");
  const offset = cursor === null ? 0 : Number(cursor);

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    // ページ指定が不正なら、処理せず400を返す。
    return NextResponse.json(
      { message: "limitまたはcursorの値が不正です。" },
      { status: 400 },
    );
  }

  // cursorの位置からlimit件だけ取り出して、このページのデータにする。
  const items = mockObjections.slice(offset, offset + requestedLimit);
  const nextOffset = offset + items.length;
  const response: ObjectionListResponse = {
    items,
    // まだデータがあれば次の開始位置を返し、最後のページならnullにする。
    nextCursor:
      nextOffset < mockObjections.length ? String(nextOffset) : null,
  };

  return NextResponse.json(response);
}
