import { z } from "zod";

const pageSchema = z.object({
  items: z.array(z.object({
    status: z.enum(["active", "reviewing", "disputed"]),
    deadlineAt: z.iso.datetime(),
  })),
  nextCursor: z.string().min(1).nullable(),
});

/** 本人の進行中一覧を全ページ取得する。審査中は提出期限を過ぎても進行中として扱う。 */
export async function fetchOngoingTaskCount(signal?: AbortSignal): Promise<number> {
  let cursor: string | null = null;
  let count = 0;
  const now = Date.now();
  do {
    const query = new URLSearchParams({ view: "active", limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/tasks?${query}`, { cache: "no-store", ...(signal ? { signal } : {}) });
    if (!response.ok) throw new Error("進行中のタスク件数を取得できませんでした。");
    const page = pageSchema.parse(await response.json());
    count += page.items.filter(task => task.status === "reviewing" || Date.parse(task.deadlineAt) >= now).length;
    cursor = page.nextCursor;
  } while (cursor);
  return count;
}
