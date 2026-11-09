"use client";

import { useEffect, useState } from "react";
import type { Payment, PaymentData } from "../../lib/payments";
import { inquiryReasons, validateInquiry } from "../../lib/payments";
import { Button } from "../ui/Button";
import { PaymentCard, PaymentDataMessage, PaymentSummary } from "./PaymentParts";
import styles from "./Payments.module.css";

export function PaymentInquiryForm({ result }: { result: PaymentData<Payment> }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => { urls.forEach(url => { URL.revokeObjectURL(url); }); };
  }, [files]);
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
      <div className={styles["stack"]}>
        <label htmlFor="inquiry-images" className={styles["legend"]}>添付画像 <span className={styles["muted"]}>任意・最大3枚</span></label>
        <div className={styles["attachments"]}>
        <label htmlFor="inquiry-images" className={styles["uploadTile"]}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>
          <span>画像を追加</span>
        <input id="inquiry-images" className={styles["upload"]} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="image-help image-error" onChange={event => {
          const next = [...files, ...Array.from(event.target.files ?? [])];
          const invalid = next.length > 3 ? "添付画像は最大3枚です。" : next.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type)) ? "JPEG・PNG・WebPの画像を選択してください。" : null;
          setFileError(invalid);
          if (!invalid) setFiles(next);
          event.target.value = "";
        }} />
        </label>
        {files.length === 0 && <><span className={styles["uploadPlaceholder"]} aria-hidden="true">＋</span><span className={styles["uploadPlaceholder"]} aria-hidden="true">＋</span></>}
        </div>
        <p id="image-help" className={styles["muted"]}>JPEG・PNG・WebP。画像はこの画面内でのみ確認できます。</p>
        <div id="image-error" role="alert">{fileError}</div>
        {files.length > 0 && <div className={styles["attachments"]}>{files.map((file, index) => <div key={`${String(index)}-${file.name}`} className={styles["attachment"]}>
          {previews[index] && <img src={previews[index]} alt={`添付画像 ${String(index + 1)}`} />}
          {file.name}<button type="button" aria-label={`${file.name}を削除`} onClick={() => { setFiles(files.filter((_, position) => position !== index)); setFileError(null); }}>削除</button>
        </div>)}</div>}
      </div>
      <div id="inquiry-errors" aria-live="polite">{errors.length > 0 && <ul className={styles["errors"]}>{errors.map(error => <li key={error}>{error}</li>)}</ul>}</div>
      <Button type="submit" disabled fullWidth aria-describedby="inquiry-unavailable">問い合わせを送信する（準備中）</Button>
    </form>
  </>;
}
