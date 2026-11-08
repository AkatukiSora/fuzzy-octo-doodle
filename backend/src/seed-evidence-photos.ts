import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadObjectStorageConfig } from "./infrastructure/storage/s3-config.ts";
import { MockObjectStorage } from "./infrastructure/storage/mock-object-storage.ts";
import { contentTypeFor } from "./infrastructure/storage/object-storage.ts";
import { parseStoragePath } from "./domain/shared/storage-path.ts";
import type { StoragePath } from "./domain/shared/storage-path.ts";

const fixtureRoot = new URL("../fixtures/evidence/", import.meta.url);
export async function seedImageKeys(): Promise<StoragePath[]> {
  const value: unknown = JSON.parse(await readFile(new URL("manifest.json", fixtureRoot), "utf8"));
  return z.array(z.string()).parse(value).map(parseStoragePath);
}

export interface SeedImageTarget {
  exists(path: StoragePath): Promise<boolean>;
  write(path: StoragePath, bytes: Buffer, contentType: string): Promise<void>;
}

/** Only the explicit allowlist is seeded. Existing objects are never replaced. */
export async function seedEvidencePhotos(target: SeedImageTarget, apply: boolean): Promise<number> {
  let missing = 0;
  for (const path of await seedImageKeys()) {
    if (await target.exists(path)) continue;
    missing++;
    if (!apply) continue;
    const extension = path.endsWith(".png") ? "png" : "jpg";
    const bytes = await readFile(new URL(`sample.${extension}`, fixtureRoot));
    await target.write(path, bytes, contentTypeFor(path));
  }
  return missing;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const config = loadObjectStorageConfig(process.env);
  let target: SeedImageTarget;
  let client: S3Client | undefined;
  if (config.driver === "mock") {
    const storage = new MockObjectStorage();
    target = { exists: (path) => storage.exists(path), write: (path, bytes, type) => storage.put(path, bytes, type) };
  } else {
    client = new S3Client({
      endpoint: config.s3.endpoint, region: config.s3.region, forcePathStyle: config.s3.forcePathStyle,
      credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
    });
    const s3 = client;
    const bucket = config.s3.bucket;
    target = {
      async exists(path) {
        try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: path })); return true; }
        catch (error) {
          if (error instanceof Error && "$metadata" in error && typeof error.$metadata === "object" && error.$metadata !== null && "httpStatusCode" in error.$metadata && error.$metadata.httpStatusCode === 404) return false;
          throw error;
        }
      },
      async write(path, bytes, type) {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: bytes, ContentType: type, IfNoneMatch: "*" }));
      },
    };
  }
  try {
    const count = await seedEvidencePhotos(target, apply);
    console.log(`${apply ? "Created" : "Missing (dry run)"}: ${String(count)} seed images`);
  } finally { client?.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
