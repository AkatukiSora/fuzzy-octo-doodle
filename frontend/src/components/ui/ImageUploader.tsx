
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import styles from "./ImageUploader.module.css";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ImageUploaderProps {
  images: File[];
  onChange: (images: File[]) => void;
  maxImages?: number;
  required?: boolean;
  label?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
}

export function ImageUploader({
  images,
  onChange,
  maxImages = 3,
  required = false,
  label = "証拠写真",
  description,
  error,
  disabled = false,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<string[]>([]);
  const [internalError, setInternalError] = useState("");

  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setPreviews(urls);

    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [images]);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) return;

    const validFiles = files.filter((file) =>
      supportedImageTypes.has(file.type)
    );

    if (validFiles.length !== files.length) {
      setInternalError("JPEG・PNG・WebP形式の画像を選択してください。");
      event.target.value = "";
      return;
    }

    if (images.length + validFiles.length > maxImages) {
      setInternalError(
        `写真は最大${String(maxImages)}枚まで選択できます。`
      );
      event.target.value = "";
      return;
    }

    setInternalError("");
    onChange([...images, ...validFiles]);

    event.target.value = "";
  };

  const handleRemove = (index: number) => {
    if (disabled) return;

    onChange(images.filter((_, i) => i !== index));
    setInternalError("");
  };

  const openFilePicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const displayedError = error ?? internalError;

  return (
    <div className={styles["container"]}>
      <div className={styles["labelRow"]}>
        <label className={styles["label"]}>
          {label}
        </label>

        {required && (
          <span className={styles["required"]}>
            必須
          </span>
        )}
      </div>

      {description && (
        <p className={styles["description"]}>
          {description}
        </p>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={maxImages > 1}
        onChange={handleSelect}
        disabled={disabled}
        className={styles["hiddenInput"]}
        aria-label={label}
      />

      <div className={styles["grid"]}>
        {Array.from({ length: maxImages }, (_, index) => {
          const image = images[index];
          const preview = previews[index];

          return (
            <div
              key={index}
              className={`${styles["slot"] ?? ""} ${
                image ? (styles["filled"] ?? "") : ""
              }`}
            >
              {image && preview ? (
                <>
                  <img
                    src={preview}
                    alt={`選択した写真 ${String(index + 1)}`}
                    className={styles["preview"]}
                  />

                  <button
                    type="button"
                    className={styles["removeButton"]}
                    onClick={() => {
                      handleRemove(index);
                    }}
                    disabled={disabled}
                    aria-label={`写真${String(index + 1)}を削除`}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles["selectButton"]}
                  onClick={openFilePicker}
                  disabled={disabled}
                >
                  <svg
                    width="34"
                    height="34"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                    <circle cx="12" cy="14" r="4" />
                  </svg>

                  <span>写真を選択</span>

                  <span className={styles["number"]}>
                    {index + 1}/{maxImages}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {displayedError && (
        <p className={styles["error"]} role="alert">
          {displayedError}
        </p>
      )}
    </div>
  );
}
