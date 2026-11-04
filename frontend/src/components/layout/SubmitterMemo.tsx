import styles from "./SubmitterMemo.module.css";

interface SubmitterMemoProps {
  memo: string;
}

export function SubmitterMemo({ memo }: SubmitterMemoProps) {
  return (
    <section className={styles["section"]} aria-labelledby="submitter-memo-title">
      <h2 id="submitter-memo-title" className={styles["title"]}>
        提出者のメモ
      </h2>
      <div className={styles["memo"]}>
        <p>{memo}</p>
      </div>
    </section>
  );
}
