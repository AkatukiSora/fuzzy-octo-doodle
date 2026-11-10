
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "../layout/PageHeader";
import { BottomNavigation } from "../layout/BottomNavigation";
import {
  getEvidenceTask,
  listEvidence,
  type EvidenceItem,
  type EvidenceTask,
  type SubmissionType,
} from "../../lib/evidenceApi";
import styles from "./EvidenceComplete.module.css";

interface EvidenceCompleteProps {
  type: SubmissionType;
}

function dateLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }

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

export function EvidenceComplete({ type }: EvidenceCompleteProps) {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();

  const [task, setTask] = useState<EvidenceTask | null>(null);
  const [item, setItem] = useState<EvidenceItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const additional = type === "additional";
  const base = `/tasks/${encodeURIComponent(taskId)}`;

  useEffect(() => {
    let active = true;

    Promise.all([getEvidenceTask(taskId), listEvidence(taskId)])
      .then(([taskData, evidenceList]) => {
        if (!active) return;

        setTask(taskData);

        const latest =
          [...evidenceList.evidences]
            .filter((evidence) => evidence.submissionType === type)
            .sort(
              (a, b) =>
                Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
            )[0] ?? null;

        setItem(latest);
      })
      .catch((reason: unknown) => {
        if (!active) return;

        setError(
          reason instanceof Error
            ? reason.message
            : "提出情報を取得できませんでした",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [taskId, type]);

  return (
    <>
      <PageHeader
        title={additional ? "追加証拠の提出完了" : "証拠提出完了"}
        backHref={base}
      />

      <main className={styles["main"]}>
        {loading ? (
          <p className={styles["info"]}>
            提出情報を読み込んでいます...
          </p>
        ) : error ? (
          <p role="alert" className={styles["error"]}>
            {error}
          </p>
        ) : (
          <>
            <section className={styles["hero"]}>
              <div
                className={styles["successIcon"]}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 200 160"
                  width="200"
                  height="160"
                  fill="none"
                >
                  <circle
                    cx="100"
                    cy="80"
                    r="53"
                    stroke="#9065F8"
                    strokeWidth="8"
                  />
                  <path
                    d="M78 81L94 97L124 65"
                    stroke="#9065F8"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <g
                    stroke="#B9A0FF"
                    strokeWidth="5"
                    strokeLinecap="round"
                  >
                    <path d="M100 5V17" />
                    <path d="M100 143V155" />
                    <path d="M25 80H37" />
                    <path d="M163 80H175" />
                    <path d="M47 27L56 36" />
                    <path d="M144 124L153 133" />
                    <path d="M153 27L144 36" />
                    <path d="M56 124L47 133" />
                  </g>
                </svg>
              </div>

              <h1>{additional ? "追加証拠を提出しました" : "証拠を提出しました！"}</h1>
              {additional ? (
                <p>
                  提出した証拠はフレンドに通知されます。
                  <br />
                  相手が内容を確認し、対応を行います。
                </p>
              ) : (
                <p>フレンドの確認を待っています。</p>
              )}
            </section>

            {task && (
              <section className={styles["taskCard"]}>
                <span className={styles["taskLabel"]}>
                  {additional ? "対象のタスク" : "タスク名"}
                </span>

                <h2>{task.title}</h2>

                <div className={styles["deadline"]}>
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="16"
                      rx="2"
                    />
                    <path d="M7 3V7M17 3V7M3 10H21" />
                  </svg>
                  期限 {dateLabel(task.deadlineAt)}
                </div>
              </section>
            )}

            <section className={styles["submitted"]}>
              <div className={styles["sectionHeader"]}>
                <h2>提出した証拠写真</h2>
                <span>{item?.photoUrls.length ?? 0}枚</span>
              </div>

              {item && item.photoUrls.length > 0 ? (
                <div className={styles["imageGrid"]}>
                  {item.photoUrls.map(
                    (url: string, index: number) => (
                      <img
                        key={`${String(index)}-${url}`}
                        src={url}
                        alt={`提出した証拠写真${String(index + 1)}`}
                      />
                    ),
                  )}
                </div>
              ) : (
                <p className={styles["info"]}>
                  提出済みの証拠が見つかりませんでした。
                </p>
              )}
            </section>

            {!additional && (
              <section className={styles["statusCard"]}>
                <div
                  className={styles["clockIcon"]}
                  aria-hidden="true"
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 6V12L16 15" />
                  </svg>
                </div>

                <div>
                  <span className={styles["statusLabel"]}>
                    現在のステータス
                  </span>
                  <h2>確認待ち</h2>
                  <p>
                    フレンドが証拠を確認すると、
                    <br />
                    タスクの達成が確定します。
                  </p>
                </div>
              </section>
            )}

            <button
              type="button"
              className={styles["primary"]}
              onClick={() => {
                router.push(base);
              }}
            >
              {additional
                ? "マイタスクに戻る"
                : "タスク詳細に戻る"}
            </button>
          </>
        )}
      </main>

      <BottomNavigation />
    </>
  );
}
