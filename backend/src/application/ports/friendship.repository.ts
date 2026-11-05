import type { BlockedFriendship, Friendship, PendingFriendship } from "../../domain/friendship/friendship.ts";
import type { FriendInvite } from "../../domain/friendship/friend-invite.ts";
import type { FriendshipId, UserId } from "../../domain/shared/ids.ts";
import type { Tx } from "./unit-of-work.port.ts";

export interface FriendshipRepository {
  findById(tx: Tx, id: FriendshipId, opts?: { forUpdate?: boolean }): Promise<Friendship | null>;
  /** 順序非依存のペア検索。同時申請の競合対策として forUpdate を指定できる */
  findByPair(tx: Tx, a: UserId, b: UserId, opts?: { forUpdate?: boolean }): Promise<Friendship | null>;
  /** 新規は insert、既存は update。ペア一意制約違反は DomainError('ALREADY_EXISTS') に変換する */
  save(tx: Tx, f: Friendship): Promise<void>;

  areFriends(tx: Tx, a: UserId, b: UserId): Promise<boolean>;
  countFriends(tx: Tx, user: UserId): Promise<number>;
  listFriendIds(tx: Tx, user: UserId): Promise<UserId[]>;
  listIncomingPending(tx: Tx, user: UserId): Promise<PendingFriendship[]>;
  listOutgoingPending(tx: Tx, user: UserId): Promise<PendingFriendship[]>;
  listBlockedBy(tx: Tx, user: UserId): Promise<BlockedFriendship[]>;
}
export const FRIENDSHIP_REPOSITORY = Symbol("FriendshipRepository");

export interface FriendInviteRepository {
  /** 招待者の有効な招待を取得（なければ null） */
  findActiveByInviter(tx: Tx, inviter: UserId): Promise<FriendInvite | null>;
  findActiveByToken(tx: Tx, token: string): Promise<FriendInvite | null>;
  insert(tx: Tx, invite: FriendInvite): Promise<void>;
}
export const FRIEND_INVITE_REPOSITORY = Symbol("FriendInviteRepository");
