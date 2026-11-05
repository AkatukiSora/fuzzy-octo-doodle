import type { IdempotentOperation } from "./idempotency.ts";
import type { ObjectionId, TaskId, UploadSessionId } from "./ids.ts";
import type { ReasonType } from "../objection/objection.ts";

/**
 * 責務: 冪等性の対象の操作ごとに、`RequestHash` の元になるペイロード（リクエストの内容）の型を定める。
 * 計算そのもの（正規化と SHA-256）は application の `hashRequest` の責務で、ここは「何を含めてよいか」の規則だけを持つ。
 * 規則を型として domain に置くのは、「どの入力が同じ要求を決めるか」が業務の規則であり、計算の方法とは独立しているため。
 *
 * 操作ごとのペイロードの型。ここに無い項目は渡せない（余分な項目は型エラー）。
 * すべての値は `null` を含めて必須とし、任意項目の「無い」は `null` で明示する。
 * `Record<IdempotentOperation, …>` なので、冪等性の対象の操作を増やすと、ここにも足さない限り型エラーになる。
 */
export interface RequestPayloads extends Record<IdempotentOperation, Readonly<Record<string, unknown>>> {
  /** タスク作成。deadlineAt は ISO 8601 に正規化し、originalTaskId は再挑戦の元タスク（新規なら null） */
  create_task: Readonly<{
    title: string;
    achievementCondition: string;
    evidenceMethod: string;
    deadlineAt: string;
    penaltyAmount: number;
    isPenaltyPublic: boolean;
    originalTaskId: TaskId | null;
  }>;
  /** 証拠の提出完了。photoPaths は並び順も内容の一部として扱う（クライアントが同じ再送なら同じ並びになる） */
  complete_evidence_upload: Readonly<{
    taskId: TaskId;
    sessionId: UploadSessionId;
    photoPaths: readonly string[];
  }>;
  /** 異議の作成 */
  create_objection: Readonly<{
    taskId: TaskId;
    reasonType: ReasonType;
    reasonDetail: string;
  }>;
  /** 異議の取り下げ */
  withdraw_objection: Readonly<{
    objectionId: ObjectionId;
  }>;
  /** フレンド申請。inviteToken は招待リンクの token */
  create_friend_request: Readonly<{
    inviteToken: string;
  }>;
}
