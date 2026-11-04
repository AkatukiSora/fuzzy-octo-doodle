import styles from "./ObjectionCompleteHero.module.css";

export function ObjectionCompleteHero() {
  return (
    <section className={styles["hero"]}>
      <div className={styles["check"]} aria-hidden="true">
        ✓
      </div>
      <h2>入力内容を保存しました</h2>
      <p>現在は画面確認用です。</p>
      <p>異議申し立てはまだ送信されていません。</p>
    </section>
  );
}
