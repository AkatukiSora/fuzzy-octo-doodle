import { MockStorageController } from "../presentation/http/evidence/mock-storage.controller.ts";
import { Module } from "@nestjs/common";
import { PersistenceModule } from "./persistence.module.ts";
import { SharedApplicationModule } from "./shared-application.module.ts";
import { CreateTaskUseCase } from "../application/usecases/tasks/create-task.usecase.ts";
import { ListMyTasksUseCase } from "../application/usecases/tasks/list-my-tasks.usecase.ts";
import { GetTaskUseCase } from "../application/usecases/tasks/get-task.usecase.ts";
import { GetRetryTemplateUseCase } from "../application/usecases/tasks/get-retry-template.usecase.ts";
import { StartEvidenceUploadSessionUseCase } from "../application/usecases/evidence/start-evidence-upload-session.usecase.ts";
import { IssueUploadUrlsUseCase } from "../application/usecases/evidence/issue-upload-urls.usecase.ts";
import { CompleteEvidenceUploadUseCase } from "../application/usecases/evidence/complete-evidence-upload.usecase.ts";
import { ListEvidencesUseCase } from "../application/usecases/evidence/list-evidences.usecase.ts";
import { TasksController } from "../presentation/http/tasks/tasks.controller.ts";
import { EvidenceController } from "../presentation/http/evidence/evidence.controller.ts";

/**
 * 責務: タスクと証拠の HTTP 機能をひとつの NestJS モジュールにまとめ、コントローラ・ユースケース・永続化および共有 application 依存を DI に登録する。
 *
 * composition 層。コントローラとユースケースを Nest の DI に登録し、AppModule から読み込まれる。
 * ユースケースが @Inject する port（リポジトリなど）は、PersistenceModule が束縛して公開している。
 * ユースケースを足したら、providers に追加する（追加し忘れると起動時に依存が解決できずに失敗する）。
 * TasksController と EvidenceController はどちらもこのモジュールで登録し、HTTP route から対応するユースケースへ接続する。
 * usecases の各クラスを providers に登録する。port の実装は PersistenceModule、共有 publisher などは SharedApplicationModule が提供する。
 * 新しいユースケースを追加したときは usecases 一覧にも加え、providers への登録漏れを防ぐ。
 */
@Module({
  imports: [PersistenceModule, SharedApplicationModule],
  controllers: [MockStorageController, TasksController, EvidenceController],
  providers: [CreateTaskUseCase, ListMyTasksUseCase, GetTaskUseCase, GetRetryTemplateUseCase, StartEvidenceUploadSessionUseCase, IssueUploadUrlsUseCase, CompleteEvidenceUploadUseCase, ListEvidencesUseCase],
})
export class TasksModule {}
