import { URL } from "node:url";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export type ObjectStorageConfig =
  | { driver: "mock" }
  | { driver: "s3"; s3: S3Config };

export function loadS3Config(env: NodeJS.ProcessEnv): S3Config {
  const required = (name: string): string => {
    const value = env[name];
    if (value === undefined || value.trim() === "" || value !== value.trim()) {
      throw new Error(`${name} は空でなく前後に空白のない値を指定してください`);
    }
    return value;
  };

  const endpoint = required("S3_ENDPOINT");
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("S3_ENDPOINT は有効なHTTP(S) URLで指定してください");
  }
  if (
    (parsedEndpoint.protocol !== "https:" && parsedEndpoint.protocol !== "http:") ||
    parsedEndpoint.username !== "" ||
    parsedEndpoint.password !== "" ||
    parsedEndpoint.search !== "" ||
    parsedEndpoint.hash !== ""
  ) {
    throw new Error("S3_ENDPOINT は認証情報やqueryを含まないHTTP(S) URLで指定してください");
  }
  const localEndpoint = ["localhost", "127.0.0.1", "[::1]"].includes(parsedEndpoint.hostname);
  const allowInsecureLocalEndpoint =
    env["NODE_ENV"] === "development" && env["S3_ALLOW_INSECURE_LOCAL_ENDPOINT"] === "true";
  if (parsedEndpoint.protocol !== "https:" && !(localEndpoint && allowInsecureLocalEndpoint)) {
    throw new Error("S3_ENDPOINT はHTTPSを使用してください（明示したローカル開発環境を除く）");
  }

  const forcePathStyleValue = env["S3_FORCE_PATH_STYLE"];
  if (forcePathStyleValue !== undefined && forcePathStyleValue !== "true" && forcePathStyleValue !== "false") {
    throw new Error("S3_FORCE_PATH_STYLE はtrueまたはfalseで指定してください");
  }

  return {
    endpoint,
    region: required("S3_REGION"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: forcePathStyleValue === "true",
  };
}

export function loadObjectStorageConfig(env: NodeJS.ProcessEnv): ObjectStorageConfig {
  const driver = env["OBJECT_STORAGE_DRIVER"];
  if (driver === "mock") return { driver };
  if (driver === "s3") return { driver, s3: loadS3Config(env) };
  throw new Error("OBJECT_STORAGE_DRIVER はmockまたはs3を明示してください");
}
