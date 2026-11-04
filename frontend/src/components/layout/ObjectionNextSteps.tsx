import styles from "./ObjectionNextSteps.module.css";

export function ObjectionNextSteps() {
  return (
    <section className={styles["card"]}>
      <div className={styles["icon"]} aria-hidden="true">
        ◷
      </div>
      <div>
        <h2>今後の流れ</h2>
        <p>タスク登録者が24時間以内に追加証拠を提出します。</p>
        <p>追加の証拠が提出されると、結果が通知されます。</p>
      </div>
    </section>
  );
}
