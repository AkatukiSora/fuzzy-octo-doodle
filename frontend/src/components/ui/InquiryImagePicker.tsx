"use client";

import { useEffect, useState } from "react";
import { inquiryImageError, inquiryImageTypes } from "../../lib/inquiryImages";
import styles from "./InquiryImagePicker.module.css";

interface Props {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  readOnly?: boolean;
}

/** Shared local-only attachment picker for payment and general inquiries. */
export function InquiryImagePicker({ id, files, onChange, readOnly = false }: Props) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => { urls.forEach(url => { URL.revokeObjectURL(url); }); };
  }, [files]);

  return <div className={styles["stack"]}>
    <div className={styles["label"]}>添付画像 <span className={styles["muted"]}>任意・最大3枚</span></div>
    {!readOnly && <div className={styles["grid"]}>
      <label htmlFor={id} className={styles["tile"]}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>
        <span>画像を追加</span>
        <input id={id} className={styles["input"]} type="file" accept={inquiryImageTypes.join(",")} multiple aria-describedby={`${id}-help ${id}-error`} onChange={event => {
          const next = [...files, ...Array.from(event.target.files ?? [])];
          const invalid = inquiryImageError(next);
          setError(invalid);
          if (!invalid) onChange(next);
          event.target.value = "";
        }} />
      </label>
      {files.length === 0 && <><span className={styles["placeholder"]} aria-hidden="true">＋</span><span className={styles["placeholder"]} aria-hidden="true">＋</span></>}
    </div>}
    {!readOnly && <p id={`${id}-help`} className={styles["muted"]}>JPEG・PNG・WebP。画像はこの画面内でのみ確認できます。</p>}
    <div id={`${id}-error`} role="alert">{!readOnly && error}</div>
    {files.length > 0 ? <div className={styles["grid"]}>{files.map((file, index) => <div key={`${String(index)}-${file.name}`} className={styles["attachment"]}>
      {previews[index] && <img src={previews[index]} alt={`添付画像 ${String(index + 1)}`} />}
      <span>{file.name}</span>
      {!readOnly && <button type="button" aria-label={`${file.name}を削除`} onClick={() => { onChange(files.filter((_, position) => position !== index)); setError(null); }}>削除</button>}
    </div>)}</div> : readOnly && <p className={styles["muted"]}>添付画像はありません。</p>}
  </div>;
}
