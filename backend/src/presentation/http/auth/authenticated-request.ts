import type { UserId } from "../../../domain/shared/ids.ts";

/**
 * 責務: 認証ガードが「このリクエストは誰のものか」を載せる入れ物の型。Express の Request のうち、認証が使う部分だけを表す。
 *
 * 全体の流れ: SessionAuthGuard が検証に成功すると `userId` を代入する
 * → `@CurrentUser()` が読み取ってコントローラの引数にする。認証前や `@Public()` のエンドポイントでは `userId` がない。
 */
export interface AuthenticatedRequest {
  /** 認証済みの利用者。SessionAuthGuard だけが書き込む */
  userId?: UserId;
  /** HTTP メソッド。OriginGuard が「状態を変えるリクエストか」の判定に使う */
  readonly method: string;
  /** リクエストヘッダ。OriginGuard が `Origin` を読む */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}
