import { Module } from "@nestjs/common";
import type { CanActivate } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { CLOCK } from "../application/ports/clock.port.ts";
import type { Clock } from "../application/ports/clock.port.ts";
import { SESSION_AUTHENTICATOR } from "../application/ports/session.port.ts";
import type { SessionAuthenticator } from "../application/ports/session.port.ts";
import type { UserId } from "../domain/shared/ids.ts";
import type { Kysely } from "kysely";
import type { Database } from "../infrastructure/db/schema.ts";
import { BETTER_AUTH, createBetterAuth, loadAuthConfig } from "../infrastructure/auth/better-auth.ts";
import type { DoneeAuth } from "../infrastructure/auth/better-auth.ts";
import { DbSessionAuthenticator } from "../infrastructure/auth/session-authenticator.ts";
import { DevAuthGuard } from "../presentation/http/auth/dev-auth.guard.ts";
import { OriginGuard } from "../presentation/http/auth/origin.guard.ts";
import { SessionAuthGuard } from "../presentation/http/auth/session-auth.guard.ts";
import { loadDevAuthUserId } from "./dev-auth.ts";
import { DATABASE, PersistenceModule } from "./persistence.module.ts";

/** 開発用の固定利用者（`UserId`）か、使わないことを表す `null` を渡す DI のトークン */
const DEV_AUTH_USER = Symbol("DEV_AUTH_USER");

/**
 * 1 つ目の `APP_GUARD`（CSRF の Origin 検証）を作る。
 * 開発用の認証が有効なとき (`devUser` が UserId) は、何も検証せず通すガードにする。無効なら本物の `OriginGuard`。
 */
function createOriginGuard(devUser: UserId | null): CanActivate {
  if (devUser === null) return new OriginGuard(loadAuthConfig(process.env).origin);
  return { canActivate: () => true };
}

/**
 * 2 つ目の `APP_GUARD`（認証）を作る。
 * 開発用の認証が有効なとき (`devUser` が UserId) は、常にその利用者として通す `DevAuthGuard`。無効なら本物の `SessionAuthGuard`。
 */
function createAuthGuard(
  devUser: UserId | null,
  reflector: Reflector,
  authenticator: SessionAuthenticator,
  clock: Clock,
): CanActivate {
  if (devUser === null) return new SessionAuthGuard(reflector, authenticator, clock);
  return new DevAuthGuard(reflector, devUser);
}

/**
 * 責務: 認証まわりの DI の登録。セッション検証の実装を束縛し、2 つのガードを全エンドポイントに適用する。
 *
 * 全体の流れ: リクエスト → OriginGuard → SessionAuthGuard → コントローラ。
 * `APP_GUARD` で登録したガードは、機能モジュール（tasks など）のコントローラにも適用される。
 * 登録の順がガードの実行順になるため、OriginGuard を先に置いている。
 * `@Public()` が付いたエンドポイントだけ、SessionAuthGuard が検証を省く（OriginGuard は省かない）。
 *
 * 開発用の認証: 環境変数 `DEV_AUTH_USER_ID` を設定すると、2 つのガードの代わりに、認証が必要なエンドポイントを
 * 常にその利用者として通す `DevAuthGuard` を使う（Origin の検証も省く）。既存テスト・明示的な開発用途だけに残し、
 * `NODE_ENV=production` では設定できない（`loadDevAuthUserId`）。設定しなければ、本物のガードがそのまま動く。
 */
@Module({
  imports: [PersistenceModule],
  providers: [
    { provide: BETTER_AUTH, useFactory: (db: Kysely<Database>) => createBetterAuth(db, loadAuthConfig(process.env)), inject: [DATABASE] },
    { provide: SESSION_AUTHENTICATOR, useFactory: (auth: DoneeAuth) => new DbSessionAuthenticator(auth), inject: [BETTER_AUTH] },
    { provide: DEV_AUTH_USER, useFactory: (): UserId | null => loadDevAuthUserId(process.env) },
    { provide: APP_GUARD, inject: [DEV_AUTH_USER], useFactory: createOriginGuard },
    { provide: APP_GUARD, inject: [DEV_AUTH_USER, Reflector, SESSION_AUTHENTICATOR, CLOCK], useFactory: createAuthGuard },
  ],
})
export class AuthModule {}
