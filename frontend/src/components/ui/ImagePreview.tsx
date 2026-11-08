
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ImagePreview.module.css";

export function EvidencePhoto({ src, alt, className }: {
  src: string;
  alt: string;
  className?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span role="alert" className={styles["imageError"]}>証拠写真を読み込めませんでした。画面を再読み込みしてください。</span>;
  }
  return <img src={src} alt={alt} className={className} onError={() => { setFailed(true); }} />;
}

export interface PreviewImage {
  src: string;
  alt?: string;
}

interface ImagePreviewProps {
  images: PreviewImage[];
  title?: string;
}

export function ImagePreview({
  images,
  title = "提出された証拠写真",
}: ImagePreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isOpen =
    selectedIndex !== null &&
    selectedIndex >= 0 &&
    selectedIndex < images.length;

  const openPreview = (index: number) => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setSelectedIndex(index);
  };

  const closePreview = () => {
    setSelectedIndex(null);
  };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }

      if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();

        setSelectedIndex((index) =>
          index === null ? null : (index + 1) % images.length
        );
        return;
      }

      if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();

        setSelectedIndex((index) =>
          index === null
            ? null
            : (index - 1 + images.length) % images.length
        );
        return;
      }

      if (event.key === "Tab") {
        const focusableElements =
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );

        if (!focusableElements?.length) {
          event.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (!first || !last) return;

        const active = document.activeElement;

        if (event.shiftKey) {
          if (
            active === first ||
            !dialogRef.current?.contains(active)
          ) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (
            active === last ||
            !dialogRef.current?.contains(active)
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, images.length]);

  if (images.length === 0) {
    return null;
  }

  const selectedImage = isOpen
    ? images[selectedIndex]
    : undefined;

  const goPrevious = () => {
    setSelectedIndex((index) =>
      index === null
        ? null
        : (index - 1 + images.length) % images.length
    );
  };

  const goNext = () => {
    setSelectedIndex((index) =>
      index === null ? null : (index + 1) % images.length
    );
  };

  return (
    <section className={styles["container"]}>
      <h3 className={styles["title"]}>{title}</h3>

      <div className={styles["grid"]}>
        {images.map((image, index) => (
          <button
            key={`${image.src}-${String(index)}`}
            type="button"
            className={styles["thumbnailButton"]}
            onClick={() => {
              openPreview(index);
            }}
            aria-label={`写真${String(index + 1)}を拡大`}
          >
            <EvidencePhoto
              key={image.src}
              src={image.src}
              alt={image.alt ?? `証拠写真${String(index + 1)}`}
              className={styles["thumbnail"]}
            />
          </button>
        ))}
      </div>

      {selectedImage &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles["overlay"]}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closePreview();
              }
            }}
          >
            <div
              ref={dialogRef}
              className={styles["viewer"]}
              role="dialog"
              aria-modal="true"
              aria-label="証拠写真の拡大表示"
            >
              <button
                ref={closeButtonRef}
                type="button"
                className={styles["closeButton"]}
                onClick={closePreview}
                aria-label="閉じる"
              >
                ×
              </button>

              <EvidencePhoto
                key={selectedImage.src}
                src={selectedImage.src}
                alt={selectedImage.alt ?? "拡大した証拠写真"}
                className={styles["largeImage"]}
              />

              {images.length > 1 && (
                <div className={styles["controls"]}>
                  <button
                    type="button"
                    onClick={goPrevious}
                  >
                    ← 前へ
                  </button>

                  <span aria-live="polite">
                    {selectedIndex === null
                      ? 0
                      : selectedIndex + 1}{" "}
                    / {images.length}
                  </span>

                  <button
                    type="button"
                    onClick={goNext}
                  >
                    次へ →
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
