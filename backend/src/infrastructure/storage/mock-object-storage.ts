import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import type { ObjectStorage } from "../../application/ports/object-storage.port.ts";
import { parseStoragePath } from "../../domain/shared/storage-path.ts";
import type { StoragePath } from "../../domain/shared/storage-path.ts";
import type { PhotoAccessGrant } from "../../domain/task/visibility-policy.ts";
import { DomainError } from "../../domain/shared/errors.ts";
import { contentTypeFor } from "./object-storage.ts";

const ticketSchema = z.object({ path: z.string(), method: z.enum(["GET", "PUT"]), expires: z.number().int() });

/** Local storage with method-bound, expiring URLs. No public static directory.
 * Restarting invalidates outstanding URLs, not persisted files. */
export class MockObjectStorage implements ObjectStorage {
  private readonly secret = randomBytes(32);
  constructor(
    readonly root = process.env["MOCK_STORAGE_DIR"] ?? resolve(tmpdir(), "donee-mock-storage"),
    private readonly now = Date.now,
  ) {}

  createSignedUploadUrl(path: StoragePath, expiresInSec: number): Promise<string> {
    return Promise.resolve(this.url(path, "PUT", expiresInSec));
  }

  createSignedReadUrl(grant: PhotoAccessGrant, path: StoragePath, expiresInSec: number): Promise<string> {
    if (!path.startsWith(`evidence/${grant.taskId}/`)) throw new DomainError("FORBIDDEN", "Photo task mismatch");
    return Promise.resolve(this.url(path, "GET", expiresInSec));
  }

  async exists(path: StoragePath): Promise<boolean> {
    try { return (await stat(this.file(path))).isFile(); }
    catch (error) { if (hasCode(error, "ENOENT")) return false; throw error; }
  }

  authorize(token: string, method: "GET" | "PUT"): StoragePath {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra !== undefined) throw denied();
    const expected = createHmac("sha256", this.secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw denied();
    let value: unknown;
    try { value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
    catch { throw denied(); }
    const ticket = ticketSchema.safeParse(value);
    if (!ticket.success || ticket.data.method !== method || ticket.data.expires <= this.now()) throw denied();
    return parseStoragePath(ticket.data.path);
  }

  async put(path: StoragePath, bytes: Buffer, contentType: string | undefined): Promise<void> {
    if (contentType !== contentTypeFor(path)) throw new DomainError("VALIDATION_ERROR", "Incorrect image Content-Type");
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new DomainError("VALIDATION_ERROR", "Invalid image size");
    const target = this.file(path);
    await mkdir(dirname(target), { recursive: true });
    try { await writeFile(target, bytes, { flag: "wx" }); }
    catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
  }

  async read(path: StoragePath): Promise<Buffer> {
    try { return await readFile(this.file(path)); }
    catch (error) { if (hasCode(error, "ENOENT")) throw new DomainError("NOT_FOUND", "Image not found"); throw error; }
  }

  private file(path: StoragePath): string {
    const safe = parseStoragePath(path);
    if (!safe.startsWith("evidence/")) throw new DomainError("VALIDATION_ERROR", "Invalid image key");
    contentTypeFor(safe);
    return resolve(this.root, safe);
  }

  private url(path: StoragePath, method: "GET" | "PUT", seconds: number): string {
    this.file(path);
    if (!Number.isFinite(seconds) || seconds <= 0) throw denied();
    const payload = Buffer.from(JSON.stringify({ path, method, expires: this.now() + Math.min(seconds, 300) * 1000 })).toString("base64url");
    const signature = createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `/api/mock-storage/${payload}.${signature}`;
  }
}

const denied = () => new DomainError("FORBIDDEN", "Invalid or expired image URL");
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
