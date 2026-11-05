import type { Friendship, BlockedFriendship, PendingFriendship } from "../../../domain/friendship/friendship.ts";
import type { FriendInvite } from "../../../domain/friendship/friend-invite.ts";
import type { FriendshipId, UserId } from "../../../domain/shared/ids.ts";
import type {
  FriendInviteRepository,
  FriendshipRepository,
} from "../../../application/ports/friendship.repository.ts";
import type { Tx } from "../../../application/ports/unit-of-work.port.ts";
import { rethrowAsDomain } from "../errors.ts";
import { toNumber } from "../mappers/common.ts";
import { canonicalPair, friendshipToRow, rowToFriendship } from "../mappers/friendship.mapper.ts";
import { userId } from "../mappers/ids.ts";
import { rowToInvite } from "../mappers/misc.mapper.ts";
import { dbOf } from "../tx.ts";

export class KyselyFriendshipRepository implements FriendshipRepository {
  async findById(tx: Tx, id: FriendshipId, opts?: { forUpdate?: boolean }): Promise<Friendship | null> {
    let qb = dbOf(tx).selectFrom("friendships").selectAll().where("id", "=", id);
    if (opts?.forUpdate === true) qb = qb.forUpdate();
    const row = await qb.executeTakeFirst();
    return row === undefined ? null : rowToFriendship(row);
  }

  async findByPair(tx: Tx, a: UserId, b: UserId, opts?: { forUpdate?: boolean }): Promise<Friendship | null> {
    const { low, high } = canonicalPair(a, b);
    let qb = dbOf(tx)
      .selectFrom("friendships")
      .selectAll()
      .where("user_low_id", "=", low)
      .where("user_high_id", "=", high);
    if (opts?.forUpdate === true) qb = qb.forUpdate();
    const row = await qb.executeTakeFirst();
    return row === undefined ? null : rowToFriendship(row);
  }

  async save(tx: Tx, f: Friendship): Promise<void> {
    const q = dbOf(tx);
    const row = friendshipToRow(f);
    try {
      const exists = await q.selectFrom("friendships").select("id").where("id", "=", f.id).executeTakeFirst();
      if (exists === undefined) {
        await q.insertInto("friendships").values(row).execute();
      } else {
        await q
          .updateTable("friendships")
          .set({
            requester_id: row.requester_id,
            receiver_id: row.receiver_id,
            status: row.status,
            blocked_by: row.blocked_by,
            requested_at: row.requested_at,
            accepted_at: row.accepted_at,
          })
          .where("id", "=", f.id)
          .execute();
      }
    } catch (e) {
      rethrowAsDomain(e, "すでに関係が存在します");
    }
  }

  async areFriends(tx: Tx, a: UserId, b: UserId): Promise<boolean> {
    const { low, high } = canonicalPair(a, b);
    const row = await dbOf(tx)
      .selectFrom("friendships")
      .select("id")
      .where("user_low_id", "=", low)
      .where("user_high_id", "=", high)
      .where("status", "=", "accepted")
      .executeTakeFirst();
    return row !== undefined;
  }

  async countFriends(tx: Tx, user: UserId): Promise<number> {
    const row = await dbOf(tx)
      .selectFrom("friendships")
      .select((eb) => eb.fn.countAll<string | number | bigint>().as("c"))
      .where("status", "=", "accepted")
      .where((eb) => eb.or([eb("requester_id", "=", user), eb("receiver_id", "=", user)]))
      .executeTakeFirst();
    return row === undefined ? 0 : toNumber(row.c);
  }

  async listFriendIds(tx: Tx, user: UserId): Promise<UserId[]> {
    const rows = await dbOf(tx)
      .selectFrom("friendships")
      .select(["requester_id", "receiver_id"])
      .where("status", "=", "accepted")
      .where((eb) => eb.or([eb("requester_id", "=", user), eb("receiver_id", "=", user)]))
      .execute();
    return rows.map((r) => userId(r.requester_id === user ? r.receiver_id : r.requester_id));
  }

  async listIncomingPending(tx: Tx, user: UserId): Promise<PendingFriendship[]> {
    return this.listPending(tx, "receiver_id", user);
  }

  async listOutgoingPending(tx: Tx, user: UserId): Promise<PendingFriendship[]> {
    return this.listPending(tx, "requester_id", user);
  }

  private async listPending(tx: Tx, column: "receiver_id" | "requester_id", user: UserId): Promise<PendingFriendship[]> {
    const rows = await dbOf(tx)
      .selectFrom("friendships")
      .selectAll()
      .where(column, "=", user)
      .where("status", "=", "pending")
      .orderBy("requested_at", "desc")
      .execute();
    return rows.flatMap((r) => {
      const f = rowToFriendship(r);
      return f.status === "pending" ? [f] : [];
    });
  }

  async listBlockedBy(tx: Tx, user: UserId): Promise<BlockedFriendship[]> {
    const rows = await dbOf(tx)
      .selectFrom("friendships")
      .selectAll()
      .where("status", "=", "blocked")
      .where("blocked_by", "=", user)
      .orderBy("requested_at", "desc")
      .execute();
    return rows.flatMap((r) => {
      const f = rowToFriendship(r);
      return f.status === "blocked" ? [f] : [];
    });
  }
}

export class KyselyFriendInviteRepository implements FriendInviteRepository {
  async findActiveByInviter(tx: Tx, inviter: UserId): Promise<FriendInvite | null> {
    const row = await dbOf(tx)
      .selectFrom("friend_invites")
      .selectAll()
      .where("inviter_id", "=", inviter)
      .where("is_active", "=", true)
      .orderBy("created_at", "asc")
      .limit(1)
      .executeTakeFirst();
    return row === undefined ? null : rowToInvite(row);
  }

  async findActiveByToken(tx: Tx, token: string): Promise<FriendInvite | null> {
    const row = await dbOf(tx)
      .selectFrom("friend_invites")
      .selectAll()
      .where("token", "=", token)
      .where("is_active", "=", true)
      .executeTakeFirst();
    return row === undefined ? null : rowToInvite(row);
  }

  async insert(tx: Tx, invite: FriendInvite): Promise<void> {
    await dbOf(tx)
      .insertInto("friend_invites")
      .values({
        id: invite.id,
        inviter_id: invite.inviterId,
        token: invite.token,
        is_active: invite.isActive,
        created_at: invite.createdAt,
      })
      .execute();
  }
}
