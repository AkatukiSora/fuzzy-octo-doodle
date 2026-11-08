import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTaskId, parseUserId } from "./domain/shared/id-parsers.ts";
import type { ObjectionRepository } from "./application/ports/objection.repository.ts";
import type { Objection } from "./domain/objection/objection.ts";
import { parseObjectionId } from "./domain/shared/id-parsers.ts";
import type { PhotoAccessGrant } from "./domain/task/visibility-policy.ts";
import type { StoragePath } from "./domain/shared/storage-path.ts";
import type { UserId } from "./domain/shared/ids.ts";
import type { Task, TaskBase } from "./domain/task/task.ts";
import {
  parseNonEmptyText,
  parsePenaltyAmount,
  parseTaskTitle,
} from "./domain/task/task-values.ts";
import {
  authorizePhotoAccess,
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
  status: Task["status"],
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

    case "failed":
      return { ...base, status, reviewRound: 0, finalizedAt: now };
    case "indeterminate":
      return { ...base, status, reviewRound: 2, finalizedAt: now };
    case "closed":
      return { ...base, status, reviewRound: 2, finalizedAt: now };
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

const statuses: Task["status"][] = ["active", "reviewing", "disputed", "success", "failed", "indeterminate", "closed"];
for (const status of statuses) {
  test(`policy: evidence permissions in ${status}`, () => {
    const task = makeTask(status);
    for (const submissionType of ["initial", "additional"] as const) {
      assert.deepEqual(authorizePhotoAccess(task, "owner", submissionType), { taskId, submissionType });
      assert.equal(authorizePhotoAccess(task, "none", submissionType), null);
      assert.equal(authorizePhotoAccess(task, "none", submissionType, true), null);
    }
    assert.notEqual(authorizePhotoAccess(task, "friend", "initial"), null);
    assert.equal(authorizePhotoAccess(task, "friend", "additional"), null);
    assert.notEqual(authorizePhotoAccess(task, "friend", "additional", true), null);
  });
}

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
  constructor(private readonly items: Evidence[]) {}
  listByTask(): Promise<Evidence[]> {
    return Promise.resolve(this.items);
  }

  insert(): never { throw new Error("未使用"); }
  exists(): never { throw new Error("未使用"); }
}

class FakeFriendships implements FriendshipRepository {
  readonly calls: { ownerId: UserId; viewerId: UserId }[] = [];

  constructor(private readonly isFriend: boolean) {}

  areFriends(_tx: Tx, ownerId: UserId, viewerId: UserId): Promise<boolean> {
    this.calls.push({ ownerId, viewerId });
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

  readonly signed: { grant: PhotoAccessGrant; path: StoragePath }[] = [];

  createSignedReadUrl(grant: PhotoAccessGrant, path: StoragePath): Promise<string> {
    this.signed.push({ grant, path });
    this.signedUrlCount++;
    return Promise.resolve("https://example.com/signed-photo");
  }

  createSignedUploadUrl(): never { throw new Error("未使用"); }
  exists(): never { throw new Error("未使用"); }
}

class FakeObjections implements ObjectionRepository {
  readonly rounds: number[] = [];
  constructor(private readonly objectorId: UserId | null) {}
  findByTaskAndRound(_tx: Tx, id: typeof taskId, round: 1 | 2): Promise<Objection | null> {
    assert.equal(id, taskId);
    this.rounds.push(round);
    return Promise.resolve(this.objectorId === null ? null : {
      id: parseObjectionId("66666666-6666-4666-8666-666666666666"),
      taskId, objectorId: this.objectorId, reviewRound: 1,
      reasonType: "other", reasonDetail: "test", createdAt: now, withdrawnAt: null,
    });
  }
  tryInsert(): never { throw new Error("unused"); }
  findById(): never { throw new Error("unused"); }
  save(): never { throw new Error("unused"); }
  listByObjector(): never { throw new Error("unused"); }
}

function createTestUseCase(task: Task | null, isFriend: boolean, items: Evidence[] = [evidence], objectorId: UserId | null = null) {
  const storage = new FakeStorage();
  const friendships = new FakeFriendships(isFriend);

  const objections = new FakeObjections(objectorId);
  const useCase = new ListEvidencesUseCase(
    testUow,
    new FakeTasks(task),
    new FakeEvidences(items),
    friendships,
    storage,
    objections,
  );

  return { useCase, storage, friendships, objections };
}


const additional: Evidence = { ...evidence, submissionType: "additional", photos: [parseStoragePath("tasks/test/additional.jpg")] };
for (const status of statuses) {
  for (const viewer of ["owner", "objector", "friend", "stranger"] as const) {
    test(`UseCase: ${status} / ${viewer} filters before signing`, async () => {
      const viewerId = viewer === "owner" ? ownerId : viewer === "stranger" ? strangerId : friendId;
      const { useCase, storage, objections } = createTestUseCase(
        makeTask(status), viewer === "friend" || viewer === "objector", [evidence, additional],
        viewer === "objector" ? friendId : strangerId,
      );
      if (viewer === "stranger") {
        await assert.rejects(useCase.execute({ viewerId, taskId }), { code: "NOT_FOUND" });
        assert.equal(storage.signedUrlCount, 0);
        return;
      }
      const result = await useCase.execute({ viewerId, taskId });
      const types = viewer === "friend" ? ["initial"] : ["initial", "additional"];
      assert.deepEqual(result.evidences.map(e => e.submissionType), types);
      assert.deepEqual(storage.signed.map(({ grant }) => grant.submissionType), types);
      assert.equal(storage.signedUrlCount, types.length);
      if (viewer !== "owner") assert.deepEqual(objections.rounds, [1]);
      if (viewer === "friend") assert.ok(storage.signed.every(({ path }) => path !== additional.photos[0]));
    });
  }
}
test("UseCase: missing objection denies additional evidence and issues no URL", async () => {
  const { useCase, storage } = createTestUseCase(makeTask("reviewing"), true, [additional]);
  assert.deepEqual(await useCase.execute({ viewerId: friendId, taskId }), { evidences: [] });
  assert.equal(storage.signedUrlCount, 0);
});

test("UseCase: missing task returns NOT_FOUND without signing", async () => {
  const { useCase, storage } = createTestUseCase(null, false);
  await assert.rejects(useCase.execute({ viewerId: ownerId, taskId }), { code: "NOT_FOUND" });
  assert.equal(storage.signedUrlCount, 0);
});
test("UseCase: empty evidence stays empty", async () => {
  const { useCase, storage } = createTestUseCase(makeTask("success"), true, []);
  assert.deepEqual(await useCase.execute({ viewerId: friendId, taskId }), { evidences: [] });
  assert.equal(storage.signedUrlCount, 0);
});
