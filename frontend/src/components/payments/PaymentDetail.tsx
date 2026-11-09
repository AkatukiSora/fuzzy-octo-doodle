import Link from "next/link";
import type { Payment, PaymentData } from "../../lib/payments";
import { formatPaymentAmount, formatPaymentDate } from "../../lib/payments";
import { Button } from "../ui/Button";
import { InquiryStatusBadge, PaymentCard, PaymentDataMessage, PaymentMethodCard, PaymentStatusBadge, PaymentTask } from "./PaymentParts";
import styles from "./Payments.module.css";

export function PaymentDetail({ result }: { result: PaymentData<Payment> }) {
  const payment = result.kind === "ready" ? result.data : null;
  return <>
    {result.kind !== "ready" && <PaymentDataMessage kind={result.kind} subject="決済詳細" />}
    {payment && <PaymentTask payment={payment} />}
    <PaymentCard title="請求情報">
      <div className={styles["row"]}><div><p className={styles["muted"]}>請求金額</p><p className={styles["amount"]}>{payment ? formatPaymentAmount(payment.amount) : "—"}</p></div><div><p className={styles["muted"]}>決済状態</p>{payment ? <PaymentStatusBadge status={payment.status} /> : "確認できません"}</div></div>
      <hr className={styles["divider"]} />
      <dl className={styles["facts"]}>
        <dt>請求理由</dt><dd>{payment?.reason ?? "—"}</dd>
        <dt>請求日時</dt><dd>{payment ? formatPaymentDate(payment.chargedAt) : "—"}</dd>
        <dt>対象タスクの期限</dt><dd>{payment ? formatPaymentDate(payment.task.deadlineAt) : "—"}</dd>
        <dt>請求ID</dt><dd>{payment?.id ?? "—"}</dd>
      </dl>
    </PaymentCard>
    <PaymentMethodCard method={payment?.method ?? null} unavailable={!payment} />
    <PaymentCard title="操作">
      <Button disabled fullWidth aria-describedby="payment-retry-note">支払いを再試行する（準備中）</Button>
      <p id="payment-retry-note" className={styles["muted"]}>支払い再試行はまだ利用できません。決済は実行されません。</p>
      {payment ? <Link className={styles["link"]} href={`/mypage/payments/${encodeURIComponent(payment.id)}/inquiry`}>請求について問い合わせる ›</Link> : <Button variant="secondary" disabled fullWidth>請求について問い合わせる（請求情報未取得）</Button>}
      {payment?.inquiry && <Link className={styles["link"]} href={`/mypage/payments/inquiries/${encodeURIComponent(payment.inquiry.id)}`}><InquiryStatusBadge status={payment.inquiry.status} /> 状況を見る ›</Link>}
    </PaymentCard>
    <aside className={styles["notice"]}><strong>請求に関する注意事項</strong><p>支払いを完了しても、対象タスクの達成状態は変わりません。請求取消と支払い完了は別の状態です。問い合わせが調査中でも、決済が完了したことを意味しません。</p></aside>
  </>;
}
