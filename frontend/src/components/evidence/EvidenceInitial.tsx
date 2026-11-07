
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "../layout/PageHeader";
import { BottomNavigation } from "../layout/BottomNavigation";
import {
  getEvidenceTask,
  submitEvidence,
  type EvidenceTask,
} from "../../lib/evidenceApi";
import styles from "./EvidenceInitial.module.css";

const allowed = ["image/jpeg", "image/png", "image/webp"];

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function EvidenceInitial() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();

  const [task, setTask] = useState<EvidenceTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<(File | null)[]>([null, null, null]);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [retry, setRetry] = useState(0);

  const previewUrls = useMemo(
    () => files.map((file) => (file ? URL.createObjectURL(file) : null)),
    [files],
  );

  useEffect(
    () => () => {
      previewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    },
    [previewUrls],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);

    getEvidenceTask(taskId)
      .then((value) => {
        if (active) {
          setTask(value);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "タスクを読み込めませんでした",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [taskId, retry]);

  const count = files.filter(Boolean).length;

  const canSubmit =
    !!task &&
    task.viewer === "owner" &&
    task.status === "active" &&
    count > 0 &&
    !busy;

  function choose(file: File | undefined, index: number) {
    if (!file) return;

    if (!allowed.includes(file.type)) {
      setError("JPG・PNG・WebP形式の写真を選択してください");
      return;
    }

    setError("");
    setFiles((current) =>
      current.map((item, i) => (i === index ? file : item)),
    );
  }

  async function submit() {
    if (!canSubmit) return;

    setConfirming(false);
    setBusy(true);
    setError("");

    try {
      await submitEvidence(
        taskId,
        "initial",
        files.filter((file): file is File => file !== null),
      );

      router.push(`/tasks/${encodeURIComponent(taskId)}/evidence/complete`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "提出に失敗しました。再度お試しください",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="証拠提出"
        backHref={`/tasks/${encodeURIComponent(taskId)}`}
      />

      <main className={styles["main"]}>
        {loading ? (
          <p className={styles["info"]}>タスクを読み込んでいます…</p>
        ) : task ? (
          <>
            <section
              className={styles["taskCard"]}
              aria-label="提出対象のタスク"
            >
              <div className={styles["taskLabel"]}>タスク名</div>
              <h1 className={styles["taskTitle"]}>{task.title}</h1>
              <div className={styles["deadline"]}>
                <span aria-hidden="true">▣</span> 期限 {dateLabel(task.deadlineAt)}
              </div>
            </section>

            <section className={styles["photoSection"]}>
              <h2 className={styles["sectionTitle"]}>
                証拠写真 <span className={styles["required"]}>必須</span>
              </h2>

              <p className={styles["hint"]}>
                タスクを実施したことがわかる写真を1〜3枚まで選択してください。
              </p>

              <div className={styles["photoGrid"]}>
                {files.map((file: File | null, index: number) => (
                  <div className={styles["photoSlot"]} key={index}>
                    {file && previewUrls[index] ? (
                      <>
                        <img
                          src={previewUrls[index] ?? ""}
                          alt={`選択した証拠写真 ${String(index + 1)}`}
                          className={styles["preview"]}
                        />

                        <button
                          type="button"
                          aria-label={`写真${String(index + 1)}を削除`}
                          className={styles["remove"]}
                          disabled={busy}
                          onClick={() => { setFiles((current) =>
                              current.map((item, i) =>
                                i === index ? null : item,
                              ),
                            ); }
                          }
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <label className={styles["photoInput"]}>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" />
                          <circle cx="12" cy="13" r="3" />
                        </svg>

                        <span>写真を選択</span>
                        <small>{index + 1} / 3</small>

                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          aria-label={`証拠写真${String(index + 1)}を選択`}
                          onChange={(event) => {
                            choose(event.target.files?.[0], index);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className={styles["memoSection"]}>
              <h2 className={styles["sectionTitle"]}>メモ（任意）</h2>

              <div className={styles["memoWrap"]}>
                <textarea
                  value={memo}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => { setMemo(event.target.value); }}
                  placeholder="補足があれば入力してください"
                  aria-label="メモ"
                />
                <span className={styles["counter"]}>
                  {memo.length} / 200
                </span>
              </div>

              <p className={styles["note"]}>
                ※ 現在のAPIはコメント保存に未対応のため、メモは送信されません。
              </p>
            </section>

            {task.viewer !== "owner" || task.status !== "active" ? (
              <p className={styles["error"]}>
                このタスクは現在、初回証拠を提出できません。
              </p>
            ) : null}

            {error && (
              <p className={styles["error"]} role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className={styles["submit"]}
              disabled={!canSubmit}
              onClick={() => { setConfirming(true); }}
            >
              {busy ? "提出中…" : "提出する"}
            </button>
          </>
        ) : (
          <div className={styles["error"]} role="alert">
            {error || "タスクを取得できませんでした"}
            <button
              type="button"
              className={styles["retry"]}
              onClick={() => { setRetry((n) => n + 1); }}
            >
              再試行
            </button>
          </div>
        )}
      </main>

      <BottomNavigation />

      {confirming && (
        <div className={styles["overlay"]} role="presentation">
          <div
            className={styles["dialog"]}
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-confirm-title"
          >
            <h2 id="evidence-confirm-title">
              証拠写真を提出しますか？
            </h2>
            <p>
              選択した{count}枚の写真を提出します。
              初回証拠の提出は1回のみです。
            </p>

            {memo.trim() && (
              <p className={styles["warning"]}>
                入力したメモは保存されません。
              </p>
            )}

            <div className={styles["dialogButtons"]}>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setConfirming(false); }}
              >
                戻る
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void submit();
                }}
              >
                提出する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
