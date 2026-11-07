#!/usr/bin/env node
/**
 * Requires a backend build: run `pnpm --filter @app/backend build` first.
 * Run from the repository root after applying the migration and development seed
 * to a disposable friends_test_* database owned by this verification run.
 */
import assert from "node:assert/strict";
import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

const rawDatabaseUrl = process.env.FRIENDS_TEST_DATABASE_URL;
if (rawDatabaseUrl === undefined || rawDatabaseUrl.length === 0) {
  throw new Error("FRIENDS_TEST_DATABASE_URL is required");
}

let socketUri = null;
const socketUriMatch = /^(postgres(?:ql)?:\/\/(?:[^/?#@]+@)?)\/([^?#]*)(\?[^#]*)?$/.exec(rawDatabaseUrl);
if (socketUriMatch !== null) {
  socketUri = socketUriMatch;
}

let databaseUrl;
try {
  const normalizedDatabaseUrl = socketUri === null
    ? rawDatabaseUrl
    : `${socketUri[1]}localhost/${socketUri[2]}${socketUri[3] ?? ""}`;
  databaseUrl = new URL(normalizedDatabaseUrl);
} catch {
  throw new Error("FRIENDS_TEST_DATABASE_URL must be a PostgreSQL URL");
}
if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
  throw new Error("FRIENDS_TEST_DATABASE_URL scheme must be postgres or postgresql");
}
if (databaseUrl.hash !== "") throw new Error("FRIENDS_TEST_DATABASE_URL fragments are not allowed");

let databaseName;
let databaseUser = "hermes";
let databasePassword = "socket-auth-dummy";
try {
  databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (databaseUrl.username !== "") databaseUser = decodeURIComponent(databaseUrl.username);
  if (databaseUrl.password !== "") databasePassword = decodeURIComponent(databaseUrl.password);
} catch {
  throw new Error("FRIENDS_TEST_DATABASE_URL contains malformed encoding");
}
if (!/^friends_test_[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error("database name must match friends_test_*");
}

const queryKeys = new Set();
for (const [key] of databaseUrl.searchParams) {
  if (queryKeys.has(key)) throw new Error("database URL query keys must not repeat");
  queryKeys.add(key);
}

let databaseHost;
let databasePort;
let transport;
if (socketUri === null) {
  const host = databaseUrl.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error("database host must be loopback or a private Unix socket");
  }
  if (databaseUrl.search !== "") throw new Error("TCP database URL query overrides are not allowed");
  databaseHost = host.replace(/^\[|\]$/g, "");
  databasePort = Number(databaseUrl.port || "5432");
  transport = "loopback";
} else {
  if (databaseUrl.port !== "") throw new Error("Unix socket URL must specify its port in the query");
  if (queryKeys.size !== 2 || !queryKeys.has("host") || !queryKeys.has("port")) {
    throw new Error("Unix socket URL must contain exactly one host and one port query parameter");
  }
  databaseHost = databaseUrl.searchParams.get("host");
  if (databaseHost === null || !isAbsolute(databaseHost)) {
    throw new Error("Unix socket host must be an absolute private directory");
  }
  let socketDirectory;
  try {
    socketDirectory = lstatSync(databaseHost);
  } catch {
    throw new Error("Unix socket directory must exist and be private");
  }
  if (!socketDirectory.isDirectory() || socketDirectory.uid !== process.getuid() || (socketDirectory.mode & 0o777) !== 0o700) {
    throw new Error("Unix socket directory must be owned by the current user with mode 0700");
  }
  databasePort = Number(databaseUrl.searchParams.get("port"));
  transport = "unix-socket";
}
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error("database port must be an integer from 1 through 65535");
}

Object.assign(process.env, {
  DATABASE_HOST: databaseHost,
  DATABASE_PORT: String(databasePort),
  DATABASE_NAME: databaseName,
  DATABASE_USER: databaseUser,
  DATABASE_PASSWORD: databasePassword,
  DATABASE_SSL_MODE: "disable",
  DATABASE_POOL_MAX: "2",
  NODE_ENV: "development",
});
console.log(`DATABASE_BOUNDARY ${transport} port=${databasePort} db=${databaseName}`);

const { Client } = await import("pg");
const database = new Client({
  host: databaseHost,
  port: databasePort,
  database: databaseName,
  user: databaseUser,
  password: databasePassword,
});
const apps = [];
let databaseConnected = false;
let passed = 0;
const DEV = "11111111-1111-4111-8111-111111111111";
const TANAKA = "c1000000-0000-4000-8000-000000000001";
const BLOCKED_BY_TANAKA = "c1000000-0000-4000-8000-000000000093";
const BLOCKED_BY_DEV = "c1000000-0000-4000-8000-000000000094";
const NON_FRIEND = "c1000000-0000-4000-8000-000000000092";
const MISSING_USER = "c1000000-0000-4000-8000-000000000099";
const MARKER = "verify-friends-fixture:";

function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
  console.log(`PASS ${passed}: ${label}`);
}

async function request(base, path, method = "GET", body, idempotencyKey) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : JSON.parse(text) };
}

async function relationshipSnapshot() {
  const result = await database.query(`
    SELECT
      COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM friendships f), '[]'::jsonb) AS friendships,
      COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM notifications n), '[]'::jsonb) AS notifications
  `);
  return result.rows[0];
}

async function collectIds(base, path, itemsPath, limit, label) {
  const ids = [];
  const seenCursors = new Set();
  const cursorRows = [];
  let cursor;
  let pageCount = 0;
  while (true) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) query.set("cursor", cursor);
    const separator = path.includes("?") ? "&" : "?";
    const response = await request(base, `${path}${separator}${query.toString()}`);
    check(`${label} page ${pageCount + 1} HTTP`, response.status, 200);
    const page = itemsPath === "tasks" ? response.body.tasks : response.body;
    assert.ok(Array.isArray(page.items), `${label} page items must be an array`);
    check(`${label} page ${pageCount + 1} size`, page.items.length <= limit, true);
    ids.push(...page.items.map((item) => item.id));
    const nextCursor = page.nextCursor;
    if (nextCursor === null) {
      check(`${label} terminal cursor is null`, nextCursor, null);
      return { ids, cursorRows, pageCount: pageCount + 1 };
    }
    assert.equal(typeof nextCursor, "string", `${label} nextCursor must be a string or null`);
    assert.ok(!seenCursors.has(nextCursor), `${label} nextCursor repeated before termination`);
    seenCursors.add(nextCursor);
    const decoded = JSON.parse(Buffer.from(nextCursor, "base64url").toString("utf8"));
    check(`${label} wire cursor keys`, Object.keys(decoded).sort(), ["id", "t"]);
    check(`${label} cursor timestamp format`, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(decoded.t), true);
    check(`${label} cursor matches page boundary`, decoded.id, page.items.at(-1)?.id);
    cursorRows.push(decoded);
    cursor = nextCursor;
    pageCount += 1;
    assert.ok(pageCount < 100, `${label} pagination did not terminate within 100 pages`);
  }
}

async function insertFixtureTask(id, ownerId, status, timestamp) {
  await database.query(
    `INSERT INTO tasks (
      id, user_id, original_task_id, title, achievement_condition, evidence_method,
      deadline_at, penalty_amount, is_penalty_public, status, review_round,
      review_deadline_at, additional_evidence_deadline_at, completed_at, finalized_at,
      created_at, updated_at
    ) VALUES ($1, $2, NULL, $3, 'fixture', 'fixture', $4, 100, false, $5, 0, NULL, NULL, NULL, $6, now(), now())`,
    [id, ownerId, `${MARKER}${id}`, timestamp, status, status === "failed" ? timestamp : null],
  );
}

try {
  await database.connect();
  databaseConnected = true;
  const precisionFixtures = await database.query(
    `UPDATE tasks
     SET deadline_at = CASE id
       WHEN $1 THEN $3::timestamptz
       WHEN $2 THEN $4::timestamptz
     END
     WHERE id IN ($1, $2)
     RETURNING id, to_char(deadline_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deadline_at`,
    ["c2000000-0000-4000-8000-000000000011", "c2000000-0000-4000-8000-000000000012", "2040-01-02T03:04:05.700693Z", "2040-01-02T03:04:05.700900Z"],
  );
  check("required seeded precision fixtures exist", precisionFixtures.rowCount, 2);
  check(
    "seeded precision fixtures retain exact microseconds",
    precisionFixtures.rows.map(({ id, deadline_at }) => [id, deadline_at]).sort(([left], [right]) => left.localeCompare(right)),
    [
      ["c2000000-0000-4000-8000-000000000011", "2040-01-02T03:04:05.700693Z"],
      ["c2000000-0000-4000-8000-000000000012", "2040-01-02T03:04:05.700900Z"],
    ],
  );
  const { createApp } = await import("../dist/composition/create-app.js");
  const B = randomUUID();
  const C = randomUUID();
  const D = randomUUID();
  const B_NICKNAME = "検証申請者";
  const C_NICKNAME = "検証第三者";
  const D_NICKNAME = "検証別招待者";
  const ALT_TOKEN = `verify-alt-${randomUUID()}`;
  const INACTIVE_TOKEN = `verify-inactive-${randomUUID()}`;
  const appBases = new Map();

  await database.query(`DELETE FROM tasks WHERE user_id IN ($1, $2) AND title LIKE $3`, [DEV, TANAKA, `${MARKER}%`]);
  for (const [id, nickname] of [[B, B_NICKNAME], [C, C_NICKNAME], [D, D_NICKNAME]]) {
    await database.query(
      "INSERT INTO users (id, nickname, created_at, updated_at) VALUES ($1, $2, now(), now())",
      [id, nickname],
    );
  }
  await database.query(
    `INSERT INTO friend_invites (id, inviter_id, token, is_active, created_at)
     VALUES ($1, $2, $3, true, now()), ($4, $2, $5, false, now())`,
    [randomUUID(), D, ALT_TOKEN, randomUUID(), INACTIVE_TOKEN],
  );

  const namespace = randomUUID().slice(0, 8);
  const taskId = (suffix) => `${namespace}-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
  const activeFixtures = [
    { id: taskId(1), at: "2040-01-02T03:04:05.123100Z" },
    { id: taskId(2), at: "2040-01-02T03:04:05.123100Z" },
    { id: taskId(3), at: "2040-01-02T03:04:05.123456Z" },
    { id: taskId(4), at: "2040-01-02T03:04:05.123900Z" },
  ];
  const historyFixtures = [
    { id: taskId(101), at: "2040-02-03T04:05:06.456100Z" },
    { id: taskId(102), at: "2040-02-03T04:05:06.456100Z" },
    { id: taskId(103), at: "2040-02-03T04:05:06.456900Z" },
    { id: taskId(104), at: "2040-02-03T04:05:06.456000Z" },
  ];
  for (const fixture of activeFixtures) await insertFixtureTask(fixture.id, TANAKA, "active", fixture.at);
  for (const fixture of historyFixtures) await insertFixtureTask(fixture.id, DEV, "failed", fixture.at);

  const activeTimes = await database.query(
    `SELECT id, to_char(deadline_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
     FROM tasks WHERE id = ANY($1::varchar[]) ORDER BY deadline_at, id`,
    [activeFixtures.map((fixture) => fixture.id)],
  );
  check("active fixture timestamps retain exact microseconds", activeTimes.rows, activeFixtures);
  const historyTimes = await database.query(
    `SELECT id, to_char(finalized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
     FROM tasks WHERE id = ANY($1::varchar[]) ORDER BY finalized_at DESC, id DESC`,
    [historyFixtures.map((fixture) => fixture.id)],
  );
  check("history fixture timestamps retain exact microseconds", historyTimes.rows, [
    historyFixtures[2], historyFixtures[1], historyFixtures[0], historyFixtures[3],
  ]);

  for (const userId of [DEV, B, C]) {
    process.env.DEV_AUTH_USER_ID = userId;
    const app = await createApp();
    apps.push(app);
    await app.listen(0, "127.0.0.1");
    appBases.set(userId, (await app.getUrl()).replace("[::1]", "127.0.0.1"));
  }
  const a = appBases.get(DEV);
  const b = appBases.get(B);
  const c = appBases.get(C);

  const inviteOne = await request(a, "/api/friend-invites", "POST");
  const inviteTwo = await request(a, "/api/friend-invites", "POST");
  check("A invite creation and reuse", [inviteOne.status, inviteTwo.status, typeof inviteOne.body.token, inviteOne.body.token === inviteTwo.body.token], [200, 200, "string", true]);
  const inviteToken = inviteOne.body.token;

  const beforePublicGet = await relationshipSnapshot();
  const publicInvite = await request(c, `/api/friend-invites/${encodeURIComponent(inviteToken)}`);
  check("public invite GET only returns public profile", [publicInvite.status, Object.keys(publicInvite.body).sort(), publicInvite.body.userId], [200, ["nickname", "userId"], DEV]);
  check("public GET leaves all friendships and notifications unchanged", await relationshipSnapshot(), beforePublicGet);
  check("unknown invite GET returns 404", (await request(c, "/api/friend-invites/not-a-real-invite-token")).status, 404);
  check("inactive invite GET returns 404", (await request(c, `/api/friend-invites/${encodeURIComponent(INACTIVE_TOKEN)}`)).status, 404);

  check("missing UUID Idempotency-Key returns 400", (await request(b, "/api/friend-requests", "POST", { inviteToken })).status, 400);
  check("A blocks B through HTTP", (await request(a, `/api/users/${B}/block`, "POST")).status, 204);
  const blockedBeforeRequest = await relationshipSnapshot();
  const blockedRequestKey = randomUUID();
  check("blocked pair request returns 403", (await request(b, "/api/friend-requests", "POST", { inviteToken }, blockedRequestKey)).status, 403);
  check("blocked request leaves friendships and notifications unchanged", await relationshipSnapshot(), blockedBeforeRequest);
  check("A unblocks B through HTTP", (await request(a, `/api/users/${B}/block`, "DELETE")).status, 204);

  const requestKey = randomUUID();
  const created = await request(b, "/api/friend-requests", "POST", { inviteToken }, requestKey);
  check("B HTTP request creates pending with 201", created.status, 201);
  const replay = await request(b, "/api/friend-requests", "POST", { inviteToken }, requestKey);
  check("same key and token replay returns identical result", replay, created);
  const notificationKey = `create_friend_request:${B}:${requestKey}`;
  const notificationCount = await database.query("SELECT count(*)::integer AS count FROM notifications WHERE deduplication_key = $1", [notificationKey]);
  check("idempotent request has exactly one notification", notificationCount.rows[0].count, 1);
  check("same key with another invite token returns 409", (await request(b, "/api/friend-requests", "POST", { inviteToken: ALT_TOKEN }, requestKey)).status, 409);
  check("different key for the existing pending pair returns 409", (await request(b, "/api/friend-requests", "POST", { inviteToken }, randomUUID())).status, 409);
  const requestId = created.body.id;
  const pendingRow = await database.query("SELECT id, status, requester_id, receiver_id FROM friendships WHERE id = $1", [requestId]);
  check("HTTP-created request is persisted pending with correct direction", pendingRow.rows, [{ id: requestId, status: "pending", requester_id: B, receiver_id: DEV }]);

  check("pending detail is hidden from inviter", (await request(a, `/api/friends/${B}`)).status, 404);
  check("pending detail is hidden from requester", (await request(b, `/api/friends/${DEV}`)).status, 404);
  const incoming = await request(a, "/api/friend-requests?direction=incoming");
  const outgoing = await request(b, "/api/friend-requests?direction=outgoing");
  check("A incoming contains the actual HTTP request", incoming.body.some((item) => item.id === requestId), true);
  check("B outgoing contains the actual HTTP request", outgoing.body.some((item) => item.id === requestId), true);

  const beforeDeniedActions = await relationshipSnapshot();
  for (const [label, base, action] of [
    ["B accept", b, "accept"],
    ["B reject", b, "reject"],
    ["C accept", c, "accept"],
    ["C reject", c, "reject"],
  ]) {
    check(`${label} is forbidden`, (await request(base, `/api/friend-requests/${requestId}/${action}`, "POST")).status, 403);
  }
  check("forbidden accept/reject calls leave friendships and notifications unchanged", await relationshipSnapshot(), beforeDeniedActions);

  check("A accepts through actual HTTP", (await request(a, `/api/friend-requests/${requestId}/accept`, "POST")).status, 200);
  for (const [base, peer] of [[a, B], [b, DEV]]) {
    const friends = await request(base, "/api/friends");
    check("accepted peer appears in friend list", friends.body.some((friend) => friend.userId === peer), true);
    const detail = await request(base, `/api/friends/${peer}`);
    check("accepted peer detail is available in both directions", [detail.status, detail.body.friend.userId], [200, peer]);
  }
  check("second accept returns 409", (await request(a, `/api/friend-requests/${requestId}/accept`, "POST")).status, 409);
  check("request to an already accepted pair returns 409", (await request(b, "/api/friend-requests", "POST", { inviteToken }, randomUUID())).status, 409);
  check("self request returns 400", (await request(a, "/api/friend-requests", "POST", { inviteToken }, randomUUID())).status, 400);

  const rejectKey = randomUUID();
  const rejectedFlow = await request(c, "/api/friend-requests", "POST", { inviteToken }, rejectKey);
  check("C creates separate pending request through HTTP", rejectedFlow.status, 201);
  check("A cannot see C detail while C request is pending", (await request(a, `/api/friends/${C}`)).status, 404);
  check("C cannot see A detail while request is pending", (await request(c, `/api/friends/${DEV}`)).status, 404);
  check("A rejects C request through HTTP", (await request(a, `/api/friend-requests/${rejectedFlow.body.id}/reject`, "POST")).status, 200);
  const cOutgoingAfterReject = await request(c, "/api/friend-requests?direction=outgoing");
  check("rejected request is absent from outgoing pending list", cOutgoingAfterReject.body.some((item) => item.id === rejectedFlow.body.id), false);
  const reapplied = await request(c, "/api/friend-requests", "POST", { inviteToken }, randomUUID());
  check("reapplication after reject returns 201 and reuses pair ID", [reapplied.status, reapplied.body.id], [201, rejectedFlow.body.id]);
  const pairState = await database.query("SELECT id, status FROM friendships WHERE id = $1", [reapplied.body.id]);
  check("reapplied pair is pending in PostgreSQL", pairState.rows, [{ id: rejectedFlow.body.id, status: "pending" }]);
  check("A rejects reapplication through HTTP for fixture cleanup", (await request(a, `/api/friend-requests/${reapplied.body.id}/reject`, "POST")).status, 200);

  for (const [label, userId] of [
    ["self", DEV],
    ["incoming pending", "c1000000-0000-4000-8000-000000000004"],
    ["outgoing pending", "c1000000-0000-4000-8000-000000000005"],
    ["blocked by target", BLOCKED_BY_TANAKA],
    ["blocked by viewer", BLOCKED_BY_DEV],
    ["non-friend", NON_FRIEND],
    ["missing user", MISSING_USER],
  ]) {
    check(`${label} friend detail returns 404`, (await request(a, `/api/friends/${userId}`)).status, 404);
  }
  check("malformed friend UUID returns 400", (await request(a, "/api/friends/not-a-uuid")).status, 400);
  const emptyDetail = await request(a, "/api/friends/c1000000-0000-4000-8000-000000000002");
  check("actual empty friend detail returns empty page", [emptyDetail.status, emptyDetail.body.tasks], [200, { items: [], nextCursor: null }]);

  const allFriendTasks = await request(a, `/api/friends/${TANAKA}?limit=50`);
  check("friend task detail returns 200", allFriendTasks.status, 200);
  const privateTask = allFriendTasks.body.tasks.items.find((task) => task.id === "c2000000-0000-4000-8000-000000000012");
  const publicTask = allFriendTasks.body.tasks.items.find((task) => task.id === "c2000000-0000-4000-8000-000000000011");
  check("required private penalty fixture exists", privateTask !== undefined, true);
  check("private penalty key is absent", Object.hasOwn(privateTask, "penaltyAmount"), false);
  check("required public penalty fixture exists", publicTask !== undefined, true);
  check("public penalty value is preserved", publicTask.penaltyAmount, 700);

  const expectedActive = [...activeFixtures.map((fixture) => fixture.id), "c2000000-0000-4000-8000-000000000011", "c2000000-0000-4000-8000-000000000012"];
  const expectedHistory = [historyFixtures[2].id, historyFixtures[1].id, historyFixtures[0].id, historyFixtures[3].id,
    "c2000000-0000-4000-8000-000000000007", "c2000000-0000-4000-8000-000000000006",
    "c2000000-0000-4000-8000-000000000005", "c2000000-0000-4000-8000-000000000009"];
  for (const limit of [1, 2]) {
    const activePages = await collectIds(a, `/api/friends/${TANAKA}`, "tasks", limit, `active limit=${limit}`);
    check(`active limit=${limit} page count terminates`, activePages.pageCount < 100, true);
    check(`active limit=${limit} contains no duplicates`, new Set(activePages.ids).size, activePages.ids.length);
    check(`active limit=${limit} has every ID in exact order`, activePages.ids, expectedActive);
    const historyPages = await collectIds(a, "/api/tasks?view=history", "items", limit, `history limit=${limit}`);
    check(`history limit=${limit} page count terminates`, historyPages.pageCount < 100, true);
    check(`history limit=${limit} contains no duplicates`, new Set(historyPages.ids).size, historyPages.ids.length);
    check(`history limit=${limit} has every ID in exact order`, historyPages.ids, expectedHistory);
  }

  for (const query of [
    "limit=0",
    "limit=51",
    "limit=1.5",
    "cursor=",
    "cursor=not-base64",
    `cursor=${Buffer.from(JSON.stringify({ t: "November 6, 2026", id: taskId(1) })).toString("base64url")}`,
    `cursor=${Buffer.from(JSON.stringify({ t: "2026-02-30T10:35:26.700Z", id: taskId(1) })).toString("base64url")}`,
    `cursor=${Buffer.from(JSON.stringify({ t: "2026-11-06T10:35:26.7006931Z", id: taskId(1) })).toString("base64url")}`,
  ]) {
    check(`malformed detail query ${query.startsWith("cursor=") ? "cursor" : query} returns 400`, (await request(a, `/api/friends/${TANAKA}?${query}`)).status, 400);
  }
  const legacyCursor = Buffer.from(JSON.stringify({ t: "2040-01-02T03:04:05.123Z", id: activeFixtures[0].id })).toString("base64url");
  check("legacy three-digit UTC cursor remains accepted", (await request(a, `/api/friends/${TANAKA}?limit=1&cursor=${encodeURIComponent(legacyCursor)}`)).status, 200);

  check("remove accepted B relation through HTTP", (await request(a, `/api/friends/${B}`, "DELETE")).status, 204);
  check("removed relation detail is hidden from A", (await request(a, `/api/friends/${B}`)).status, 404);
  check("removed relation detail is hidden from B", (await request(b, `/api/friends/${DEV}`)).status, 404);
  console.log(`SUMMARY ${JSON.stringify({ passed, failed: 0 })}`);
} finally {
  const closers = apps.reverse().map((app) => app.close());
  if (databaseConnected) closers.push(database.end());
  await Promise.all(closers);
}
