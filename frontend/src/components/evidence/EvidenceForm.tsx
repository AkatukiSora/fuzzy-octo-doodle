"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "../layout/PageHeader";
import { BottomNavigation } from "../layout/BottomNavigation";
import { TaskInfoCard } from "../tasks/TaskInfoCard";
import { EvidencePhotoPicker } from "./EvidencePhotoPicker";
import { getEvidenceTask, submitEvidence, type EvidenceTask, type SubmissionType } from "../../lib/evidenceApi";
import styles from "./Evidence.module.css";

const dateText = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(value));

export function EvidenceForm({ type }: { type: SubmissionType }) {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const [task, setTask] = useState<EvidenceTask | null>(null);
  const [files, setFiles] = useState<(File | null)[]>([null, null, null]);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const additional = type === "additional";
  const base = `/tasks/${encodeURIComponent(taskId)}`;

  useEffect(() => {
    let active = true;
    getEvidenceTask(taskId).then((data) => {
      if (active) setTask(data);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "タスクを取得できませんでした");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId]);

  async function onSubmit() {
    const selected = files.filter((file): file is File => file !== null);
    if (!task || busy || selected.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await submitEvidence(taskId, type, selected);
      // メモの保存APIは存在しないため、ここでは送信しない。
      router.push(`${base}/evidence/${additional ? "additional/" : ""}complete`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提出に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={additional ? "追加証拠の提出" : "証拠提出"} backHref={base} />
      <main className={styles["main"]}>
        {loading ? <p>タスクを読み込んでいます...</p> : task ? (
          <>
            <TaskInfoCard title={task.title} deadline={dateText(task.deadlineAt)} />
            {additional && <div className={styles["notice"]}>
              <strong>追加の証拠を提出してください</strong>
              <p>異議申し立てにより追加証拠が求められています。期限内に提出してください。</p>
            </div>}
            <EvidencePhotoPicker files={files} onChange={setFiles} disabled={busy} />
            <section className={styles["memoSection"]}>
              <h2>メモ（任意）</h2>
              <textarea value={memo} maxLength={200} disabled={busy}
                placeholder="補足があれば入力してください"
                onChange={(event) => { setMemo(event.target.value); }} />
              <div className={styles["counter"]}>{memo.length} / 200</div>
              <p className={styles["hint"]}>現在、メモはサーバーに保存されません。</p>
            </section>
            {error && <p role="alert" className={styles["error"]}>{error}</p>}
            <button type="button" className={styles["primary"]}
              disabled={busy || task.viewer !== "owner" || !files.some(Boolean)}
              onClick={() => { void onSubmit(); }}>
              {busy ? "アップロード中..." : additional ? "追加証拠を提出する" : "提出する"}
            </button>
            {additional && <button type="button" className={styles["secondary"]}
              disabled={busy} onClick={() => { router.push(base); }}>キャンセル</button>}
          </>
        ) : <p role="alert" className={styles["error"]}>{error || "タスクを取得できませんでした"}</p>}
      </main>
      <BottomNavigation />
    </>
  );
}
