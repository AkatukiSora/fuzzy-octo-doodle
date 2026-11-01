import styles from "./AdditionalEvidenceNotice.module.css";

export function AdditionalEvidenceNotice() {
  return (
    <section
      className={styles["notice"]}
      role="note"
      aria-labelledby="additional-evidence-notice-title"
    >
      <svg
        className={styles["icon"]}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4m0 4h.01" />
      </svg>
      <div className={styles["content"]}>
        <h3 id="additional-evidence-notice-title" className={styles["title"]}>
          追加の証拠を提出してください
        </h3>
        <p className={styles["description"]}>
          フレンドからの異議申し立てにより、追加の証拠の提出が求められています。
          24時間以内に提出してください。
        </p>
      </div>
    </section>
  );
}
