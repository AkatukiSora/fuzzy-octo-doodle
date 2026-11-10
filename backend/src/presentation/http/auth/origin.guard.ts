import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { DomainError } from "../../../domain/shared/errors.ts";
import type { AuthenticatedRequest } from "./authenticated-request.ts";

/** 状態を変えない HTTP メソッド。CSRF の対象にならないので、Origin の検証を省く */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 責務: CSRF 対策の 2 層目。状態を変えるリクエスト（GET / HEAD / OPTIONS 以外）の `Origin` ヘッダを検証する。
 * 1 層目はBetter Authが発行するCookieのSameSite=Lax。
 *
 * 全体の流れ: HTTP リクエスト → このガード → SessionAuthGuard → コントローラ。AuthModule が全体に適用する。
 * 認証より先に判定するので、他サイトから誘導されたリクエストは、セッションの検証まで進まない。
 *
 * 更新リクエストにはBETTER_AUTH_URLと一致するOriginを必須にする。
 * 認証ルート自体のCSRF検証はBetter Authが担当する。
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly allowedOrigin: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (request.headers["origin"] !== this.allowedOrigin) {
      throw new DomainError("FORBIDDEN", "リクエスト元を確認できません");
    }
    return true;
  }
}
