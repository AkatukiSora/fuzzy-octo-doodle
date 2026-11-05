import { Inject, Injectable } from "@nestjs/common";
import { blockUser } from "../../../domain/friendship/friendship.ts";
import { parseFriendshipId } from "../../../domain/shared/id-parsers.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { FRIENDSHIP_REPOSITORY } from "../../../application/ports/friendship.repository.ts";
import type { FriendshipRepository } from "../../../application/ports/friendship.repository.ts";
import { ID_GENERATOR } from "../../../application/ports/id-generator.port.ts";
import type { IdGenerator } from "../../../application/ports/id-generator.port.ts";
import type { BlockUserInput } from "../../ports/usecases/block-user.port.ts";

/**
 * 責務: 指定した相手との関係を blocked 状態にする。既存関係の有無を応答で区別せず、ブロック対象の存在を列挙する機能も持たない。
 *
 * 全体の流れ:
 *   POST /api/users/:userId/block
 *     → 全体の Origin・セッションガード → FriendsController.block（対象 ID を検証）
 *     → この execute → FriendshipRepository.findByPair(forUpdate) → domain の blockUser → FriendshipRepository.save → 204。
 *
 * 処理:
 *   1. UnitOfWork.run 内で FriendshipRepository.findByPair(tx, userId, targetUserId, { forUpdate: true }) を呼び、ペアの同時変更を直列化する。
 *   2. clock.now を取得し、blockUser に新しい FriendshipId・利用者・対象・既存関係を渡して blocked 状態を作る。既存の関係がない場合にも同じ遷移関数を使い、状態の有無をレスポンスで分けない。
 *   3. FriendshipRepository.save でブロック状態を保存し、本文なしの null を返す。
 *
 * 失敗:
 *   - DomainError("VALIDATION_ERROR"): 利用者が自分自身をブロックしようとした。
 *   - DomainError("STATE_CONFLICT"): 相手が先に自分をブロックしており、ブロックを上書きできない。
 *
 * 注意:
 *   - blockUser の第 1 引数 newId は、既存の関係がないときだけ使われる。IdGenerator.uuid() で採番した値を FriendshipId にして渡す。
 *
 * この層（application）は NestJS の HTTP を知らない。入力は Input、結果は Output、失敗は DomainError だけで表す。
 */
@Injectable()
export class BlockUserUseCase {
  /** ブロック関係の読み取りと保存をトランザクション内で行う。 */
  protected readonly uow: UnitOfWork;
  /** 新規ブロック関係の requestedAt に使う現在時刻を提供する。 */
  protected readonly clock: Clock;
  /** 利用者ペアの既存関係をロック付きで取得し、ブロック状態を保存する。 */
  protected readonly friendships: FriendshipRepository;
  /** 新規にブロック関係を作るときの FriendshipId を採番する。 */
  protected readonly ids: IdGenerator;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(FRIENDSHIP_REPOSITORY) friendships: FriendshipRepository,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.friendships = friendships;
    this.ids = ids;
  }

  /**
   * 指定した相手との関係を blocked 状態にする。既存関係の有無を応答で区別せず、ブロック対象の存在を列挙する機能も持たない。
   * ペアをロックし、domain のブロック遷移を保存して本文なしで返す。
   */
  execute(input: BlockUserInput): Promise<null> {
    return this.uow.run(async (tx) => {
      const existing = await this.friendships.findByPair(tx, input.userId, input.targetUserId, { forUpdate: true });
      const now = this.clock.now();
      const newId = parseFriendshipId(this.ids.uuid());
      const blocked = blockUser(newId, input.userId, input.targetUserId, existing, now);
      await this.friendships.save(tx, blocked);
      return null;
    });
  }
}
