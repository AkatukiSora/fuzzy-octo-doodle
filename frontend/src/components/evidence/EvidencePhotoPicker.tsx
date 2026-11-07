"use client";

import { useEffect, useState } from "react";
import styles from "./Evidence.module.css";

interface Props {
  files: (File | null)[];
  onChange: (next: (File | null)[]) => void;
  disabled?: boolean;
}

export function EvidencePhotoPicker({ files, onChange, disabled = false }: Props) {
  const [urls, setUrls] = useState<(string | null)[]>([null, null, null]);
  useEffect(() => {
    const next = files.map((file) => file ? URL.createObjectURL(file) : null);
    setUrls(next);
    return () => { next.forEach((url) => { if (url) URL.revokeObjectURL(url); }); };
  }, [files]);

  return (
    <section className={styles["photosSection"]}>
      <h2>証拠写真 <span className={styles["required"]}>必須</span></h2>
      <p className={styles["hint"]}>タスクを実施したことがわかる写真を1〜3枚選択してください。</p>
      <div className={styles["photoGrid"]}>
        {files.map((file, index) => (
          <div className={styles["photoSlot"]} key={index}>
            {file && urls[index] ? (
              <>
                <img src={urls[index]} alt={`証拠写真${String(index + 1)}`} className={styles["photoImage"]} />
                <button type="button" className={styles["remove"]} disabled={disabled}
                  aria-label={`写真${String(index + 1)}を削除`}
                  onClick={() => {
                    const remaining = files.filter(
                      (item, i) => i !== index && item !== null,
                    );
                    onChange([
                      ...remaining,
                      ...Array<File | null>(files.length - remaining.length).fill(null),
                    ]);
                  }}>×</button>
              </>
            ) : (
              <label className={styles["photoLabel"]}>
                <span className={styles["camera"]} aria-hidden="true">▣</span>
                <span>写真を選択</span>
                <small>{index + 1} / 3</small>
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;
                    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
                      window.alert("JPG・PNG・WebP形式の写真を選択してください");
                      event.target.value = "";
                      return;
                    }
                    onChange(files.map((item, i) => i === index ? selected : item));
                    event.target.value = "";
                  }} />
              </label>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
