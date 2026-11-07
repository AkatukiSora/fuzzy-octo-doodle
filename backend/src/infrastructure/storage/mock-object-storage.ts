import type { ObjectStorage } from "../../application/ports/object-storage.port.ts";
import type { StoragePath } from "../../domain/shared/storage-path.ts";
import type { PhotoAccessGrant } from "../../domain/task/visibility-policy.ts";

/**
 * 責務: `ObjectStorage` port のモック実装。本物の保存先には接続しない。
 * 明示的に `OBJECT_STORAGE_DRIVER=mock` を選ぶ開発・テスト環境で、アップロードと閲覧の流れ(URL の発行、存在の確認)を動かすために使う。
 * 写真の中身はどこにも保存されない。発行する URL は形だけで、アクセスしても何も返らない。
 *
 * 実装の方針:
 * - 署名 URL は `http://localhost:8080/mock-storage/<パス>?expires=<秒>` の形にする。署名はない。
 * - `exists` は常に `true`。クライアントが申告した写真は、あるものとして扱う。
 * `OBJECT_STORAGE_DRIVER=s3` の環境では PersistenceModule が SignedUrlObjectStorage を束縛し、`mock` ではこのクラスを使う。
 *
 * 全体の流れ:
 * - IssueUploadUrls が `createSignedUploadUrl` を呼ぶ（アップロード用。パスは domain の issuePhotoPath がサーバー側で決める）。
 * - CompleteEvidenceUpload が `exists` を呼ぶ（クライアントが申告した写真が本当にあるかの確認）。
 * - ListEvidences が `createSignedReadUrl` を呼ぶ（閲覧用。権限判定の証明 PhotoAccessGrant が必須）。
 */
export class MockObjectStorage implements ObjectStorage {
  /** クライアントが PUT で直接アップロードするための URL（モック。署名なし）。 */
  createSignedUploadUrl(path: StoragePath, expiresInSec: number): Promise<string> {
    return Promise.resolve(mockUrl(path, expiresInSec));
  }

  /** 閲覧用の URL（モック。署名なし）。`PhotoAccessGrant` を要求する型は、本物と同じにしてある */
  createSignedReadUrl(_grant: PhotoAccessGrant, path: StoragePath, expiresInSec: number): Promise<string> {
    return Promise.resolve(mockUrl(path, expiresInSec));
  }

  /** 常に存在するとして扱う */
  exists(_path: StoragePath): Promise<boolean> {
    return Promise.resolve(true);
  }
}

function mockUrl(path: StoragePath, expiresInSec: number): string {
  return `http://localhost:8080/mock-storage/${path}?expires=${String(expiresInSec)}`;
}
