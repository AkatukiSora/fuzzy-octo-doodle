import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorage } from "../../application/ports/object-storage.port.ts";
import type { StoragePath } from "../../domain/shared/storage-path.ts";
import type { PhotoAccessGrant } from "../../domain/task/visibility-policy.ts";

/** S3互換APIの署名付きURLと存在確認を提供するObjectStorage adapter。 */
export class SignedUrlObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async createSignedUploadUrl(path: StoragePath, expiresInSec: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: contentTypeFor(path),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSec,
      signableHeaders: new Set(["content-type"]),
    });
  }

  async createSignedReadUrl(
    _grant: PhotoAccessGrant,
    path: StoragePath,
    expiresInSec: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      { expiresIn: expiresInSec },
    );
  }

  async exists(path: StoragePath): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }
}

export function contentTypeFor(path: StoragePath): string {
  const extension = path.slice(path.lastIndexOf(".") + 1);
  if (extension === "jpg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  throw new Error("Unsupported object storage image extension");
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "NotFound") return true;
  if (
    typeof error !== "object" ||
    !("$metadata" in error) ||
    typeof error.$metadata !== "object" ||
    error.$metadata === null ||
    !("httpStatusCode" in error.$metadata)
  ) {
    return false;
  }
  return error.$metadata.httpStatusCode === 404;
}
