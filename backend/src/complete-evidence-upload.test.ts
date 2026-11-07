import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import pg from "pg";
import { z } from "zod";
import type { Clock } from "./application/ports/clock.port.ts";
import type { IdempotencyRecord, IdempotencyRepository } from "./application/ports/idempotency.repository.ts";
import type { EvidenceRepository, UploadSessionRepository } from "./application/ports/evidence.repository.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { IdGenerator } from "./application/ports/id-generator.port.ts";
import type { ObjectStorage } from "./application/ports/object-storage.port.ts";
import type { PostRepository } from "./application/ports/feed.repository.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { Tx, UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import { TaskEventPublisher } from "./application/shared/task-event-publisher.ts";
import type { CompleteEvidenceUploadInput } from "./application/ports/usecases/complete-evidence-upload.port.ts";
import { CompleteEvidenceUploadUseCase } from "./application/usecases/evidence/complete-evidence-upload.usecase.ts";
import type { UploadSession } from "./domain/evidence/upload-session.ts";
import type { Evidence } from "./domain/evidence/evidence.ts";
import { DomainError } from "./domain/shared/errors.ts";
import type { IdempotencyKey, IdempotentOperation, RequestHash } from "./domain/shared/idempotency.ts";
import { parseIdempotencyKey } from "./domain/shared/idempotency.ts";
import type { UserId } from "./domain/shared/ids.ts";
import {
  parseTaskId,
  parseUploadSessionId,
  parseUserId,
} from "./domain/shared/id-parsers.ts";
import type { Task } from "./domain/task/task.ts";
import type { OwnerTaskView } from "./domain/task/task-view.ts";
import { toTaskView } from "./domain/task/task-view.ts";
import {
  parseNonEmptyText,
  parsePenaltyAmount,
  parseTaskTitle,
} from "./domain/task/task-values.ts";
import type { Post } from "./domain/feed/post.ts";
import { createApp } from "./composition/create-app.ts";

const userId = parseUserId("11111111-1111-4111-8111-111111111111");
const otherUserId = parseUserId("44444444-4444-4444-8444-444444444444");
const taskId = parseTaskId("22222222-2222-4222-8222-222222222222");
const otherTaskId = parseTaskId("55555555-5555-4555-8555-555555555555");
const sessionId = parseUploadSessionId("33333333-3333-4333-8333-333333333333");
const idempotencyKey = parseIdempotencyKey("66666666-6666-4666-8666-666666666666");
const now = new Date("2026-11-06T12:00:00Z");

const task: Task = {
  id: taskId,
  ownerId: userId,
  originalTaskId: null,
  title: parseTaskTitle("証拠提出テスト"),
  achievementCondition: parseNonEmptyText("達成条件", "達成条件"),
  evidenceMethod: parseNonEmptyText("写真を提出する", "証拠提出方法"),
  deadlineAt: new Date("2026-11-07T12:00:00Z"),
  penaltyAmount: parsePenaltyAmount(100),
  isPenaltyPublic: false,
  createdAt: now,
  updatedAt: now,
  status: "active",
  reviewRound: 0,
};

const session: UploadSession = {
  id: sessionId,
  taskId,
  userId,
  submissionType: "initial",
  startedAt: now,
  uploadExpiresAt: new Date("2026-11-06T12:05:00Z"),
  status: "uploading",
};

const input = (overrides: Partial<CompleteEvidenceUploadInput> = {}): CompleteEvidenceUploadInput => ({
  userId,
  idempotencyKey,
  taskId,
  sessionId,
  photoPaths: [`evidence/${taskId}/${sessionId}/1.jpg`],
  ...overrides,
});

interface TestState {
  task: Task | null;
  session: UploadSession | null;
  evidences: Evidence[];
  posts: Post[];
  idempotencyResponses: { key: string; status: number | null }[];
}

interface HarnessOptions {
  task?: Task | null;
  session?: UploadSession | null;
  cachedResponse?: OwnerTaskView;
}

/* eslint-disable @typescript-eslint/require-await */
function createHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  let database: TestState = {
    task: options.task === undefined ? structuredClone(task) : options.task,
    session: options.session === undefined ? structuredClone(session) : options.session,
    evidences: [],
    posts: [],
    idempotencyResponses: [],
  };
  let transaction: TestState | undefined;
  const current = (): TestState => transaction ?? database;
  // Tx はテスト専用のトランザクション状態であり、インフラの中身は参照しない。
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const tx = {} as Tx;
  const uow: UnitOfWork = {
    run: async (fn) => {
      const candidate = structuredClone(database);
      transaction = candidate;
      try {
        const result = await fn(tx);
        database = candidate;
        return result;
      } finally {
        transaction = undefined;
      }
    },
  };
  const clock: Clock = { now: () => now };
  let uuidSequence = 1;
  const ids: IdGenerator = {
    uuid: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(uuidSequence++).padStart(12, "0")}`,
    inviteToken: () => "unused",
  };
  const idempotency: IdempotencyRepository = {
    reserve: async <O extends IdempotentOperation>(
      _tx: Tx,
      _user: UserId,
      operation: O,
      key: IdempotencyKey,
      requestHash: RequestHash,
      _time: Date,
    ): Promise<IdempotencyRecord<O> | null> => {
      calls.push("idempotency.reserve");
      if (options.cachedResponse !== undefined) {
        assert.equal(operation, "complete_evidence_upload");
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return {
          requestHash,
          responseStatus: 200,
          responseBody: options.cachedResponse,
        } as IdempotencyRecord<O>;
      }
      current().idempotencyResponses.push({ key, status: null });
      return null;
    },
    complete: async (_tx, _user, _operation, key, status, _body) => {
      calls.push("idempotency.complete");
      current().idempotencyResponses = current().idempotencyResponses.filter((record) => record.status !== null);
      current().idempotencyResponses.push({ key, status });
    },
  };
  const tasks: TaskRepository = {
    insert: async () => { throw new Error("unexpected TaskRepository.insert"); },
    findById: async () => { throw new Error("unexpected TaskRepository.findById"); },
    findByIds: async () => { throw new Error("unexpected TaskRepository.findByIds"); },
    findByIdForUpdate: async () => {
      calls.push("task.lock");
      return current().task;
    },
    save: async (_tx, nextTask) => {
      calls.push("task.save");
      current().task = nextTask;
    },
    countActiveInitial: async () => { throw new Error("unexpected TaskRepository.countActiveInitial"); },
    lockUserForCreation: async () => { throw new Error("unexpected TaskRepository.lockUserForCreation"); },
    listByOwner: async () => { throw new Error("unexpected TaskRepository.listByOwner"); },
    lockExpiredInitial: async () => { throw new Error("unexpected TaskRepository.lockExpiredInitial"); },
    lockReviewEnded: async () => { throw new Error("unexpected TaskRepository.lockReviewEnded"); },
    lockExpiredAdditional: async () => { throw new Error("unexpected TaskRepository.lockExpiredAdditional"); },
  };
  const uploadSessions: UploadSessionRepository = {
    insert: async () => { throw new Error("unexpected UploadSessionRepository.insert"); },
    findByIdForUpdate: async () => {
      calls.push("session.lock");
      return current().session;
    },
    save: async (_tx, nextSession) => {
      calls.push("session.save");
      current().session = nextSession;
    },
    hasLiveSession: async () => { throw new Error("unexpected UploadSessionRepository.hasLiveSession"); },
    expireStale: async () => { throw new Error("unexpected UploadSessionRepository.expireStale"); },
  };
  const evidences: EvidenceRepository = {
    insert: async (_tx, evidence) => {
      calls.push("evidence.insert");
      current().evidences.push(evidence);
    },
    listByTask: async () => { throw new Error("unexpected EvidenceRepository.listByTask"); },
    exists: async () => { throw new Error("unexpected EvidenceRepository.exists"); },
  };
  const friendships: FriendshipRepository = {
    findById: async () => { throw new Error("unexpected FriendshipRepository.findById"); },
    findByPair: async () => { throw new Error("unexpected FriendshipRepository.findByPair"); },
    save: async () => { throw new Error("unexpected FriendshipRepository.save"); },
    areFriends: async () => { throw new Error("unexpected FriendshipRepository.areFriends"); },
    countFriends: async () => {
      calls.push("friendships.countFriends");
      return 1;
    },
    listFriendIds: async () => { throw new Error("unexpected FriendshipRepository.listFriendIds"); },
    listIncomingPending: async () => { throw new Error("unexpected FriendshipRepository.listIncomingPending"); },
    listOutgoingPending: async () => { throw new Error("unexpected FriendshipRepository.listOutgoingPending"); },
    listBlockedBy: async () => { throw new Error("unexpected FriendshipRepository.listBlockedBy"); },
  };
  const storage: ObjectStorage = {
    createSignedUploadUrl: async () => { throw new Error("unexpected ObjectStorage.createSignedUploadUrl"); },
    createSignedReadUrl: async () => { throw new Error("unexpected ObjectStorage.createSignedReadUrl"); },
    exists: async () => {
      calls.push("storage.exists");
      return true;
    },
  };
  const posts: PostRepository = {
    insertIfAbsent: async (_tx, post) => {
      calls.push("events.publish");
      current().posts.push(post);
    },
    findById: async () => { throw new Error("unexpected PostRepository.findById"); },
    listFeed: async () => { throw new Error("unexpected PostRepository.listFeed"); },
    findFeedItem: async () => { throw new Error("unexpected PostRepository.findFeedItem"); },
    hasPost: async () => { throw new Error("unexpected PostRepository.hasPost"); },
  };
  const events = new TaskEventPublisher(posts, ids, clock);
  const useCase = new CompleteEvidenceUploadUseCase(
    uow,
    clock,
    idempotency,
    tasks,
    uploadSessions,
    evidences,
    friendships,
    storage,
    events,
    ids,
  );

  return {
    calls,
    databaseSnapshot: () => structuredClone(database),
    useCase,
  };
}

/* eslint-enable @typescript-eslint/require-await */

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

function assertRejectedWithoutWrites(calls: string[]): void {
  assert.deepEqual(calls, ["idempotency.reserve", "task.lock", "session.lock"]);
}

test("別人のタスクへの提出を FORBIDDEN で拒否し、永続状態と外部確認を変えない", async () => {
  const harness = createHarness({ task: { ...task, ownerId: otherUserId } });
  const before = harness.databaseSnapshot();

  await expectError(harness.useCase.execute(input()), "FORBIDDEN");

  assert.deepEqual(harness.databaseSnapshot(), before);
  assertRejectedWithoutWrites(harness.calls);
});

test("別session所有者の提出を FORBIDDEN で拒否し、永続状態と外部確認を変えない", async () => {
  const harness = createHarness({ session: { ...session, userId: otherUserId } });
  const before = harness.databaseSnapshot();

  await expectError(harness.useCase.execute(input()), "FORBIDDEN");

  assert.deepEqual(harness.databaseSnapshot(), before);
  assertRejectedWithoutWrites(harness.calls);
});

test("別taskに紐づく自分sessionの提出を NOT_FOUND で拒否し、永続状態と外部確認を変えない", async () => {
  const harness = createHarness({ session: { ...session, taskId: otherTaskId } });
  const before = harness.databaseSnapshot();

  await expectError(harness.useCase.execute(input()), "NOT_FOUND");

  assert.deepEqual(harness.databaseSnapshot(), before);
  assertRejectedWithoutWrites(harness.calls);
});

test("正当な提出はsession・evidence・task・event・冪等応答を同じ処理で保存する", async () => {
  const harness = createHarness();

  const result = await harness.useCase.execute(input());
  const state = harness.databaseSnapshot();

  assert.equal(result.id, taskId);
  assert.equal(result.viewer, "owner");
  assert.equal(result.status, "reviewing");
  assert.equal(state.task?.status, "reviewing");
  assert.equal(state.session?.status, "completed");
  assert.equal(state.evidences.length, 1);
  assert.equal(state.posts.length, 1);
  assert.equal(state.idempotencyResponses.length, 1);
  assert.ok(harness.calls.includes("storage.exists"));
  assert.ok(harness.calls.includes("idempotency.complete"));
});

test("期限切れsessionは DEADLINE_EXPIRED で拒否する", async () => {
  const harness = createHarness({ session: { ...session, uploadExpiresAt: new Date(now.getTime() - 1) } });

  await expectError(harness.useCase.execute(input()), "DEADLINE_EXPIRED");

  assert.equal(harness.databaseSnapshot().session?.status, "uploading");
});

test("完了済みsessionは STATE_CONFLICT で拒否する", async () => {
  const harness = createHarness({ session: { ...session, status: "completed", completedAt: now } });

  await expectError(harness.useCase.execute(input()), "STATE_CONFLICT");

  assert.equal(harness.databaseSnapshot().session?.status, "completed");
  assert.equal(harness.databaseSnapshot().evidences.length, 0);
});

test("提出対象taskの状態不一致は rollback し、task/session/evidence/event を確定しない", async () => {
  const reviewingTask: Task = {
    ...task,
    status: "reviewing",
    reviewRound: 1,
    reviewDeadlineAt: new Date("2026-11-07T12:00:00Z"),
  };
  const harness = createHarness({ task: reviewingTask });
  const before = harness.databaseSnapshot();

  await expectError(harness.useCase.execute(input()), "STATE_CONFLICT");

  assert.deepEqual(harness.databaseSnapshot(), before);
  assert.ok(harness.calls.includes("storage.exists"));
});

test("同じ冪等キーの再送は保存済みowner viewを返し、再度ロックや保存をしない", async () => {
  const cachedResponse = toTaskView(task, "owner");
  const harness = createHarness({ cachedResponse });

  const result = await harness.useCase.execute(input());

  assert.deepEqual(result, cachedResponse);
  assert.deepEqual(harness.calls, ["idempotency.reserve"]);
  assert.deepEqual(harness.databaseSnapshot().evidences, []);
});

test("実HTTP APIは他人のtaskへのcompleteを拒否し隔離DBを不変に保つ", {
  skip: process.env["COMPLETE_EVIDENCE_TEST_PG_BIN"] === undefined,
}, async () => {
  const pgBin = process.env["COMPLETE_EVIDENCE_TEST_PG_BIN"];
  assert.ok(pgBin);
  const workDir = await mkdtemp(join(tmpdir(), "fod-complete-evidence-"));
  const dataDir = join(workDir, "data");
  const socketDir = join(workDir, "socket");
  await mkdir(socketDir, { mode: 0o700 });
  const port = 55439;
  const pgCtl = join(pgBin, "pg_ctl");
  const psql = join(pgBin, "psql");
  const postgres = join(pgBin, "postgres");
  const pgConfig = join(pgBin, "pg_config");
  const postgresVersion = execFileSync(postgres, ["--version"], { encoding: "utf8" }).trim();
  const sharedDir = execFileSync(pgConfig, ["--sharedir"], { encoding: "utf8" }).trim();
  const originalEnv = new Map(
    [
      "DATABASE_HOST",
      "DATABASE_PORT",
      "DATABASE_NAME",
      "DATABASE_USER",
      "DATABASE_PASSWORD",
      "DATABASE_SSL_MODE",
      "DATABASE_POOL_MAX",
      "DEV_AUTH_USER_ID",
      "NODE_ENV",
      "OBJECT_STORAGE_DRIVER",
    ].map((name) => [name, process.env[name]]),
  );
  let serverStarted = false;
  let victimApp: INestApplication | undefined;
  let attackerApp: INestApplication | undefined;
  let database: pg.Pool | undefined;

  try {
    execFileSync(join(pgBin, "initdb"), [
      "-D", dataDir,
      "--username=postgres",
      "--auth-local=trust",
      "--auth-host=reject",
      "--no-locale",
      "--no-instructions",
      "-L", sharedDir,
    ]);
    execFileSync(pgCtl, [
      "-D", dataDir,
      "-l", join(workDir, "postgres.log"),
      "-o", `-c listen_addresses='' -c unix_socket_directories='${socketDir}' -c port=${String(port)} -c max_connections=20 -c shared_buffers=32MB`,
      "-w", "start",
    ]);
    serverStarted = true;

    process.env["DATABASE_HOST"] = socketDir;
    process.env["DATABASE_PORT"] = String(port);
    process.env["DATABASE_NAME"] = "postgres";
    process.env["DATABASE_USER"] = "postgres";
    process.env["DATABASE_PASSWORD"] = "isolated-test-only";
    process.env["DATABASE_SSL_MODE"] = "disable";
    process.env["DATABASE_POOL_MAX"] = "3";
    process.env["NODE_ENV"] = "test";
    process.env["OBJECT_STORAGE_DRIVER"] = "mock";

    execFileSync(psql, [
      "-X", "-h", socketDir, "-p", String(port), "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-f", fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url)),
    ]);
    const pool = new pg.Pool({
      host: socketDir,
      port,
      database: "postgres",
      user: "postgres",
      password: "isolated-test-only",
    });
    database = pool;

    const victimUserId = "77777777-7777-4777-8777-777777777777";
    const attackerUserId = "88888888-8888-4888-8888-888888888888";
    await pool.query(
      "INSERT INTO users (id, nickname, created_at, updated_at) VALUES ($1, 'victim', now(), now()), ($2, 'attacker', now(), now())",
      [victimUserId, attackerUserId],
    );

    const createApi = async (userId: string): Promise<{ app: INestApplication; base: string }> => {
      process.env["DEV_AUTH_USER_ID"] = userId;
      const app = await createApp();
      await app.listen(0, "127.0.0.1");
      return { app, base: await app.getUrl() };
    };
    const createTask = async (base: string, title: string): Promise<string> => {
      const response = await fetch(`${base}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
        body: JSON.stringify({
          title,
          achievementCondition: "隔離API検証",
          evidenceMethod: "写真を1枚以上提出",
          deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          penaltyAmount: 100,
          isPenaltyPublic: false,
          originalTaskId: null,
        }),
      });
      const result = z.object({ id: z.uuid() }).parse(await response.json());
      assert.equal(response.status, 201, JSON.stringify(result));
      assert.ok(result.id);
      return result.id;
    };

    const victim = await createApi(victimUserId);
    victimApp = victim.app;
    const victimTaskId = await createTask(victim.base, "victim task");
    const attacker = await createApi(attackerUserId);
    attackerApp = attacker.app;
    const attackerTaskId = await createTask(attacker.base, "attacker task");
    const sessionResponse = await fetch(`${attacker.base}/api/tasks/${attackerTaskId}/evidence-upload-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionType: "initial" }),
    });
    assert.equal(sessionResponse.status, 201);
    const uploadSession = z.object({ id: z.uuid() }).parse(await sessionResponse.json());
    const urlsResponse = await fetch(`${attacker.base}/api/tasks/${attackerTaskId}/evidence-upload-sessions/${uploadSession.id}/upload-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: [{ slot: 1, extension: "jpg" }] }),
    });
    assert.equal(urlsResponse.status, 200);
    const uploadUrls = z.object({ uploads: z.array(z.object({ path: z.string() })).min(1) }).parse(await urlsResponse.json());
    const photoPath = uploadUrls.uploads[0]?.path;
    assert.ok(photoPath);
    const hiddenTaskResponse = await fetch(`${attacker.base}/api/tasks/${victimTaskId}`);
    assert.equal(hiddenTaskResponse.status, 404);

    const taskIds = [victimTaskId, attackerTaskId];
    const attackKey = randomUUID();
    const snapshot = async () => {
      const [tasks, sessions, evidences, photos, posts, notifications, idempotency] = await Promise.all([
        pool.query("SELECT * FROM tasks WHERE id = ANY($1::varchar[]) ORDER BY id", [taskIds]),
        pool.query("SELECT * FROM evidence_upload_sessions WHERE task_id = ANY($1::varchar[]) ORDER BY id", [taskIds]),
        pool.query("SELECT * FROM task_evidences WHERE task_id = ANY($1::varchar[]) ORDER BY id", [taskIds]),
        pool.query("SELECT p.* FROM evidence_photos p JOIN task_evidences e ON e.id = p.evidence_id WHERE e.task_id = ANY($1::varchar[]) ORDER BY p.id", [taskIds]),
        pool.query("SELECT * FROM posts WHERE task_id = ANY($1::varchar[]) ORDER BY id", [taskIds]),
        pool.query("SELECT * FROM notifications WHERE related_task_id = ANY($1::varchar[]) ORDER BY id", [taskIds]),
        pool.query("SELECT * FROM idempotency_requests WHERE idempotency_key = $1 ORDER BY id", [attackKey]),
      ]);
      return { tasks: tasks.rows, sessions: sessions.rows, evidences: evidences.rows, photos: photos.rows, posts: posts.rows, notifications: notifications.rows, idempotency: idempotency.rows };
    };
    const before = await snapshot();
    const completeResponse = await fetch(`${attacker.base}/api/tasks/${victimTaskId}/evidence-upload-sessions/${uploadSession.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": attackKey },
      body: JSON.stringify({ photoPaths: [photoPath] }),
    });
    const completeBody = z.record(z.string(), z.unknown()).parse(await completeResponse.json());
    const errorBody = z.object({ error: z.object({ code: z.string() }) }).parse(completeBody);
    const errorCode = errorBody.error.code;
    assert.equal(completeResponse.status, 403, JSON.stringify(completeBody));
    assert.equal(errorCode, "FORBIDDEN");
    assert.equal("viewer" in completeBody, false);
    const after = await snapshot();
    assert.deepEqual(after, before);

    console.log(JSON.stringify({
      isolatedPostgres: postgresVersion,
      privateSocketOnly: true,
      hiddenTaskGet: hiddenTaskResponse.status,
      crossOwnerComplete: completeResponse.status,
      errorCode,
      dbStateUnchanged: true,
      taskRows: after.tasks.length,
      sessionRows: after.sessions.length,
      evidenceRows: after.evidences.length,
      eventRows: after.posts.length,
      photoBytesUploaded: false,
      storage: "MockObjectStorage",
    }));
  } finally {
    await attackerApp?.close();
    await victimApp?.close();
    await database?.end();
    if (serverStarted) {
      execFileSync(pgCtl, ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      assert.equal(existsSync(join(dataDir, "postmaster.pid")), false);
    }
    await rm(workDir, { recursive: true, force: true });
    for (const [name, value] of originalEnv) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  }
});
