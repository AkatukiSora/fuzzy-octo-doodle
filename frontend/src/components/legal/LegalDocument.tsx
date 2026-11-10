import type { ReactNode } from "react";
import styles from "./LegalDocument.module.css";

export function LegalDocument({ updatedAt, children }: { updatedAt: string; children: ReactNode }) {
  return <article className={styles.document}>
    <p className={styles.date}>最終更新日：{updatedAt}</p>
    <div className={styles.body}>{children}</div>
    <p className={styles.note}>※ 本文は公開前の草案です。運営者情報、実際のデータ取扱い、決済方法などを確認し、必要に応じて専門家の確認を受けてください。</p>
  </article>;
}
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}
