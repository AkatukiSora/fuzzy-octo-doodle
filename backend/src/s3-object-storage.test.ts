import assert from "node:assert/strict";
import { S3Client } from "@aws-sdk/client-s3";
import { test } from "node:test";
import { brandAs } from "./domain/shared/brand.ts";
import { parseStoragePath } from "./domain/shared/storage-path.ts";
import { parseTaskId } from "./domain/shared/id-parsers.ts";
import type { PhotoAccessGrant } from "./domain/task/visibility-policy.ts";
import { SignedUrlObjectStorage, contentTypeFor } from "./infrastructure/storage/object-storage.ts";

type S3Request = Parameters<S3Client["config"]["requestHandler"]["handle"]>[0];

const path = parseStoragePath("evidence/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/1.jpg");
const grant: PhotoAccessGrant = brandAs<"PhotoAccessGrant">()({
  taskId: parseTaskId("22222222-2222-4222-8222-222222222222"),
});

test("画像拡張子からPUTのContent-Typeを決める", () => {
  assert.equal(contentTypeFor(parseStoragePath("evidence/1.jpg")), "image/jpeg");
  assert.equal(contentTypeFor(parseStoragePath("evidence/1.png")), "image/png");
  assert.equal(contentTypeFor(parseStoragePath("evidence/1.webp")), "image/webp");
  assert.throws(() => contentTypeFor(parseStoragePath("evidence/1.gif")), /unsupported/i);
});

function createClient(statusCode = 200) {
  const requests: unknown[] = [];
  const client = new S3Client({
    region: "us-east-1",
    endpoint: "https://objects.example.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
    maxAttempts: 1,
    requestHandler: {
      handle: (request: S3Request) => {
        requests.push(request);
        return Promise.resolve({
          response: { statusCode, headers: {}, body: new Uint8Array() },
        });
      },
      destroy: () => undefined,
    },
  });
  return { client, requests };
}

function isHttpRequest(value: unknown): value is { method: string; hostname: string; path: string } {
  return typeof value === "object" && value !== null &&
    "method" in value && typeof value.method === "string" &&
    "hostname" in value && typeof value.hostname === "string" &&
    "path" in value && typeof value.path === "string";
}

function responseStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return undefined;
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) return undefined;
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

test("PUT URLはバケット・Key・TTLを含み、Content-Typeを署名する", async (t) => {
  const client = new S3Client({
    region: "auto",
    endpoint: "https://objects.example.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
  });
  t.after(() => { client.destroy(); });
  const storage = new SignedUrlObjectStorage(client, "private-evidence");

  const signed = new URL(await storage.createSignedUploadUrl(path, 73));

  assert.equal(signed.origin, "https://objects.example.test");
  assert.ok(decodeURIComponent(signed.pathname).endsWith(`/private-evidence/${path}`));
  assert.equal(signed.searchParams.get("X-Amz-Expires"), "73");
  assert.equal(signed.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  assert.ok(signed.searchParams.has("X-Amz-Signature"));
});

test("GET URLは指定TTLとオブジェクトKeyを使う", async (t) => {
  const client = new S3Client({
    region: "auto",
    endpoint: "https://objects.example.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
  });
  t.after(() => { client.destroy(); });
  const storage = new SignedUrlObjectStorage(client, "private-evidence");

  const signed = new URL(await storage.createSignedReadUrl(grant, path, 60));

  assert.ok(decodeURIComponent(signed.pathname).endsWith(`/private-evidence/${path}`));
  assert.equal(signed.searchParams.get("X-Amz-Expires"), "60");
  assert.ok(signed.searchParams.has("X-Amz-Signature"));
});

test("HEAD成功はオブジェクトの存在を返す", async (t) => {
  const { client, requests } = createClient();
  t.after(() => { client.destroy(); });
  const storage = new SignedUrlObjectStorage(client, "private-evidence");

  assert.equal(await storage.exists(path), true);

  const request = requests[0];
  assert.ok(isHttpRequest(request));
  assert.equal(request.method, "HEAD");
  assert.equal(request.hostname, "objects.example.test");
  assert.ok(decodeURIComponent(request.path).endsWith(`/private-evidence/${path}`));
});

test("HEAD 404は存在しないとして返す", async (t) => {
  const { client } = createClient(404);
  t.after(() => { client.destroy(); });
  const storage = new SignedUrlObjectStorage(client, "private-evidence");

  assert.equal(await storage.exists(path), false);
});

test("HEAD 403と5xxは不存在にせずエラーを伝播する", async (t) => {
  for (const statusCode of [403, 503]) {
    const { client } = createClient(statusCode);
    t.after(() => { client.destroy(); });
    const storage = new SignedUrlObjectStorage(client, "private-evidence");

    await assert.rejects(storage.exists(path), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(responseStatus(error), statusCode);
      return true;
    });
  }
});
