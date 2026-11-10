import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { z } from "zod";
import { PostgresDialect } from "kysely";
import { createApp } from "./composition/create-app.ts";
import { createBetterAuth, loadAuthConfig, PRIVACY_VERSION, TERMS_VERSION } from "./infrastructure/auth/better-auth.ts";
import { createDatabase } from "./infrastructure/db/create-database.ts";

test("production requires HTTPS and a persistent secret", () => {
  assert.throws(() => loadAuthConfig({ NODE_ENV: "production", BETTER_AUTH_URL: "https://donee.example" }));
  assert.throws(() => loadAuthConfig({ NODE_ENV: "production", BETTER_AUTH_SECRET: randomBytes(32).toString("hex") }));
  const config = loadAuthConfig({ NODE_ENV: "production", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "https://donee.example" });
  assert.equal(config.secure, true);
  assert.equal(config.origin, "https://donee.example");
});

// Explicit opt-in. Never consumes DATABASE_* or connects to a deployed database.
test("Better Auth HTTP lifecycle and application authorization", {
  skip: process.env["DONEE_AUTH_TEST_PORT"] === undefined,
}, async (t) => {
  const port = Number(process.env["DONEE_AUTH_TEST_PORT"]);
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
  const envNames = ["DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_SSL_MODE", "OBJECT_STORAGE_DRIVER", "DEV_AUTH_USER_ID", "NODE_ENV", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"];
  const saved = new Map(envNames.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    DATABASE_HOST: "127.0.0.1", DATABASE_PORT: String(port), DATABASE_NAME: "donee_auth_test",
    DATABASE_USER: "postgres", DATABASE_PASSWORD: "", DATABASE_SSL_MODE: "disable",
    OBJECT_STORAGE_DRIVER: "mock", NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  });
  // loadPostgresConfig requires a nonempty value; the isolated container uses trust auth.
  process.env["DATABASE_PASSWORD"] = "isolated-test-only";
  delete process.env["DEV_AUTH_USER_ID"];
  const db = new pg.Pool({ host: "127.0.0.1", port, database: "donee_auth_test", user: "postgres" });
  const app = await createApp();
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const origin = "http://localhost:3000";
    const password = randomBytes(18).toString("hex");
    const email = `${randomUUID()}@example.test`;
    const otherEmail = `${randomUUID()}@example.test`;
    const post = (path: string, body: unknown, cookie = "", requestOrigin = origin) => fetch(`${base}/api${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: requestOrigin, cookie }, body: JSON.stringify(body),
    });
    const get = (path: string, cookie = "") => fetch(`${base}/api${path}`, { headers: { cookie } });
    const cookieOf = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const signup = { name: "認証テスト", email, password, termsAccepted: true };

    await t.test("unauthenticated requests are denied", async () => {
      for (const path of ["/me", "/tasks", `/tasks/${randomUUID()}/evidences`]) {
        assert.equal((await get(path)).status, 401);
      }
    });
    await t.test("consent is required and foreign-origin signup is rejected", async () => {
      for (const termsAccepted of [false, undefined, "true"]) {
        assert.equal((await post("/auth/sign-up/email", { ...signup, termsAccepted })).status, 400);
      }
      assert.equal((await post("/auth/sign-up/email", signup, "", "https://evil.example")).status, 403);
      const count = await db.query<{ count: string }>("SELECT count(*) FROM auth_users WHERE email = $1", [email]);
      assert.equal(count.rows[0]?.count, "0");
    });
    let userId = "";
    await t.test("signup creates a linked profile and records server-controlled consent without logging in", async () => {
      assert.equal((await post("/auth/sign-up/email", { ...signup, termsVersion: "forged", privacyVersion: "forged", termsAcceptedAt: "2000-01-01T00:00:00Z" })).status, 400);
      const res = await post("/auth/sign-up/email", signup);
      assert.equal(res.status, 200, await res.clone().text());
      const body = z.object({ user: z.object({ id: z.uuid() }), token: z.null() }).parse(await res.json());
      userId = body.user.id;
      assert.ok(!res.headers.getSetCookie().some((value) => value.includes("session_token=")));
      const record = await db.query<{ nickname: string; termsVersion: string; privacyVersion: string; termsAcceptedAt: Date }>(
        'SELECT u.nickname, a."termsVersion", a."privacyVersion", a."termsAcceptedAt" FROM users u JOIN auth_users a ON a.id=u.id WHERE u.id=$1', [userId],
      );
      const consent = record.rows[0];
      assert.ok(consent);
      assert.equal(consent.nickname, signup.name);
      assert.equal(consent.termsVersion, TERMS_VERSION);
      assert.equal(consent.privacyVersion, PRIVACY_VERSION);
      assert.ok(consent.termsAcceptedAt.getTime() > Date.now() - 60_000);
      const accounts = await db.query<{ password: string }>('SELECT password FROM auth_accounts WHERE "userId"=$1', [userId]);
      assert.ok(accounts.rows[0]?.password && accounts.rows[0].password !== password);
      assert.equal((await get("/me")).status, 401);
    });
    let cookie = "";
    await t.test("HTTPS production configuration issues Secure cookies", async () => {
      const secureAuth = createBetterAuth(createDatabase(new PostgresDialect({ pool: db })), loadAuthConfig({
        NODE_ENV: "production", BETTER_AUTH_URL: "https://donee.example", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      }));
      const res = await secureAuth.handler(new Request("https://donee.example/api/auth/sign-in/email", {
        method: "POST", headers: { "content-type": "application/json", origin: "https://donee.example" }, body: JSON.stringify({ email, password }),
      }));
      assert.equal(res.status, 200, await res.clone().text());
      const secureCookie = res.headers.getSetCookie().find((value) => value.includes("session_token="));
      assert.ok(secureCookie);
      assert.match(secureCookie, /; Secure/i);
      assert.match(secureCookie, /; HttpOnly/i);
      assert.match(secureCookie, /; SameSite=Lax/i);
    });
    await t.test("login rejects a wrong password and sets an HttpOnly same-site session", async () => {
      assert.equal((await post("/auth/sign-in/email", { email, password: "incorrect-password" })).status, 401);
      const res = await post("/auth/sign-in/email", { email, password, rememberMe: true });
      assert.equal(res.status, 200, await res.clone().text());
      const sessionCookie = res.headers.getSetCookie().find((value) => value.includes("session_token="));
      assert.ok(sessionCookie);
      assert.match(sessionCookie, /HttpOnly/i);
      assert.match(sessionCookie, /SameSite=Lax/i);
      assert.match(sessionCookie, /Path=\/api/i);
      assert.match(sessionCookie, /Max-Age=/i);
      cookie = cookieOf(res);
      const session = await get("/auth/get-session", cookie);
      assert.equal(z.object({ user: z.object({ id: z.string() }) }).parse(await session.json()).user.id, userId);
      assert.equal((await get("/me", cookie)).status, 200);
      assert.equal((await get("/me", cookie)).status, 200);
    });
    let taskId = "";
    await t.test("existing task creation works; unrelated users cannot access task or evidence", async () => {
      const taskRes = await fetch(`${base}/api/tasks`, {
        method: "POST", headers: { cookie, origin, "content-type": "application/json", "idempotency-key": randomUUID() },
        body: JSON.stringify({ title: "認証確認", achievementCondition: "写真を提出", evidenceMethod: "写真", deadlineAt: new Date(Date.now() + 86_400_000).toISOString(), penaltyAmount: 100, isPenaltyPublic: false, originalTaskId: null }),
      });
      assert.equal(taskRes.status, 201, await taskRes.clone().text());
      taskId = z.object({ id: z.string() }).parse(await taskRes.json()).id;
      assert.equal((await get(`/tasks/${taskId}`, cookie)).status, 200);
      assert.equal((await get(`/tasks/${taskId}/evidences`, cookie)).status, 200);
      assert.equal((await post("/auth/sign-up/email", { ...signup, email: otherEmail })).status, 200);
      const otherLogin = await post("/auth/sign-in/email", { email: otherEmail, password });
      assert.equal(otherLogin.status, 200);
      const otherCookie = cookieOf(otherLogin);
      assert.equal((await get(`/tasks/${taskId}`, otherCookie)).status, 404);
      assert.equal((await get(`/tasks/${taskId}/evidences`, otherCookie)).status, 404);
      assert.equal((await post(`/tasks/${taskId}/evidence-upload-sessions`, { submissionType: "initial" }, otherCookie)).status, 403);
    });
    await t.test("CSRF is blocked for business mutations and logout", async () => {
      for (const requestOrigin of ["https://evil.example", "null", ""]) {
        const response = await fetch(`${base}/api/me`, { method: "PATCH", headers: { origin: requestOrigin, cookie, "content-type": "application/json" }, body: JSON.stringify({ nickname: "CSRF" }) });
        assert.equal(response.status, 403);
      }
      assert.equal((await post("/auth/sign-out", {}, cookie, "https://evil.example")).status, 403);
      assert.equal((await get("/me", cookie)).status, 200);
    });
    await t.test("logout revokes the stored session, including replay of the old cookie", async () => {
      assert.equal((await post("/auth/sign-out", {}, cookie)).status, 200);
      assert.equal((await get("/me", cookie)).status, 401);
      assert.equal((await get(`/tasks/${taskId}`, cookie)).status, 401);
    });
    await t.test("expired sessions are refused", async () => {
      const login = await post("/auth/sign-in/email", { email, password });
      assert.equal(login.status, 200);
      const expiredCookie = cookieOf(login);
      await db.query('UPDATE auth_sessions SET "expiresAt"=now()-interval \'1 minute\' WHERE "userId"=$1', [userId]);
      assert.equal((await get("/me", expiredCookie)).status, 401);
    });
    await t.test("credential creation failure rolls back the auth user and application profile", async () => {
      // A test-only trigger simulates a late database failure in the isolated DB.
      await db.query(`CREATE FUNCTION auth_test_reject_account() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM auth_users WHERE id=NEW."userId" AND name='登録失敗テスト') THEN
            RAISE EXCEPTION 'isolated test: reject credential';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER auth_test_reject_account BEFORE INSERT ON auth_accounts
        FOR EACH ROW EXECUTE FUNCTION auth_test_reject_account();`);
      try {
        const res = await post("/auth/sign-up/email", { ...signup, name: "登録失敗テスト", email: `${randomUUID()}@example.test` });
        assert.ok(res.status >= 400);
        const rows = await db.query<{ count: string }>("SELECT count(*) FROM users WHERE nickname='登録失敗テスト'");
        assert.equal(rows.rows[0]?.count, "0");
        const users = await db.query<{ count: string }>("SELECT count(*) FROM auth_users WHERE name='登録失敗テスト'");
        assert.equal(users.rows[0]?.count, "0");
      } finally {
        await db.query("DROP TRIGGER auth_test_reject_account ON auth_accounts; DROP FUNCTION auth_test_reject_account()");
      }
    });
  } finally {
    await app.close();
    await db.end();
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  }
});
