
import styles from "./TaskStatsCard.module.css";

interface TaskStatsCardProps {
  completionRate: number | null;
  completedCount: number;
  overdueCount: number;
  activeCount?: number;
}

export function TaskStatsCard({
  completionRate,
  completedCount,
  overdueCount,
  activeCount,
}: TaskStatsCardProps) {
  const safeRate = completionRate !== null && Number.isFinite(completionRate)
    ? Math.max(0, Math.min(100, completionRate))
    : 0;

  const displayRate = Math.round(safeRate);

  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  // 丸い線端の長さを考慮して、100%未満では重なりを防ぐ
  const capRatio = (10 / circumference) * 100;

  const adjustedRate =
    safeRate === 0
      ? 0
      : safeRate === 100
        ? 100
        : Math.max(0, safeRate - capRatio);

  const dashOffset =
    circumference * (1 - adjustedRate / 100);

  return (
    <section
      className={styles["card"]}
      aria-label="タスクの統計"
    >
      <div className={styles["stat"]}>
        <p className={styles["label"]}>達成率</p>

        <div
          className={styles["progressWrapper"]}
          role="progressbar"
          aria-label="達成率"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completionRate === null ? undefined : displayRate}
          aria-valuetext={completionRate === null ? "集計対象のタスクがありません" : `${String(displayRate)}%`}
        >
          <svg
            viewBox="0 0 120 120"
            className={styles["progressSvg"]}
            aria-hidden="true"
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e8e5e5"
              strokeWidth="10"
            />

            {safeRate > 0 && (
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="#6940ff"
                strokeWidth="10"
                strokeLinecap={safeRate === 100 ? "butt" : "round"}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 60 60)"
                className={styles["progressCircle"]}
              />
            )}
          </svg>

          <span className={styles["percentage"]}>
            {completionRate === null ? "—" : `${String(displayRate)}%`}
          </span>
        </div>
      </div>

      <div className={styles["stat"]}>
        <p className={styles["label"]}>{activeCount === undefined ? "達成件数" : "進行中のタスク"}</p>

        <p className={styles["number"]}>
          {activeCount ?? completedCount}
          <span className={styles["unit"]}>件</span>
        </p>
      </div>

      <div className={styles["stat"]}>
        <p className={styles["label"]}>期限切れ件数</p>

        <p className={`${styles["number"] ?? ""} ${styles["overdue"] ?? ""}`}>
          {overdueCount}
          <span className={styles["unit"]}>件</span>
        </p>
      </div>
    </section>
  );
}
