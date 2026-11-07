import assert from "node:assert/strict";
import { S3Client } from "@aws-sdk/client-s3";
import { test } from "node:test";
import { createObjectStorage } from "./composition/persistence.module.ts";
import { MockObjectStorage } from "./infrastructure/storage/mock-object-storage.ts";
import { SignedUrlObjectStorage } from "./infrastructure/storage/object-storage.ts";
import {
  loadObjectStorageConfig,
  loadS3Config,
} from "./infrastructure/storage/s3-config.ts";

const validEnv: NodeJS.ProcessEnv = {
  S3_ENDPOINT: "https://objects.example.test",
  S3_REGION: "auto",
  S3_BUCKET: "evidence",
  S3_ACCESS_KEY_ID: "test-access-key",
  S3_SECRET_ACCESS_KEY: "test-secret-key",
};

test("S3設定は必須値を読み、path styleを既定で無効にする", () => {
  assert.deepEqual(loadS3Config(validEnv), {
    endpoint: "https://objects.example.test",
    region: "auto",
    bucket: "evidence",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    forcePathStyle: false,
  });
});

test("S3設定はpath styleのtrue/falseだけを受け付ける", () => {
  assert.equal(loadS3Config({ ...validEnv, S3_FORCE_PATH_STYLE: "true" }).forcePathStyle, true);
  assert.equal(loadS3Config({ ...validEnv, S3_FORCE_PATH_STYLE: "false" }).forcePathStyle, false);
  assert.throws(() => loadS3Config({ ...validEnv, S3_FORCE_PATH_STYLE: "yes" }), /S3_FORCE_PATH_STYLE/);
});

test("S3設定は必須項目が空なら起動時に失敗する", () => {
  for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    const env = { ...validEnv };
    env[name] = undefined;
    assert.throws(() => loadS3Config(env), new RegExp(name));
  }
});

test("S3設定値の前後に空白があれば起動時に失敗する", () => {
  assert.throws(() => loadS3Config({ ...validEnv, S3_REGION: " auto " }), /S3_REGION/);
});

test("S3 endpointはHTTPSを要求し、明示したローカル開発時だけloopback HTTPを許す", () => {
  assert.equal(loadS3Config({
    ...validEnv,
    S3_ENDPOINT: "http://localhost:9000",
    NODE_ENV: "development",
    S3_ALLOW_INSECURE_LOCAL_ENDPOINT: "true",
  }).endpoint, "http://localhost:9000");
  assert.throws(() => loadS3Config({ ...validEnv, S3_ENDPOINT: "http://localhost:9000", NODE_ENV: "development" }), /HTTPS/);
  assert.throws(() => loadS3Config({
    ...validEnv,
    S3_ENDPOINT: "http://localhost:9000",
    NODE_ENV: "production",
    S3_ALLOW_INSECURE_LOCAL_ENDPOINT: "true",
  }), /HTTPS/);
  assert.throws(() => loadS3Config({
    ...validEnv,
    S3_ENDPOINT: "http://objects.example.test",
    NODE_ENV: "development",
    S3_ALLOW_INSECURE_LOCAL_ENDPOINT: "true",
  }), /HTTPS/);
});

test("object storage driverは明示的なmockまたはs3だけを受け付ける", () => {
  assert.deepEqual(loadObjectStorageConfig({ OBJECT_STORAGE_DRIVER: "mock" }), { driver: "mock" });
  assert.deepEqual(loadObjectStorageConfig({ ...validEnv, OBJECT_STORAGE_DRIVER: "s3" }), {
    driver: "s3",
    s3: {
      endpoint: "https://objects.example.test",
      region: "auto",
      bucket: "evidence",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      forcePathStyle: false,
    },
  });
  assert.throws(() => loadObjectStorageConfig({}), /OBJECT_STORAGE_DRIVER/);
  assert.throws(() => loadObjectStorageConfig({ OBJECT_STORAGE_DRIVER: "other" }), /OBJECT_STORAGE_DRIVER/);
});

test("DI factoryは明示したdriverに対応するstorageを作る", (t) => {
  const mockConfig = loadObjectStorageConfig({ OBJECT_STORAGE_DRIVER: "mock" });
  assert.ok(createObjectStorage(mockConfig, null) instanceof MockObjectStorage);

  const s3Config = loadObjectStorageConfig({ ...validEnv, OBJECT_STORAGE_DRIVER: "s3" });
  const client = new S3Client({
    endpoint: s3Config.driver === "s3" ? s3Config.s3.endpoint : "https://objects.example.test",
    region: s3Config.driver === "s3" ? s3Config.s3.region : "auto",
    credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
  });
  t.after(() => { client.destroy(); });

  assert.ok(createObjectStorage(s3Config, client) instanceof SignedUrlObjectStorage);
  assert.throws(() => createObjectStorage(s3Config, null), /not initialized/);
});
