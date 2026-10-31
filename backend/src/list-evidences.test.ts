import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { Task, TaskBase } from "./domain/task/task.ts";
import {
  parseNonEmptyText,
  parsePenaltyAmount,
  parseTaskTitle,
} from "./domain/task/task-values.ts";
import {
  authorizePhotoAccess,
  viewerRole,
} from "./domain/task/visibility-policy.ts";
import { ListEvidencesUseCase } from "./application/usecases/evidence/list-evidences.usecase.ts";
import type { UnitOfWork } from "./application/ports/unit-of-work.port.ts";
import type { TaskRepository } from "./application/ports/task.repository.ts";
import type { EvidenceRepository } from "./application/ports/evidence.repository.ts";
import type { FriendshipRepository } from "./application/ports/friendship.repository.ts";
import type { ObjectStorage } from "./application/ports/object-storage.port.ts";
import type { Tx } from "./application/ports/unit-of-work.port.ts";
import type { Evidence } from "./domain/evidence/evidence.ts";
import { parseEvidenceId } from "./domain/shared/id-parsers.ts";
import { parseStoragePath } from "./domain/shared/storage-path.ts";

const ownerId = parseUserId("11111111-1111-4111-8111-111111111111");
const friendId = parseUserId("22222222-2222-4222-8222-222222222222");
const strangerId = parseUserId("33333333-3333-4333-8333-333333333333");
const taskId = parseTaskId("44444444-4444-4444-8444-444444444444");

const now = new Date("2026-10-31T12:00:00.000Z");

const base: TaskBase = {
  id: taskId,
  ownerId,
  originalTaskId: null,
  title: parseTaskTitle("勉強する"),
  achievementCondition: parseNonEmptyText("1時間勉強する", "達成条件"),
  evidenceMethod: parseNonEmptyText("写真を提出する", "証拠提出方法"),
  deadlineAt: now,
  penaltyAmount: parsePenaltyAmount(100),
  isPenaltyPublic: true,
  createdAt: now,
  updatedAt: now,
};

function makeTask(
  status: "active" | "reviewing" | "disputed" | "success",
): Task {
  switch (status) {
    case "active":
      return {
        ...base,
        status: "active",
        reviewRound: 0,
      };

    case "reviewing":
      return {
        ...base,
        status: "reviewing",
        reviewRound: 1,
        reviewDeadlineAt: now,
      };

    case "disputed":
      return {
        ...base,
        status: "disputed",
        reviewRound: 1,
        additionalEvidenceDeadlineAt: now,
      };

    case "success":
      return {
        ...base,
        status: "success",
        reviewRound: 1,
        completedAt: now,
        finalizedAt: now,
      };
  }
}

test("本人はどのタスク状態でも写真を閲覧できる", () => {
  for (const status of [
    "active",
    "reviewing",
    "disputed",
    "success",
  ] as const) {
    const task = makeTask(status);
    const role = viewerRole(ownerId, ownerId, false);

    assert.equal(role, "owner");
    assert.notEqual(authorizePhotoAccess(task, role), null);
  }
});

test("フレンドは審査中と異議申し立て中のみ閲覧できる", () => {
  const role = viewerRole(ownerId, friendId, true);

  assert.equal(role, "friend");

  assert.notEqual(
    authorizePhotoAccess(makeTask("reviewing"), role),
    null,
  );

  assert.notEqual(
    authorizePhotoAccess(makeTask("disputed"), role),
    null,
  );

  assert.equal(
    authorizePhotoAccess(makeTask("active"), role),
    null,
  );

  assert.equal(
    authorizePhotoAccess(makeTask("success"), role),
    null,
  );
});

test("第三者には写真の閲覧権限が与えられない", () => {
  const role = viewerRole(ownerId, strangerId, false);

  assert.equal(role, "none");

  assert.equal(
    authorizePhotoAccess(makeTask("reviewing"), role),
    null,
  );
});

test("閲覧許可には対象タスクIDが含まれる", () => {
  const grant = authorizePhotoAccess(
    makeTask("reviewing"),
    "owner",
  );

  assert.deepEqual(grant, { taskId });
});
// テスト用トランザクション。
// 実際のDBには接続しないため、中身は使用しない。
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tx = {} as Tx;

const testUow: UnitOfWork = {
  run: (fn) => fn(tx),
};

const evidence: Evidence = {
  id: parseEvidenceId("55555555-5555-4555-8555-555555555555"),
  taskId,
  submissionType: "initial",
  comment: null,
  submittedAt: now,
  photos: [parseStoragePath("tasks/test/photo1.jpg")],
};

class FakeTasks implements TaskRepository {
  constructor(private readonly task: Task | null) {}

  findById(): Promise<Task | null> {
    return Promise.resolve(this.task);
  }

  insert(): never { throw new Error("未使用"); }
  findByIds(): never { throw new Error("未使用"); }
  findByIdForUpdate(): never { throw new Error("未使用"); }
  save(): never { throw new Error("未使用"); }
  countActiveInitial(): never { throw new Error("未使用"); }
  lockUserForCreation(): never { throw new Error("未使用"); }
  listByOwner(): never { throw new Error("未使用"); }
  lockExpiredInitial(): never { throw new Error("未使用"); }
  lockReviewEnded(): never { throw new Error("未使用"); }
  lockExpiredAdditional(): never { throw new Error("未使用"); }
}

class FakeEvidences implements EvidenceRepository {
  listByTask(): Promise<Evidence[]> {
    return Promise.resolve([evidence]);
  }

  insert(): never { throw new Error("未使用"); }
  exists(): never { throw new Error("未使用"); }
}

class FakeFriendships implements FriendshipRepository {
  constructor(private readonly isFriend: boolean) {}

  areFriends(): Promise<boolean> {
    return Promise.resolve(this.isFriend);
  }

  findById(): never { throw new Error("未使用"); }
  findByPair(): never { throw new Error("未使用"); }
  save(): never { throw new Error("未使用"); }
  countFriends(): never { throw new Error("未使用"); }
  listFriendIds(): never { throw new Error("未使用"); }
  listIncomingPending(): never { throw new Error("未使用"); }
  listOutgoingPending(): never { throw new Error("未使用"); }
  listBlockedBy(): never { throw new Error("未使用"); }
}

class FakeStorage implements ObjectStorage {
  signedUrlCount = 0;

  createSignedReadUrl(): Promise<string> {
    this.signedUrlCount++;
    return Promise.resolve("https://example.com/signed-photo");
  }

  createSignedUploadUrl(): never { throw new Error("未使用"); }
  exists(): never { throw new Error("未使用"); }
}

function createTestUseCase(task: Task | null, isFriend: boolean) {
  const storage = new FakeStorage();

  const useCase = new ListEvidencesUseCase(
    testUow,
    new FakeTasks(task),
    new FakeEvidences(),
    new FakeFriendships(isFriend),
    storage,
  );

  return { useCase, storage };
}

test("UseCase: 本人は証拠写真のURLを取得できる", async () => {
  const { useCase, storage } = createTestUseCase(
    makeTask("reviewing"),
    false,
  );

  const result = await useCase.execute({
    viewerId: ownerId,
    taskId,
  });

  assert.equal(result.evidences.length, 1);
  assert.deepEqual(result.evidences[0]?.photoUrls, [
    "https://example.com/signed-photo",
  ]);
  assert.equal(storage.signedUrlCount, 1);
});

test("UseCase: 第三者にはURLを発行しない", async () => {
  const { useCase, storage } = createTestUseCase(
    makeTask("reviewing"),
    false,
  );

  await assert.rejects(
    useCase.execute({ viewerId: strangerId, taskId }),
    { code: "NOT_FOUND" },
  );

  assert.equal(storage.signedUrlCount, 0);
});

test("UseCase: フレンドでも閲覧不可の状態ではURLを発行しない", async () => {
  const { useCase, storage } = createTestUseCase(
    makeTask("success"),
    true,
  );

  await assert.rejects(
    useCase.execute({ viewerId: friendId, taskId }),
    { code: "FORBIDDEN" },
  );

  assert.equal(storage.signedUrlCount, 0);
});

test("UseCase: 存在しないタスクはNOT_FOUND", async () => {
  const { useCase, storage } = createTestUseCase(null, false);

  await assert.rejects(
    useCase.execute({ viewerId: ownerId, taskId }),
    { code: "NOT_FOUND" },
  );

  assert.equal(storage.signedUrlCount, 0);
});