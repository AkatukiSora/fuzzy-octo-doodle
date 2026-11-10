import { fromNodeHeaders } from "better-auth/node";
import { parseUserId } from "../../domain/shared/id-parsers.ts";
import type { SessionAuthenticator } from "../../application/ports/session.port.ts";
import type { UserId } from "../../domain/shared/ids.ts";
import type { DoneeAuth } from "./better-auth.ts";

/**
 * Better Auth公式APIで署名CookieとDBセッションを検証し、既存usersのIDを返す。
 * Cookieキャッシュを使わず、失効・ログアウトを即時反映する。
 */
export class DbSessionAuthenticator implements SessionAuthenticator {
  constructor(private readonly auth: DoneeAuth) {}
  /** 業務APIではCookieを更新せず、Better AuthのセッションAPIが更新を担当する。 */
  async authenticate(headers: Readonly<Record<string, string | string[] | undefined>>, now: Date): Promise<UserId | null> {
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!session || session.session.expiresAt <= now) return null;
    return parseUserId(session.user.id);
  }
}
