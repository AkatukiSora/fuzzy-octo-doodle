"use client";

import Link from "next/link";
import { useState } from "react";
import type { Payment, PaymentData, PaymentFilter, PaymentMethod } from "../../lib/payments";
import { filterPayments } from "../../lib/payments";
import { EmptyState } from "../ui/EmptyState";
import { PaymentCard, PaymentDataMessage, PaymentMethodCard, PaymentSummary, InquiryStatusBadge } from "./PaymentParts";
import styles from "./Payments.module.css";

const filters: { value: PaymentFilter; label: string }[] = [{ value: "all", label: "すべて" }, { value: "completed", label: "完了" }, { value: "incomplete", label: "未完了" }];
export function PaymentHistory({ result }: { result: PaymentData<{ payments: Payment[]; method: PaymentMethod | null }> }) {
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const payments = result.kind === "ready" ? filterPayments(result.data.payments, filter) : [];
  return <>
    <PaymentMethodCard method={result.kind === "ready" ? result.data.method : null} unavailable={result.kind !== "ready"} />
    <div className={styles["tabs"]} role="group" aria-label="決済履歴の絞り込み">
      {filters.map(item => <button type="button" key={item.value} className={styles["tab"]} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); }}>{item.label}</button>)}
    </div>
    <p className={styles["muted"]}>「完了」は支払い完了、「未完了」は未払い・決済処理中・決済失敗です。請求取消は「すべて」に表示します。問い合わせの状態は絞り込みに影響しません。</p>
    <div aria-live="polite">
      {result.kind !== "ready" ? <PaymentDataMessage kind={result.kind} subject="決済履歴" collection /> : payments.length === 0 ? <EmptyState title={filter === "all" ? "決済履歴はありません" : "該当する決済履歴はありません"} description="請求が発生すると、ここに表示されます。" /> : <ul className={styles["list"]}>{payments.map(payment => <li key={payment.id}>
        <PaymentCard><PaymentSummary payment={payment} />
          {payment.inquiry && <Link href={`/mypage/payments/inquiries/${encodeURIComponent(payment.inquiry.id)}`}><InquiryStatusBadge status={payment.inquiry.status} /></Link>}
          <Link className={styles["link"]} href={`/mypage/payments/${encodeURIComponent(payment.id)}`}>詳細を見る ›</Link>
        </PaymentCard>
      </li>)}</ul>}
    </div>
  </>;
}
