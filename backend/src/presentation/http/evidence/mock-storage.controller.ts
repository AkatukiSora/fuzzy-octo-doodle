import { Controller, Get, Put, Inject, Param, Req, Res, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { OBJECT_STORAGE } from "../../../application/ports/object-storage.port.ts";
import type { ObjectStorage } from "../../../application/ports/object-storage.port.ts";
import { MockObjectStorage } from "../../../infrastructure/storage/mock-object-storage.ts";
import { contentTypeFor } from "../../../infrastructure/storage/object-storage.ts";

/** Retains global session and Origin guards; raw paths are never accepted. */
@Controller("mock-storage")
export class MockStorageController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  private mock(): MockObjectStorage {
    if (!(this.storage instanceof MockObjectStorage)) throw new NotFoundException();
    return this.storage;
  }

  @Get(":token")
  async get(@Param("token") token: string, @Res() response: ServerResponse): Promise<void> {
    const storage = this.mock();
    const path = storage.authorize(token, "GET");
    const bytes = await storage.read(path);
    response.setHeader("Content-Type", contentTypeFor(path));
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(bytes);
  }

  @Put(":token")
  async put(@Param("token") token: string, @Req() request: IncomingMessage, @Res() response: ServerResponse): Promise<void> {
    const storage = this.mock();
    const path = storage.authorize(token, "PUT");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += bytes.length;
      if (size > 10 * 1024 * 1024) throw new PayloadTooLargeException();
      chunks.push(bytes);
    }
    await storage.put(path, Buffer.concat(chunks), request.headers["content-type"]);
    response.statusCode = 204;
    response.end();
  }
}
