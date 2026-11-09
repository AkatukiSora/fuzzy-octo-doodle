import Link from "next/link";
import type { PaymentData, PaymentInquiry } from "../../lib/payments";
import { formatPaymentDate, inquiryReasons } from "../../lib/payments";
import { InquiryStatusBadge, PaymentCard, PaymentDataMessage } from "./PaymentParts";
import styles from "./Payments.module.css";

const eventLabels = { received: "お問い合わせを受け付けました", investigating: "運営が内容を確認しています", answered: "調査結果をご連絡しました", closed: "対応が完了しました" } as const;
export function PaymentInquiryStatus({ result }: { result: PaymentData<PaymentInquiry> }) {
  const inquiry = result.kind === "ready" ? result.data : null;
  return <>
    {result.kind !== "ready" && <PaymentDataMessage kind={result.kind} subject="問い合わせ状況" />}
    <PaymentCard title="お問い合わせ番号">
      <div className={styles["row"]}><h2>{inquiry?.id ?? "確認できません"}</h2>{inquiry && <InquiryStatusBadge status={inquiry.status} />}</div>
      <hr className={styles["divider"]} />
      <dl className={styles["facts"]}>
        <dt>対象タスク</dt><dd>{inquiry?.taskTitle ?? "—"}</dd>
        <dt>問い合わせ理由</dt><dd>{inquiry ? inquiryReasons[inquiry.reason] : "—"}</dd>
        <dt>送信日時</dt><dd>{inquiry ? formatPaymentDate(inquiry.submittedAt) : "—"}</dd>
        <dt>添付画像</dt><dd>{inquiry ? `${String(inquiry.attachmentCount)}枚` : "—"}</dd>
      </dl>
    </PaymentCard>
    <PaymentCard title="対応の進捗">
      {inquiry && inquiry.events.length > 0 ? <ol className={styles["timeline"]}>{inquiry.events.map(event => <li key={event.id} className={styles["event"]}>
        <h3>{eventLabels[event.status]}</h3><p className={styles["muted"]}>{formatPaymentDate(event.occurredAt)}</p>{event.message && <p>{event.message}</p>}
      </li>)}</ol> : <p className={styles["muted"]}>{inquiry ? "記録された進捗はありません。" : "問い合わせ情報を取得できるようになると、実際の対応履歴を表示します。"}</p>}
    </PaymentCard>
    {inquiry && <Link className={styles["link"]} href={`/mypage/payments/${encodeURIComponent(inquiry.paymentId)}`}>対象の決済詳細を見る ›</Link>}
    <Link className={styles["link"]} href="/mypage">マイページに戻る</Link>
  </>;
}
