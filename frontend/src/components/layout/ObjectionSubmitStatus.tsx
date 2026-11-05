import styles from "./ObjectionSubmitStatus.module.css";

export function ObjectionSubmitStatus() {
  return (
    <p className={styles["status"]} role="status">
      異議申し立てを送信しました。
    </p>
  );
}
