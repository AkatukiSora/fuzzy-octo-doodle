"use client";

import { useState } from "react";
import type { Payment, PaymentData } from "../../lib/payments";
import { inquiryReasons, validateInquiry } from "../../lib/payments";
import { Button } from "../ui/Button";
import { InquiryImagePicker } from "../ui/InquiryImagePicker";
import { PaymentCard, PaymentDataMessage, PaymentSummary } from "./PaymentParts";
import styles from "./Payments.module.css";

export function PaymentInquiryForm({ result }: { result: PaymentData<Payment> }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const errors = touched ? validateInquiry(reason, detail, files) : [];
  return <>
    {result.kind === "ready" ? <PaymentCard><PaymentSummary payment={result.data} /></PaymentCard> : <PaymentDataMessage kind={result.kind} subject="対象の請求" />}
    <p className={styles["notice"]} id="inquiry-unavailable">請求問い合わせの送信は準備中です。入力内容や画像は保存・送信されません。入力の確認のみできます。</p>
    <form className={styles["stack"]} onSubmit={event => { event.preventDefault(); setTouched(true); }} aria-describedby="inquiry-unavailable">
      <fieldset className={styles["fieldset"]}>
        <legend className={styles["legend"]}>問い合わせ理由 <span className={styles["required"]}>必須</span></legend>
        <div className={styles["stack"]}>{Object.entries(inquiryReasons).map(([value, label]) => <label key={value} className={styles["choice"]}>
          <input type="radio" name="reason" value={value} required checked={reason === value} onChange={() => { setReason(value); }} />{label}
        </label>)}</div>
      </fieldset>
      <div>
        <label className={styles["legend"]} htmlFor="inquiry-detail">詳細説明 <span className={styles["required"]}>必須</span></label>
        <textarea id="inquiry-detail" className={styles["textarea"]} value={detail} required aria-invalid={touched && (detail.trim().length === 0 || Array.from(detail).length > 1000)} aria-describedby="detail-count inquiry-errors" placeholder="具体的な状況を入力してください（1〜1000文字）" onChange={event => { setDetail(event.target.value); }} onBlur={() => { setTouched(true); }} />
        <p id="detail-count" className={styles["counter"]}>{Array.from(detail).length} / 1000文字</p>
      </div>
      <InquiryImagePicker id="inquiry-images" files={files} onChange={setFiles} />
      <div id="inquiry-errors" aria-live="polite">{errors.length > 0 && <ul className={styles["errors"]}>{errors.map(error => <li key={error}>{error}</li>)}</ul>}</div>
      <Button type="submit" disabled fullWidth aria-describedby="inquiry-unavailable">問い合わせを送信する（準備中）</Button>
    </form>
  </>;
}
