import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { APP_FILTER } from "@nestjs/core";
import { MockObjectStorage } from "./infrastructure/storage/mock-object-storage.ts";
import { MockStorageController } from "./presentation/http/evidence/mock-storage.controller.ts";
import { AllExceptionsFilter } from "./presentation/http/errors/all-exceptions.filter.ts";
import { OBJECT_STORAGE } from "./application/ports/object-storage.port.ts";
import { parseStoragePath } from "./domain/shared/storage-path.ts";
import { parseTaskId } from "./domain/shared/id-parsers.ts";
import { brandAs } from "./domain/shared/brand.ts";
import type { PhotoAccessGrant } from "./domain/task/visibility-policy.ts";
import { seedEvidencePhotos, seedImageKeys } from "./seed-evidence-photos.ts";

const taskId = parseTaskId("c2000000-0000-4000-8000-000000000011");
const path = parseStoragePath(`evidence/${taskId}/new-upload/1.jpg`);
const grant: PhotoAccessGrant = brandAs<"PhotoAccessGrant">()({ taskId, submissionType: "initial" });
const token = (url: string) => url.slice("/api/mock-storage/".length);

test("local storage preserves uploaded bytes, verifies existence and persists across restart", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "donee-storage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new MockObjectStorage(root);
  assert.equal(await storage.exists(path), false);
  const bytes = await readFile(new URL("../fixtures/evidence/sample.jpg", import.meta.url));
  const upload = await storage.createSignedUploadUrl(path, 60);
  await storage.put(storage.authorize(token(upload), "PUT"), bytes, "image/jpeg");
  assert.equal(await storage.exists(path), true);
  const url = await storage.createSignedReadUrl(grant, path, 60);
  assert.deepEqual(await storage.read(storage.authorize(token(url), "GET")), bytes);
  assert.deepEqual(await new MockObjectStorage(root).read(path), bytes);
  await storage.put(path, Buffer.from("replacement"), "image/jpeg");
  assert.deepEqual(await storage.read(path), bytes);
});

test("tickets reject forgery, tampering, method changes, expiry and wrong task grants", async () => {
  let now = 1000;
  const storage = new MockObjectStorage(tmpdir(), () => now);
  const url = await storage.createSignedReadUrl(grant, path, 1);
  assert.throws(() => storage.authorize("unsigned/path.jpg", "GET"), { code: "FORBIDDEN" });
  assert.throws(() => storage.authorize(token(url) + "x", "GET"), { code: "FORBIDDEN" });
  assert.throws(() => storage.authorize(token(url), "PUT"), { code: "FORBIDDEN" });
  now = 2000;
  assert.throws(() => storage.authorize(token(url), "GET"), { code: "FORBIDDEN" });
  assert.throws(() => storage.createSignedReadUrl(grant, parseStoragePath("evidence/other/1.jpg"), 60), { code: "FORBIDDEN" });
  assert.throws(() => storage.createSignedUploadUrl(brandAs<"StoragePath">()("evidence/../../escape.jpg"), 60));
});

test("seed manifest exactly matches SQL, dry-run writes nothing and seeding never replaces uploads", async (t) => {
  const sql = await readFile(new URL("../../infra/dev-seed/seed.sql", import.meta.url), "utf8");
  const expected = [...new Set([...sql.matchAll(/'(evidence\/[^']+\.(?:jpg|png|webp))'/g)].map(match => match[1]))];
  assert.deepEqual(await seedImageKeys(), expected);
  const root = await mkdtemp(join(tmpdir(), "donee-seed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new MockObjectStorage(root);
  const target = { exists: (key: typeof path) => storage.exists(key), write: (key: typeof path, bytes: Buffer, type: string) => storage.put(key, bytes, type) };
  assert.equal(await seedEvidencePhotos(target, false), expected.length);
  const first = (await seedImageKeys())[0];
  assert.ok(first);
  assert.equal(await storage.exists(first), false);
  assert.equal(await seedEvidencePhotos(target, true), expected.length);
  assert.equal(await seedEvidencePhotos(target, true), 0);
  for (const key of await seedImageKeys()) assert.ok((await storage.read(key)).length > 100);
});

test("HTTP PUT/GET serves image bytes; unsigned, cross-method and missing keys fail", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "donee-http-storage-"));
  const storage = new MockObjectStorage(root);
  @Module({ controllers: [MockStorageController], providers: [
    { provide: OBJECT_STORAGE, useValue: storage },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ] })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const base = await app.getUrl();
  const url = await storage.createSignedReadUrl(grant, path, 60);
  assert.equal((await fetch(base + url)).status, 404);
  const upload = await storage.createSignedUploadUrl(path, 60);
  const bytes = await readFile(new URL("../fixtures/evidence/sample.jpg", import.meta.url));
  assert.equal((await fetch(base + upload, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: bytes })).status, 204);
  const image = await fetch(base + url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(image.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  assert.equal((await fetch(base + upload)).status, 403);
  assert.equal((await fetch(base + "/api/mock-storage/unsigned")).status, 403);
});
