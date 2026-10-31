import { z } from "zod";
import type { UploadingSession } from "../../../domain/evidence/upload-session.ts";
import type { UploadUrlsResult } from "../../../application/ports/usecases/issue-upload-urls.port.ts";
import type { OwnerTaskView } from "../../../domain/task/task-view.ts";
import type { EvidenceListResult } from "../../../application/ports/usecases/list-evidences.port.ts";
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { todo } from "../../../application/shared/todo.ts";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import type { UserId } from "../../../domain/shared/ids.ts";
import { CompleteEvidenceUploadUseCase } from "../../../application/usecases/evidence/complete-evidence-upload.usecase.ts";
import { IssueUploadUrlsUseCase } from "../../../application/usecases/evidence/issue-upload-urls.usecase.ts";
import { ListEvidencesUseCase } from "../../../application/usecases/evidence/list-evidences.usecase.ts";
import { StartEvidenceUploadSessionUseCase } from "../../../application/usecases/evidence/start-evidence-upload-session.usecase.ts";
import { parseTaskId } from "../../../domain/shared/id-parsers.ts";
/**
 * 責務: /api/tasks/:id 配下で証拠アップロードセッションの開始・URL 発行・完了と証拠一覧取得を受け付け、入力を検証して対応するユースケースへ渡す。写真データの転送と業務判定は担わない。
 *
 * 全体の流れ:
 *   HTTP リクエスト → 全体のガード（Origin、セッション）→ このコントローラ → ユースケース → レスポンス
 *   AppModule から読み込まれる TasksModule の presentation 層に置く。
 *   認証ガードがセッションを確認し、@CurrentUser() が利用者 ID を渡す。
 *   共通の tasks/:id prefix の下で upload-session と evidences の各 route を受け、path / header / body を検証して use case を呼ぶ。
 *   写真本体は署名付き URL を通じてクライアントから Object Storage へ送られ、complete が保存済みオブジェクトを確定する。
 *
 * 各ハンドラの実装（presentation 層の仕事はここまで）:
 *   1. Zod で、パス・クエリ・ヘッダ・本文を検証する（形式の誤りは ZodError → 400）。
 *   2. parse*Id などで、文字列を名目型に変換する。
 *   3. ユースケースの execute を呼び、戻り値をそのまま返す。
 * 業務のルール（権限、状態の遷移、排他）は、ここに書かない。ユースケースと domain の責務である。
 */
@Controller("tasks/:id")
export class EvidenceController {
  constructor(
    @Inject(CompleteEvidenceUploadUseCase) protected readonly completeEvidenceUpload: CompleteEvidenceUploadUseCase,
    @Inject(IssueUploadUrlsUseCase) protected readonly issueUploadUrls: IssueUploadUrlsUseCase,
    @Inject(ListEvidencesUseCase) protected readonly listEvidences: ListEvidencesUseCase,
    @Inject(StartEvidenceUploadSessionUseCase) protected readonly startEvidenceUploadSession: StartEvidenceUploadSessionUseCase,
  ) {}

  /**
   * 初回または追加証拠のアップロードセッションを開始する。
   *
   * HTTP: POST /api/tasks/:id/evidence-upload-sessions → 201
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の提出者 ID、path の :id（タスク ID）、JSON body の submissionType。
   * 呼び出し先: StartEvidenceUploadSessionUseCase.execute
   * 主な失敗: NOT_FOUND、FORBIDDEN、DEADLINE_EXPIRED、STATE_CONFLICT
   */
  @Post("evidence-upload-sessions")
  @HttpCode(201)
 startSession(@CurrentUser() user: UserId, @Param("id") id: string, @Body() body: unknown): Promise<UploadingSession> {
  const { submissionType } = z.object({
    submissionType: z.enum(["initial", "additional"]),
  }).parse(body);  
  const taskId = parseTaskId(id);
    return this.startEvidenceUploadSession.execute({
      userId: user,
      taskId,
      submissionType,
    });
  }

  /**
   * セッションの写真枠ごとに署名付き PUT URL を発行する。
   *
   * HTTP: POST /api/tasks/:id/evidence-upload-sessions/:sessionId/upload-urls → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の利用者 ID、path の :id（タスク ID）と :sessionId、JSON body の photos 配列（slot と extension）。
   * 呼び出し先: IssueUploadUrlsUseCase.execute
   * 主な失敗: NOT_FOUND、FORBIDDEN、STATE_CONFLICT、DEADLINE_EXPIRED
   */
  @Post("evidence-upload-sessions/:sessionId/upload-urls")
  @HttpCode(200)
  issueUrls(@CurrentUser() _user: UserId, @Param("id") _id: string, @Param("sessionId") _sessionId: string, @Body() _body: unknown): Promise<UploadUrlsResult> {
    return todo("EvidenceController.issueUrls");
  }

  /**
   * アップロード済み写真を検証し、証拠提出とタスク更新を確定する。
   *
   * HTTP: POST /api/tasks/:id/evidence-upload-sessions/:sessionId/complete → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の提出者 ID、Idempotency-Key ヘッダ、path の :id と :sessionId、JSON body の photoPaths 配列。
   * 呼び出し先: CompleteEvidenceUploadUseCase.execute
   * 主な失敗: VALIDATION_ERROR、IDEMPOTENCY_KEY_REUSED、NOT_FOUND、FORBIDDEN、STATE_CONFLICT、DEADLINE_EXPIRED、INVALID_EVIDENCE_COUNT、ALREADY_EXISTS
   */
  @Post("evidence-upload-sessions/:sessionId/complete")
  @HttpCode(200)
  complete(@CurrentUser() _user: UserId, @Headers("idempotency-key") _key: string | undefined, @Param("id") _id: string, @Param("sessionId") _sessionId: string, @Body() _body: unknown): Promise<OwnerTaskView> {
    return todo("EvidenceController.complete");
  }

  /**
   * 閲覧権限を確認して証拠と写真の短期閲覧 URL を返す。
   *
   * HTTP: GET /api/tasks/:id/evidences → 200
   * 認証: 必要（セッション。@CurrentUser で利用者の ID を受け取る）
   * 入力: 利用元: @CurrentUser() の閲覧者 ID、path の :id（タスク ID）。
   * 呼び出し先: ListEvidencesUseCase.execute
   * 主な失敗: NOT_FOUND、FORBIDDEN
   */
  @Get("evidences")
  @HttpCode(200)
  list(@CurrentUser() _user: UserId, @Param("id") _id: string): Promise<EvidenceListResult> {
    return todo("EvidenceController.list");
  }
}
