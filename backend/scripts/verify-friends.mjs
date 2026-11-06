#!/usr/bin/env node
/**
 * フレンド詳細API・招待フローの隔離実DB検証スクリプト。
 *
 * 入力: FRIENDS_TEST_DATABASE_URL (postgresql://user:pass@host:port/dbname)
 *   dbname は friends_test_ で始まる必要がある。
 *
 * 前提: migration + seed 済みの専用 DB（friends_test_ prefix）
 * 実行: Nest AppModule + DevAuthGuard で実 HTTP
 */

import assert from "node:assert/strict";

// ── Config ──
const DB_URL = process.env.FRIENDS_TEST_DATABASE_URL;
assert.ok(DB_URL, "FRIENDS_TEST_DATABASE_URL is required");
const url = new URL(DB_URL);
const dbname = url.pathname.replace(/^\//, "");
assert.ok(dbname.startsWith("friends_test_"), `dbname must be friends_test_*, got: ${dbname}`);

process.env.DATABASE_HOST = url.hostname || "127.0.0.1";
process.env.DATABASE_PORT = url.port || "15432";
process.env.DATABASE_NAME = dbname;
process.env.DATABASE_USER = decodeURIComponent(url.username || "hermes");
process.env.DATABASE_PASSWORD = url.password ? decodeURIComponent(url.password) : "socket-auth-dummy";
process.env.DATABASE_SSL_MODE = "disable";
process.env.DEV_AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
process.env.NODE_ENV = "development";

const DEV = "11111111-1111-4111-8111-111111111111";
const TANAKA  = "c1000000-0000-4000-8000-000000000001";
const SATO    = "c1000000-0000-4000-8000-000000000002";
const SUZUKI  = "c1000000-0000-4000-8000-000000000003";
const TAKAHASHI = "c1000000-0000-4000-8000-000000000004";
const ITO       = "c1000000-0000-4000-8000-000000000005";
const STRANGER  = "c1000000-0000-4000-8000-000000000091";

// ── Helpers ──
let passed = 0;
let failed = 0;
const failures = [];
function ok(label, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; failures.push({ label, detail }); console.error(`  ✗ ${label}: ${detail}`); }
}

async function jget(path) {
  const r = await fetch(`${base}${path}`);
  const body = await r.json().catch(() => null);
  return { s: r.status, body };
}
async function jpost(path, body, headers = {}) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = await r.json().catch(() => null);
  return { s: r.status, body: b };
}
function pairId(a, b) { return a < b ? [a, b] : [b, a]; }

// ── Bootstrap ──
console.log("\n=== Bootstrap NestJS ===");
const { createApp } = await import("../src/composition/create-app.ts");
const app = await createApp();
await app.listen(0, "127.0.0.1");
var base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
console.log(`  ${base}`);

const { Client } = await import("pg");
const pg = new Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});
await pg.connect();

try {
  // ================================================================
  // A: GET /api/friends/:userId
  // ================================================================
  console.log("\n─── A: フレンド詳細 API ───");

  // A1: accepted フレンド（田中）→ 200
  {
    const { s, body } = await jget(`/api/friends/${TANAKA}`);
    ok("A1: accepted フレンド詳細 200",
      s === 200 && body?.friend?.userId === TANAKA && body?.friend?.nickname === "フレンド 田中",
      `s=${s} friend=${JSON.stringify(body?.friend)}`);
    ok("A1a: tasks.items は配列",
      Array.isArray(body?.tasks?.items), `type=${typeof body?.tasks?.items}`);
    const statuses = body?.tasks?.items?.map(t => t.status) ?? [];
    ok("A1b: active/reviewing/disputed のみ",
      statuses.every(s => ["active", "reviewing", "disputed"].includes(s)),
      `[${statuses}]`);
  }

  // A2: limit=1 でページング + cursor 継続
  {
    const { s, body } = await jget(`/api/friends/${TANAKA}?limit=1`);
    ok("A2: limit=1 ページング 200", s === 200 && body?.tasks?.items?.length <= 1, ``);
    if (body?.tasks?.nextCursor) {
      const c = encodeURIComponent(body.tasks.nextCursor);
      const { s: s2 } = await jget(`/api/friends/${TANAKA}?limit=1&cursor=${c}`);
      ok("A2a: cursor 継続ページ 200", s2 === 200, `s=${s2}`);
    }
  }

  // A3: 公開/非公開 penaltyAmount
  {
    const { body } = await jget(`/api/friends/${TANAKA}?limit=50`);
    const priv = body?.tasks?.items?.find(t => t.id === "c2000000-0000-4000-8000-000000000012");
    if (priv) {
      ok("A3: 非公開 penaltyAmount キーなし", !Object.hasOwn(priv, "penaltyAmount"), ``);
    }
    const pub = body?.tasks?.items?.find(t => t.id === "c2000000-0000-4000-8000-000000000011");
    if (pub) {
      ok("A3a: 公開 penaltyAmount=700", pub.penaltyAmount === 700, `val=${pub.penaltyAmount}`);
    }
  }

  // A4: 非 friend → 404
  for (const [label, uid] of [["self", DEV], ["pending", TAKAHASHI], ["無関係", STRANGER]]) {
    const { s } = await jget(`/api/friends/${uid}`);
    ok(`A4: ${label} → 404`, s === 404, `s=${s}`);
  }

  // A5: 不正入力 → 400
  for (const [label, path] of [
    ["UUID でない", "/api/friends/not-a-uuid"],
    ["空 cursor", `/api/friends/${TANAKA}?cursor=`],
    ["limit=0", `/api/friends/${TANAKA}?limit=0`],
    ["limit=51", `/api/friends/${TANAKA}?limit=51`],
  ]) {
    const { s } = await jget(path);
    ok(`A5: ${label} → 400`, s === 400, `s=${s}`);
  }

  // A6: 佐藤（フレンド、タスクは既に success/failed → active view で空の可能性）
  {
    const { s, body } = await jget(`/api/friends/${SATO}`);
    ok("A6: 佐藤詳細 200", s === 200 && body?.friend?.userId === SATO, `s=${s}`);
  }

  // ================================================================
  // B: 招待フロー
  // ================================================================
  console.log("\n─── B: 招待フロー ───");

  // テスト用ユーザー（seedに無いID）
  const TESTER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await pg.query(
    `INSERT INTO users (id, nickname, created_at, updated_at)
     VALUES ($1, 'テスト新規', now(), now())
     ON CONFLICT (id) DO UPDATE SET nickname = 'テスト新規'`,
    [TESTER]);

  // B1: 招待 token 作成 + 再利用
  let inviteToken;
  {
    const { s, body } = await jpost("/api/friend-invites", null);
    ok("B1: 招待 token 作成 200", s === 200 && body?.token?.length > 0, `s=${s}`);
    inviteToken = body?.token;

    const { s: s2, body: b2 } = await jpost("/api/friend-invites", null);
    ok("B1a: 同一招待を再利用（同一 token）", s2 === 200 && b2?.token === inviteToken, ``);
  }

  // B2: public GET /api/friend-invites/:token
  {
    const { s, body } = await jget("/api/friend-invites/seed-dev-invite-token-0001");
    ok("B2: public GET 招待 200（副作用なし）", s === 200 && typeof body?.nickname === "string", `s=${s}`);
  }
  {
    const { s } = await jget("/api/friend-invites/nonexistent-token-xyz");
    ok("B2b: 無効 token → 404", s === 404, `s=${s}`);
  }

  // B2c: inactive 招待 → 404
  const INACTIVE_TOKEN = "test-inactive-seed-token-9999";
  await pg.query(
    `INSERT INTO friend_invites (id, inviter_id, token, is_active, created_at)
     VALUES ('c8000000-0000-4000-8000-000000000099', $1, $2, false, now())
     ON CONFLICT (id) DO UPDATE SET is_active = false, token = $2`,
    [DEV, INACTIVE_TOKEN]);
  {
    const { s } = await jget(`/api/friend-invites/${INACTIVE_TOKEN}`);
    ok("B2c: inactive 招待 → 404", s === 404, `s=${s}`);
  }

  // --- 申請/受諾フローのため data を段階的に作成 ---
  // DEV_USER と TESTER の pair (低<高)
  const [lo, hi] = pairId(DEV, TESTER);

  // 既存の同 pair があれば状態を確認
  const existing = await pg.query(
    `SELECT id, status FROM friendships WHERE user_low_id = $1 AND user_high_id = $2`,
    [lo, hi]);

  if (existing.rows.length > 0) {
    // 既存データは rejected または removed にリセット
    await pg.query(`UPDATE friendships SET status = 'removed' WHERE user_low_id = $1 AND user_high_id = $2`, [lo, hi]);
  }

  // B3: DEV_USER → TESTER の pending 申請を作成（DEV_USER が requester）
  const FID_OUT = "dddddddd-dddd-4ddd-8ddd-ddddddddd001";
  if (existing.rows.length > 0) {
    await pg.query(`UPDATE friendships SET id = $1, requester_id = $2, receiver_id = $3, status = 'pending', requested_at = now() WHERE user_low_id = $4 AND user_high_id = $5`,
      [FID_OUT, DEV, TESTER, lo, hi]);
  } else {
    await pg.query(`INSERT INTO friendships (id, user_low_id, user_high_id, requester_id, receiver_id, status, requested_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', now())`,
      [FID_OUT, lo, hi, DEV, TESTER]);
  }

  // outgoing に表示されることを確認
  {
    const { s, body } = await jget("/api/friend-requests?direction=outgoing");
    const found = body?.find(r => r.id === FID_OUT);
    ok("B3: 申請が outgoing に表示", s === 200 && found !== undefined, `s=${s} found=${!!found}`);
  }

  // cleanup: outgoing pending を削除し、逆方向(RECEIVER=DEV) の pending を作成
  await pg.query(`UPDATE friendships SET status = 'removed' WHERE user_low_id = $1 AND user_high_id = $2`, [lo, hi]);

  const FID_IN = "dddddddd-dddd-4ddd-8ddd-ddddddddd002";
  await pg.query(`UPDATE friendships SET id = $1, requester_id = $2, receiver_id = $3, status = 'pending', requested_at = now(), accepted_at = NULL WHERE user_low_id = $4 AND user_high_id = $5`,
    [FID_IN, TESTER, DEV, lo, hi]);

  // incoming に表示される
  {
    const { s, body } = await jget("/api/friend-requests?direction=incoming");
    const found = body?.find(r => r.id === FID_IN);
    ok("B4: incoming に pending 申請表示", s === 200 && found !== undefined, `s=${s}`);
  }

  // B5: 受諾
  {
    const { s, body } = await jpost(`/api/friend-requests/${FID_IN}/accept`, null);
    ok("B5: 申請を受諾 200", s === 200 && body?.id === FID_IN, `s=${s} body=${JSON.stringify(body)}`);
  }

  // B6: 受諾後フレンド一覧に追加
  {
    const { s, body } = await jget("/api/friends");
    ok("B6: 受諾後フレンド一覧に追加", s === 200 && body?.find(f => f.userId === TESTER), ``);
  }

  // B7: 新規フレンド詳細 200
  {
    const { s, body } = await jget(`/api/friends/${TESTER}`);
    ok("B7: 新規フレンド詳細 200", s === 200 && body?.friend?.userId === TESTER, `s=${s}`);
  }

  // B8: 再送멱等確認 + 既存 accepted ペアの重複申請 → 409
  // 田中の招待 token をDBに作成し、既に accepted な DEV→田中で申請 → 409
  {
    await pg.query(
      `INSERT INTO friend_invites (id, inviter_id, token, is_active, created_at)
       VALUES ('c8000000-0000-4000-8000-00000000009a', $1, 'tanaka-for-b8-token-409', true, now())
       ON CONFLICT (id) DO UPDATE SET token = 'tanaka-for-b8-token-409', is_active = true`,
      [TANAKA]);
    const { s: s8 } = await jpost("/api/friend-requests",
      { inviteToken: "tanaka-for-b8-token-409" },
      { "idempotency-key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3" });
    ok("B8: 既存 accepted ペア（田中）の重複申請 → 409", s8 === 409, `s=${s8}`);
    const { s: s8b } = await jpost("/api/friend-requests",
      { inviteToken: "tanaka-for-b8-token-409" },
      { "idempotency-key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3" });
    ok("B8: 同一멱等キー再送は同一レスポンス 409", s8b === 409, `s=${s8b}`);
  }

  // --- 第三者受諾テスト  ---
  const THIRD = "dddddddd-dddd-4ddd-8ddd-ddddddddd003";
  await pg.query(`INSERT INTO users (id, nickname, created_at, updated_at) VALUES ($1, '第三者', now(), now()) ON CONFLICT (id) DO NOTHING`, [THIRD]);

  const [lo3, hi3] = pairId(TANAKA, THIRD);
  const FID_3P = "dddddddd-dddd-4ddd-8ddd-ddddddddd004";
  await pg.query(`INSERT INTO friendships (id, user_low_id, user_high_id, requester_id, receiver_id, status, requested_at)
    VALUES ($1, $2, $3, $4, $5, 'pending', now())
    ON CONFLICT (user_low_id, user_high_id) DO UPDATE SET status = 'pending', requester_id = $4, receiver_id = $5, requested_at = now(), id = $1`,
    [FID_3P, lo3, hi3, THIRD, TANAKA]);

  const before3p = await pg.query("SELECT status FROM friendships WHERE id = $1", [FID_3P]);
  {
    const { s } = await jpost(`/api/friend-requests/${FID_3P}/accept`, null);
    ok("B9: 第三者受諾 → 404/FORBIDDEN", s === 404 || s === 403, `s=${s}`);
    const after3p = await pg.query("SELECT status FROM friendships WHERE id = $1", [FID_3P]);
    ok("B9a: 第三者受諾後 DB 不変",
      before3p.rows[0]?.status === after3p.rows[0]?.status,
      `before=${before3p.rows[0]?.status} after=${after3p.rows[0]?.status}`);
  }

  // --- 拒否テスト ---
  // DEV_USER が receiver の pending を別 pair で作成
  const FOURTH = "dddddddd-dddd-4ddd-8ddd-ddddddddd005";
  await pg.query(`INSERT INTO users (id, nickname, created_at, updated_at) VALUES ($1, '拒否テスト', now(), now()) ON CONFLICT (id) DO NOTHING`, [FOURTH]);
  const [lo4, hi4] = pairId(DEV, FOURTH);
  const FID_REJ = "dddddddd-dddd-4ddd-8ddd-ddddddddd006";
  await pg.query(`INSERT INTO friendships (id, user_low_id, user_high_id, requester_id, receiver_id, status, requested_at)
    VALUES ($1, $2, $3, $4, $5, 'pending', now())
    ON CONFLICT (user_low_id, user_high_id) DO UPDATE SET status = 'pending', requester_id = $4, receiver_id = $5, requested_at = now(), id = $1`,
    [FID_REJ, lo4, hi4, FOURTH, DEV]);
  {
    const { s } = await jpost(`/api/friend-requests/${FID_REJ}/reject`, null);
    ok("B10: 拒否成功 200", s === 200, `s=${s}`);
    const rej = await pg.query("SELECT status FROM friendships WHERE id = $1", [FID_REJ]);
    ok("B10a: 拒否後のステータス rejected", rej.rows[0]?.status === "rejected", `status=${rej.rows[0]?.status}`);
  }

  // --- blocked → 404 ---
  {
    const { s } = await jget(`/api/friends/${STRANGER}`);
    ok("B11: blocked/他人 → 404", s === 404, `s=${s}`);
  }

  // Cleanup test data
  await pg.query(`DELETE FROM friendships WHERE id IN ($1,$2,$3,$4)`,
    [FID_OUT, FID_IN, FID_3P, FID_REJ]);
  // Restore TESTER-DEV pair to removed or delete
  await pg.query(`DELETE FROM friendships WHERE user_low_id = $1 AND user_high_id = $2`, [lo, hi]);
  await pg.query(`DELETE FROM friend_invites WHERE id IN ($1, $2)`, ["c8000000-0000-4000-8000-000000000099", "c8000000-0000-4000-8000-00000000009a"]);
  await pg.query(`DELETE FROM users WHERE id IN ($1,$2,$3,$4)`, [TESTER, THIRD, FOURTH, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"]);

  // ================================================================
  // DB Snapshot
  // ================================================================
  console.log("\n─── DB Snapshot ───");
  const snap = await pg.query(`SELECT id, nickname FROM users WHERE id = $1`, [DEV]);
  console.log(`  dev_user: ${JSON.stringify(snap.rows[0])}`);

  const fs = await pg.query(
    `SELECT id, status FROM friendships WHERE (user_low_id=$1 OR user_high_id=$1) ORDER BY status`, [DEV]);
  console.log(`  friendships (${fs.rows.length}):`);
  for (const r of fs.rows) console.log(`    ${r.id} → ${r.status}`);

  // ================================================================
  // Summary
  // ================================================================
  console.log(`\n=== Summary ===`);
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  console.log(`  total:  ${passed + failed}`);
  if (failed > 0) {
    console.error("\n  FAILED:");
    for (const f of failures) console.error(`    ✗ ${f.label}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("\n  All tests passed.");
  }
} finally {
  await pg.end();
  await app.close();
}