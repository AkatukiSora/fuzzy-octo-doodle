import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Kysely } from "kysely";
import { z } from "zod";
import { parseNickname } from "../../domain/user/user.ts";
import type { Database } from "../db/schema.ts";

export const BETTER_AUTH = Symbol("BetterAuth");
export const TERMS_VERSION = "2026-11-10";
export const PRIVACY_VERSION = "2026-11-10";
// Development only: a restart invalidates sessions unless a persistent secret is supplied.
const developmentSecret = randomBytes(32).toString("hex");

export function loadAuthConfig(env: NodeJS.ProcessEnv) {
  if (env["BETTER_AUTH_SECRET"] && env["BETTER_AUTH_SECRET_FILE"]) {
    throw new Error("BETTER_AUTH_SECRET と BETTER_AUTH_SECRET_FILE は同時に指定できません");
  }
  const secretFile = env["BETTER_AUTH_SECRET_FILE"];
  const secret = env["BETTER_AUTH_SECRET"] ?? (secretFile ? readFileSync(secretFile, "utf8").trim() : undefined);
  const production = env["NODE_ENV"] === "production";
  if ((production && !secret) || (secret !== undefined && secret.length < 32)) {
    throw new Error("BETTER_AUTH_SECRET は32文字以上で指定してください");
  }
  const url = new URL(env["BETTER_AUTH_URL"] ?? "http://localhost:3000");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (production ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol))) {
    throw new Error("BETTER_AUTH_URL は公開オリジンを指定してください（本番はHTTPS必須）");
  }
  return { secret: secret ?? developmentSecret, origin: url.origin, secure: url.protocol === "https:" };
}

export type AuthConfig = ReturnType<typeof loadAuthConfig>;

export function createBetterAuth(db: Kysely<Database>, config: AuthConfig) {
  return betterAuth({
    appName: "Donee",
    secret: config.secret,
    baseURL: config.origin,
    basePath: "/api/auth",
    trustedOrigins: [config.origin],
    database: { db, type: "postgres", transaction: true },
    emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 8, maxPasswordLength: 128 },
    user: {
      modelName: "auth_users",
      additionalFields: {
        termsAccepted: { type: "boolean", required: true },
        termsAcceptedAt: { type: "date", required: true, input: false, defaultValue: () => new Date() },
        termsVersion: { type: "string", required: true, input: false, defaultValue: TERMS_VERSION },
        privacyVersion: { type: "string", required: true, input: false, defaultValue: PRIVACY_VERSION },
      },
    },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 7,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    disabledPaths: ["/delete-user", "/change-email", "/update-user"],
    advanced: {
      database: { generateId: () => randomUUID() },
      useSecureCookies: config.secure,
      defaultCookieAttributes: { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/api" },
    },
    hooks: {
      before: createAuthMiddleware((ctx) => {
        if (ctx.path !== "/sign-up/email") return Promise.resolve();
        const result = z.object({
          termsAccepted: z.literal(true), name: z.string().trim().min(1).max(20),
          termsAcceptedAt: z.never().optional(), termsVersion: z.never().optional(), privacyVersion: z.never().optional(),
        }).safeParse(ctx.body);
        if (!result.success) {
          throw new APIError("BAD_REQUEST", { message: "有効な表示名と利用規約・プライバシーポリシーへの同意が必要です" });
        }
        return Promise.resolve();
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            const accepted = z.object({ termsAccepted: z.literal(true) }).safeParse(user);
            if (!accepted.success) throw new APIError("BAD_REQUEST", { message: "利用規約への同意が必要です" });
            return Promise.resolve({ data: {
              ...user,
              name: parseNickname(user.name),
              termsAcceptedAt: new Date(),
              termsVersion: TERMS_VERSION,
              privacyVersion: PRIVACY_VERSION,
            } });
          },
        },
      },
    },
  });
}

export type DoneeAuth = ReturnType<typeof createBetterAuth>;
