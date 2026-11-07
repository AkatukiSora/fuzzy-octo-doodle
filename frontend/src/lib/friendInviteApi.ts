import { z } from "zod";

const inviteSchema = z.object({ token: z.string().min(1), createdAt: z.iso.datetime() });

export async function fetchFriendInviteUrl(origin: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/friend-invites", {
    method: "POST",
    credentials: "include",
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error("招待リンクを取得できませんでした。");
  const body: unknown = await response.json();
  const invite = inviteSchema.parse(body);
  return new URL("/invite/" + encodeURIComponent(invite.token), origin).href;
}
