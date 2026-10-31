import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import { changeNickname } from "../../../domain/user/user.ts";
import { UNIT_OF_WORK } from "../../../application/ports/unit-of-work.port.ts";
import type { UnitOfWork } from "../../../application/ports/unit-of-work.port.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { USER_REPOSITORY } from "../../../application/ports/user.repository.ts";
import type { UserRepository } from "../../../application/ports/user.repository.ts";
import type { User } from "../../../domain/user/user.ts";
import type { UpdateMeInput } from "../../ports/usecases/update-me.port.ts";

/**
 * 責務: 認証利用者本人のニックネームを検証して更新する。
 * 認証情報や他利用者のプロフィールは変更しない。
 *
 * 全体の流れ:
 *   PATCH /api/me
 *     → MeController.update
 *     → UpdateMeUseCase.execute
 *     → UserRepository.findById
 *     → changeNickname
 *     → UserRepository.save
 *     → 更新後の User を返す
 *
 * 処理:
 *   1. UnitOfWork.run 内で認証利用者の User を取得する。
 *   2. User が存在しなければ DomainError("NOT_FOUND") を投げる。
 *   3. Clock.now() で現在時刻を取得する。
 *   4. changeNickname() でニックネームを検証・変更する。
 *   5. UserRepository.save() で保存し、更新後の User を返す。
 *
 * 失敗:
 *   - NOT_FOUND: 認証利用者に対応する User が存在しない。
 *   - VALIDATION_ERROR: ニックネームが空、または20文字を超える。
 */
@Injectable()
export class UpdateMeUseCase {
  /** プロフィールの取得と保存を同じトランザクションにまとめる。 */
  protected readonly uow: UnitOfWork;

  /** プロフィールの更新日時に使用する現在時刻を取得する。 */
  protected readonly clock: Clock;

  /** ユーザー情報の取得と保存を行う。 */
  protected readonly users: UserRepository;

  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(CLOCK) clock: Clock,
    @Inject(USER_REPOSITORY) users: UserRepository,
  ) {
    this.uow = uow;
    this.clock = clock;
    this.users = users;
  }

  /**
   * 認証利用者本人のニックネームを更新する。
   *
   * @param input 認証利用者のIDと変更後のニックネーム
   * @returns 更新後のユーザー情報
   */
  execute(input: UpdateMeInput): Promise<User> {
    return this.uow.run(async (tx) => {
      // 1. 認証利用者の情報を取得する
      const user = await this.users.findById(tx, input.userId);

      // 2. ユーザーが存在しない場合はエラー
      if (user === null) {
        throw new DomainError("NOT_FOUND", "利用者が見つかりません");
      }

      // 3. 現在時刻を取得する
      const now = this.clock.now();

      // 4. ニックネームを検証して更新する
      const updatedUser = changeNickname(user, input.nickname, now);

      // 5. 更新後のユーザー情報をDBに保存する
      await this.users.save(tx, updatedUser);

      // 6. 更新後のユーザー情報を返す
      return updatedUser;
    });
  }
}