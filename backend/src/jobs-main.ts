import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { z } from "zod";
import { setTimeout } from "node:timers/promises";
import { JobsModule } from "./composition/jobs.module.ts";
import { CloseReviewPeriodsUseCase } from "./application/usecases/jobs/close-review-periods.usecase.ts";
import { ExpireAdditionalEvidenceUseCase } from "./application/usecases/jobs/expire-additional-evidence.usecase.ts";
import { ExpireInitialTasksUseCase } from "./application/usecases/jobs/expire-initial-tasks.usecase.ts";
import { ExpireStaleUploadSessionsUseCase } from "./application/usecases/jobs/expire-stale-upload-sessions.usecase.ts";

/**
 * 責務: 定期ジョブを 1 回実行して終了する、プロセスの入口。HTTP サーバーは立てない。
 * 業務の処理は持たず、指定されたジョブのユースケースを 1 つ呼ぶだけである（main.ts の HTTP 版に対する、ジョブ版の入口）。
 *
 * 使い方（API と同じ Docker イメージで、起動コマンドだけを変える）:
 *   node dist/jobs-main.js <ジョブ名>
 *   例: Kubernetes の CronJob の `command: ["node", "dist/jobs-main.js", "expire-initial-tasks"]`
 *
 * 環境変数:
 * - JOB_BATCH_SIZE: 1 回の実行で処理する最大件数（正の整数。省略時は 100）。
 * - JOB_INTERVAL_SECONDS: 指定した場合は実行完了後に待機し、次の巡回を実行する（compose用）。
 * - ジョブ名 all は4つのライフサイクル処理を順番に実行する。既存の単一ジョブ指定は1回実行のまま。
 * - DB の接続設定は API と同じ（PersistenceModule が読む）。
 *
 * 全体の流れ:
 *   CronJob が起動 → 引数のジョブ名と JOB_BATCH_SIZE を Zod で検証 → JobsModule だけで DI コンテナを作る
 *   （AppModule は使わないので、ガードや HTTP は載らない）→ ユースケースの execute を 1 回呼ぶ → 結果を JSON で標準出力へ → 接続を閉じて終了。
 *
 * 終了コード: 成功は 0。ジョブ名の誤り、設定の誤り、ユースケースの失敗は例外のまま伝わり、Node が 1 で終了する
 * （CronJob が失敗として記録し、backoffLimit に従って再試行する）。
 *
 * 複数のジョブが同時に動いても、二重処理が起きないようにするのはユースケースと repository の責務である
 * （行ロック `FOR UPDATE SKIP LOCKED` など）。CronJob 側でも `concurrencyPolicy: Forbid` を推奨する。
 */

/** ジョブ名とユースケースの対応表。ジョブを足すときは、ここと JobsModule の providers に足す */
const JOB_NAMES = ["expire-initial-tasks", "close-review-periods", "expire-additional-evidence", "expire-stale-upload-sessions"] as const;

const JOBS = {
  "expire-initial-tasks": ExpireInitialTasksUseCase,
  "close-review-periods": CloseReviewPeriodsUseCase,
  "expire-additional-evidence": ExpireAdditionalEvidenceUseCase,
  "expire-stale-upload-sessions": ExpireStaleUploadSessionsUseCase,
} as const satisfies Record<(typeof JOB_NAMES)[number], unknown>;

const args = z
  .object({
    jobName: z.enum([...JOB_NAMES, "all"]),
    batchSize: z.coerce.number().int().positive().default(100),
    intervalSeconds: z.coerce.number().int().min(1).optional(),
  })
  .parse({ jobName: process.argv[2], batchSize: process.env["JOB_BATCH_SIZE"], intervalSeconds: process.env["JOB_INTERVAL_SECONDS"] });

const context = await NestFactory.createApplicationContext(JobsModule);
const stop = new AbortController();
const stopped = () => stop.signal.aborted;
const shutdown = () => { stop.abort(); };
if (args.intervalSeconds !== undefined) {
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
try {
  do {
    for (const jobName of args.jobName === "all" ? JOB_NAMES : [args.jobName]) {
      if (stopped()) break;
      const result = await context.get(JOBS[jobName]).execute({ batchSize: args.batchSize });
      console.log(JSON.stringify({ msg: "job finished", job: jobName, ...result }));
    }
    if (args.intervalSeconds === undefined || stopped()) break;
    try {
      await setTimeout(args.intervalSeconds * 1000, undefined, { signal: stop.signal });
    } catch (error) {
      if (!stopped()) throw error;
    }
  } while (!stopped());
} finally {
  process.removeListener("SIGTERM", shutdown);
  process.removeListener("SIGINT", shutdown);
  await context.close();
}
