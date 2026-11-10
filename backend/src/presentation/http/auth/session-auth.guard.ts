import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SESSION_AUTHENTICATOR } from "../../../application/ports/session.port.ts";
import type { SessionAuthenticator } from "../../../application/ports/session.port.ts";
import { DomainError } from "../../../domain/shared/errors.ts";
import type { AuthenticatedRequest } from "./authenticated-request.ts";
import { CLOCK } from "../../../application/ports/clock.port.ts";
import type { Clock } from "../../../application/ports/clock.port.ts";
import { IS_PUBLIC_KEY } from "./public.decorator.ts";

/**
 * 責務: すべてのエンドポイントに適用する認証ガード（`@Public()` を除く）。
 * 「セッション Cookie の持ち主が誰か」を確定し、確定できなければ処理を止める。権限の判定（誰が何をできるか）は担当しない。
 *
 * 全体の流れ: HTTP リクエスト → OriginGuard（CSRF）→ このガード → コントローラ。
 * AuthModule が `APP_GUARD` として登録するので、新しいコントローラでも何もせずに適用される。
 * 検証に成功すると `request.userId` が載り、`@CurrentUser()` で読める。
 *
 * リクエストヘッダをSessionAuthenticatorへ渡し、Better AuthがCookieを検証する。
 * 有効なセッションがなければ401、あれば既存users.idをrequest.userIdへ設定する。
 *
 * 依存の理由: `reflector` は `@Public()` の判定、`authenticator` はセッションの検証、`clock` はセッションの有効期限の比較に使う。
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly reflector: Reflector;
  /** Better Authのセッション検証。 */
  protected readonly authenticator: SessionAuthenticator;
  /** 現在時刻。有効期限の判定に使う。 */
  protected readonly clock: Clock;

  constructor(
    @Inject(Reflector) reflector: Reflector,
    @Inject(SESSION_AUTHENTICATOR) authenticator: SessionAuthenticator,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.reflector = reflector;
    this.authenticator = authenticator;
    this.clock = clock;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = await this.authenticator.authenticate(request.headers, this.clock.now());
    if (userId === null) throw new DomainError("UNAUTHENTICATED", "ログインが必要です");
    request.userId = userId;
    return true;
  }
}
