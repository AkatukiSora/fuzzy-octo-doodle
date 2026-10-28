
"use client";

import { useEffect, useState } from "react";
import { Card } from "../ui/Card";
import { ReportMenu } from "../ui/ReportMenu";
import styles from "./CommunityTaskCard.module.css";

interface Reaction {
  emoji: string;
  count: number;
  reacted?: boolean;
}

interface CommunityTaskCardProps {
  userName: string;
  avatarUrl?: string;
  timeAgo: string;
  taskTitle: string;
  status: string;
  deadlineAt?: string;
  reviewEndsAt?: string;
  reactions: Reaction[];
  onReactionClick?: (emoji: string) => void;
  onDetailClick?: () => void;
  onReport?: () => void;
}

export function CommunityTaskCard({
  userName,
  avatarUrl,
  timeAgo,
  taskTitle,
  status,
  deadlineAt,
  reviewEndsAt,
  reactions,
  onReactionClick,
  onDetailClick,
  onReport,
}: CommunityTaskCardProps) {
  const [now, setNow] = useState<number | null>(null);
  const isReviewing = status === "審査中" || status === "reviewing";
  const targetTime = isReviewing ? reviewEndsAt : deadlineAt;

  useEffect(() => {
    if (!targetTime) return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [targetTime]);

  const remainingTime =
    targetTime !== undefined && now !== null
      ? formatRemainingTime(targetTime, now)
      : null;
  const timeLabel =
    remainingTime === "期限切れ"
      ? isReviewing
        ? "審査終了時刻を過ぎています"
        : "期限切れ"
      : remainingTime === null
        ? null
        : isReviewing
          ? `審査終了まで${remainingTime}`
          : `期限まで${remainingTime}`;

  return (
    <Card padding="md" variant="outlined">
      <article className={styles["content"]}>
        {/* ユーザー情報 */}
        <div className={styles["header"]}>
          <div className={styles["userInfo"]}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className={styles["avatar"]}
              />
            ) : (
              <div className={styles["avatarPlaceholder"]}>
                {userName.charAt(0)}
              </div>
            )}

            <div>
              <p className={styles["userName"]}>
                {userName}
              </p>

              <p className={styles["time"]}>
                タスクを作成しました・{timeAgo}
              </p>
            </div>
          </div>

          {/* 投稿メニュー */}
          <ReportMenu
            {...(onReport !== undefined ? { onReport } : {})}
          />
        </div>

        {/* タスク名 */}
        <h3 className={styles["taskTitle"]}>
          {taskTitle}
        </h3>

        {/* ステータス・残り時間 */}
        <div className={styles["statusRow"]}>
          <span className={styles["status"]}>
            {status}
          </span>

          {timeLabel !== null && (
            <span className={styles["remaining"]}>
              ◷ {timeLabel}
            </span>
          )}
        </div>

        {/* リアクション・詳細ボタン */}
        <div className={styles["footer"]}>
          <div className={styles["reactions"]}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={[
                  styles["reactionButton"],
                  reaction.reacted ? styles["reacted"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onReactionClick?.(reaction.emoji);
                }}
                disabled={!onReactionClick}
                aria-pressed={reaction.reacted ?? false}
                aria-label={`${reaction.emoji} リアクション ${String(reaction.count)}件`}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles["detailButton"]}
            onClick={onDetailClick}
            disabled={!onDetailClick}
          >
            詳細を見る →
          </button>
        </div>
      </article>
    </Card>
  );
}

function formatRemainingTime(deadlineAt: string, now: number): string | null {
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline)) return null;

  const difference = deadline - now;
  if (difference <= 0) return "期限切れ";

  const totalMinutes = Math.ceil(difference / 60_000);
  if (totalMinutes < 60) return `あと${totalMinutes}分`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `あと${totalHours}時間`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `あと${days}日${hours}時間` : `あと${days}日`;
}
