import Link from "next/link";
import type { ContactSubmission } from "../../lib/contact";
import { Card } from "../ui/Card";
import styles from "./Help.module.css";

/** A success message requires a trusted receipt supplied by the future server API. */
export function ContactCompletion({ result }: { result: ContactSubmission }) {
  return <Card variant="tinted" className={styles["stack"]}>
    {result.kind === "sent" ? <><h2 className={styles["heading"]}>お問い合わせを受け付けました</h2><p className={styles["description"]}>お問い合わせ番号：{result.receipt.id}</p></> : <div role="status"><h2 className={styles["heading"]}>お問い合わせの送信は準備中です</h2><p className={styles["description"]}>お問い合わせは送信されていません。この画面は、送信機能の提供後に受付結果を表示するための画面です。</p></div>}
    <Link href="/mypage/help" className={styles["link"]}>ヘルプ画面に戻る</Link>
  </Card>;
}
