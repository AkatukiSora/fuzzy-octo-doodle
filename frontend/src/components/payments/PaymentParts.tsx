import Link from "next/link";
import type { ReactNode } from "react";
import type { InquiryStatus, Payment, PaymentMethod, PaymentStatus } from "../../lib/payments";
import { formatPaymentAmount, formatPaymentDate } from "../../lib/payments";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { TaskStatusBadge } from "../tasks/TaskStatusBadge";
import styles from "./Payments.module.css";

type StatusTone = "danger" | "warning" | "success" | "neutral" | "primary";
const paymentLabels: Record<PaymentStatus, [string, StatusTone]> = {
  unpaid: ["未払い", "danger"], processing: ["決済処理中", "warning"],
  paid: ["支払い完了", "success"], failed: ["決済失敗", "danger"], cancelled: ["請求取消", "neutral"],
};
const inquiryLabels: Record<InquiryStatus, [string, StatusTone]> = {
  received: ["受付済み", "primary"], investigating: ["調査中", "warning"],
  answered: ["回答済み", "primary"], closed: ["対応完了", "neutral"],
};
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const [label, tone] = paymentLabels[status];
  return <Badge variant={tone} className={styles["badge"]}>{label}</Badge>;
}
export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const [label, tone] = inquiryLabels[status];
  return <Badge variant={tone} className={styles["badge"]}>問い合わせ：{label}</Badge>;
}
export function PaymentCard({ children, title }: { children: ReactNode; title?: string }) {
  return <section className={`${styles["card"] ?? ""} ${styles["stack"] ?? ""}`}>{title && <h2>{title}</h2>}{children}</section>;
}
export function PaymentMethodCard({ method, unavailable = false }: { method: PaymentMethod | null; unavailable?: boolean }) {
  return <PaymentCard title="登録中の支払い方法">
    <div className={styles["method"]}>
      {method ? <><strong>{method.brand}</strong><p className={styles["muted"]}>•••• •••• •••• {method.last4}<br />有効期限 {String(method.expiryMonth).padStart(2, "0")} / {String(method.expiryYear).slice(-2)}</p></> : <p className={styles["muted"]}>{unavailable ? "支払い方法の取得は準備中です。登録状況は確認できません。" : "登録済みの支払い方法はありません。"}</p>}
    </div>
    <Button variant="secondary" disabled aria-describedby="payment-method-note">支払い方法を変更する（準備中）</Button>
    <p id="payment-method-note" className={styles["muted"]}>支払い方法の登録・変更はまだ利用できません。</p>
  </PaymentCard>;
}
export function PaymentSummary({ payment }: { payment: Payment }) {
  return <div className={styles["stack"]}>
    <div className={styles["row"]}><h2>{payment.task.title}</h2><PaymentStatusBadge status={payment.status} /></div>
    <p className={styles["muted"]}>{formatPaymentDate(payment.chargedAt)} に請求</p>
    <p className={styles["amount"]}>{formatPaymentAmount(payment.amount)}</p>
  </div>;
}
export function PaymentTask({ payment }: { payment: Payment }) {
  return <PaymentCard>
    <div className={styles["row"]}><h2>{payment.task.title}</h2><TaskStatusBadge status={payment.task.status} /></div>
    <p className={styles["muted"]}>{formatPaymentDate(payment.task.deadlineAt)} 期限</p>
    <Link className={styles["link"]} href={`/tasks/${encodeURIComponent(payment.task.id)}`}>対象タスクを見る ›</Link>
  </PaymentCard>;
}
export function PaymentDataMessage({ kind, subject, collection = false }: { kind: "unavailable" | "not-found" | "error"; subject: string; collection?: boolean }) {
  return <div className={styles["notice"]} role={kind === "unavailable" ? "status" : "alert"}>
    <strong>{kind === "unavailable" ? `${subject}の取得は準備中です` : kind === "not-found" ? `${subject}が見つかりません` : `${subject}を取得できませんでした`}</strong>
    <p>{kind === "unavailable" ? (collection ? "現在は履歴を確認できません。履歴の取得機能が利用可能になるまでお待ちください。" : "現在はデータを確認できません。URLに指定されたIDの存在も確認できません。") : kind === "not-found" ? "URLを確認して、決済履歴から開き直してください。" : "時間をおいて、もう一度お試しください。"}</p>
    <Link className={styles["link"]} href={collection ? "/mypage" : "/mypage/payments"}>{collection ? "マイページへ戻る" : "決済履歴へ戻る"}</Link>
  </div>;
}
