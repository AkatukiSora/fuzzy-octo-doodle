import { z } from "zod";

const userSchema = z.object({ userId: z.uuid(), nickname: z.string().min(1) });
const requestSchema = z.object({
  id: z.uuid(),
  requester: userSchema,
  addressee: userSchema,
  requestedAt: z.iso.datetime(),
});

export type FriendUser = z.infer<typeof userSchema>;
export type FriendRequestItem = z.infer<typeof requestSchema>;
export type InviteStatus = "ready" | "self" | "outgoing" | "incoming" | "friends" | "login";

export class FriendsApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status === 401 ? "ログインしてからお試しください。" : "フレンド情報を取得・更新できませんでした。時間をおいて再度お試しください。");
    this.status = status;
  }
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...options, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new FriendsApiError(response.status);
  return response.status === 204 ? null : response.json();
}

export async function fetchFriends(signal?: AbortSignal): Promise<FriendUser[]> {
  return z.array(userSchema).parse(await request("/api/friends", { signal: signal ?? null }));
}

export async function fetchFriendRequests(direction: "incoming" | "outgoing", signal?: AbortSignal): Promise<FriendRequestItem[]> {
  return z.array(requestSchema).parse(await request(`/api/friend-requests?direction=${direction}`, { signal: signal ?? null }));
}

export async function fetchInviter(token: string, signal?: AbortSignal): Promise<FriendUser> {
  return userSchema.parse(await request(`/api/friend-invites/${encodeURIComponent(token)}`, { signal: signal ?? null }));
}

export async function fetchInviteStatus(inviterId: string, signal?: AbortSignal): Promise<InviteStatus> {
  try {
    const me = z.object({ id: z.uuid() }).parse(await request("/api/me", { signal: signal ?? null }));
    if (me.id === inviterId) return "self";
    const [friends, incoming, outgoing] = await Promise.all([
      fetchFriends(signal), fetchFriendRequests("incoming", signal), fetchFriendRequests("outgoing", signal),
    ]);
    return inviteStatusFor(inviterId, friends, incoming, outgoing);
  } catch (error) {
    if (error instanceof FriendsApiError && error.status === 401) return "login";
    throw error;
  }
}

export function inviteStatusFor(inviterId: string, friends: FriendUser[], incoming: FriendRequestItem[], outgoing: FriendRequestItem[]): InviteStatus {
  if (friends.some(friend => friend.userId === inviterId)) return "friends";
  if (outgoing.some(item => item.addressee.userId === inviterId)) return "outgoing";
  if (incoming.some(item => item.requester.userId === inviterId)) return "incoming";
  return "ready";
}

export async function sendFriendRequest(token: string, idempotencyKey: string): Promise<FriendRequestItem> {
  return requestSchema.parse(await request("/api/friend-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ inviteToken: token }),
  }));
}

export async function respondToFriendRequest(id: string, action: "accept" | "reject"): Promise<void> {
  await request(`/api/friend-requests/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}
