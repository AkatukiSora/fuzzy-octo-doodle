import { z } from "zod";
import type { MyStats } from "../../../domain/user/user-view.ts";
import type { User } from "../../../domain/user/user.ts";
import { Body, Controller, Get, HttpCode, Inject, Patch } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { GetMeUseCase } from "../../../application/usecases/me/get-me.usecase.ts";
import { GetMyStatsUseCase } from "../../../application/usecases/me/get-my-stats.usecase.ts";
import { UpdateMeUseCase } from "../../../application/usecases/me/update-me.usecase.ts";

/**
 * 責務: 認証利用者本人のプロフィールと実績に関する HTTP 入出力を受け持つ。入力検証後に UseCase を呼び、業務ルールや保存処理は担わない。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   /api/me を route prefix とし、全体ガードで認証されたリクエストを受ける。
 *   プロフィール取得・更新と実績参照を各 me use case に振り分ける。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */
@Controller("me")
export class MeController {
  constructor(
    @Inject(GetMeUseCase) protected readonly getMe: GetMeUseCase,
    @Inject(GetMyStatsUseCase) protected readonly getMyStats: GetMyStatsUseCase,
    @Inject(UpdateMeUseCase) protected readonly updateMe: UpdateMeUseCase,
  ) {}

  /**
   * 認証利用者本人のプロフィールを返す。
   *
   * HTTP: GET /api/me → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID。
   * 呼び出し先: GetMeUseCase.execute
   * 主な失敗: NOT_FOUND: 認証利用者に対応する User がない。
   */
  @Get("")
  @HttpCode(200)
  show(@CurrentUser() user: UserId): Promise<User> {
    // 見本。このハンドラは入力が認証利用者の ID だけで、検証済みの名目型 (UserId) をそのままユースケースに渡す。
    // 本文やクエリがあるハンドラでは、ここで Zod による検証と、名目型への変換を行ってから渡す。
    return this.getMe.execute({ userId: user });
  }

  /**
   * 認証利用者本人のニックネームを更新する。
   *
   * HTTP: PATCH /api/me → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID と body の nickname。
   * 呼び出し先: UpdateMeUseCase.execute
   * 主な失敗: VALIDATION_ERROR: ニックネームが空、または20文字を超える。
   */
  @Patch("")
  @HttpCode(200)
  update(@CurrentUser() user: UserId, @Body() body: unknown): Promise<User> {
    const { nickname } = z.object({
      nickname: z.string(),
    }).parse(body);

    return this.updateMe.execute({
      userId: user,
      nickname,
    });
  }
  /**
   * 認証利用者本人のタスク実績と達成率を返す。
   *
   * HTTP: GET /api/me/stats → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: @CurrentUser() のセッション利用者 ID。
   * 呼び出し先: GetMyStatsUseCase.execute
   */
    @Get("stats")
  @HttpCode(200)
  statistics(@CurrentUser() user: UserId): Promise<MyStats> {
    return this.getMyStats.execute({ userId: user });
  }
}
