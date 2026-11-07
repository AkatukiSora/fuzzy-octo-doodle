import { DomainError } from "../../domain/shared/errors.ts";
import type { Page } from "../../application/ports/task.repository.ts";

export interface KeysetCursor {
  at: Date;
  id: string;
  preciseAt?: string;
}

export function encodeCursor(c: KeysetCursor): string {
  return Buffer.from(JSON.stringify({ t: c.preciseAt ?? c.at.toISOString(), id: c.id })).toString("base64url");
}

export function decodeCursor(raw: string): KeysetCursor {
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof v === "object" && v !== null) {
      const t: unknown = Reflect.get(v, "t");
      const id: unknown = Reflect.get(v, "id");
      const timestamp = typeof t === "string" ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3}|\d{6})Z$/.exec(t) : null;
      const [, dateTime, fraction] = timestamp ?? [];
      if (typeof t === "string" && dateTime !== undefined && fraction !== undefined && typeof id === "string") {
        const milliseconds = fraction.length === 6 ? fraction.slice(0, 3) : fraction;
        const millisecondIso = `${dateTime}.${milliseconds}Z`;
        const at = new Date(millisecondIso);
        if (!Number.isNaN(at.getTime()) && at.toISOString() === millisecondIso) {
          return { at, id, preciseAt: t };
        }
      }
    }
  } catch {
    // 下の VALIDATION_ERROR にまとめる
  }
  throw new DomainError("VALIDATION_ERROR", "cursor が不正です");
}

/** limit + 1 件取得した行から Page を作る */
export function toPage<R, T>(rows: R[], limit: number, map: (r: R) => T, cursorOf: (r: R) => KeysetCursor): Page<T> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(map),
    nextCursor: hasMore && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}
