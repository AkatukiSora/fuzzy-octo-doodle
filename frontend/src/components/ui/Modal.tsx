
"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm?: () => void;
  showCloseButton?: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

export function Modal({
  isOpen,
  title,
  children,
  confirmText = "確認する",
  cancelText = "キャンセル",
  confirmVariant = "primary",
  onConfirm,
  showCloseButton = false,
  onClose,
  isLoading = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className={styles["modal"]}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();

        if (!isLoading) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          !isLoading
        ) {
          onClose();
        }
      }}
      onClose={onClose}
    >
      <div className={styles["content"]}>
        <h2 id={titleId} className={styles["title"]}>
          {title}
        </h2>

        {showCloseButton && (
          <button type="button" className={styles["closeButton"]} onClick={onClose} aria-label="閉じる">
            ×
          </button>
        )}
        <div className={styles["body"]}>{children}</div>

        {onConfirm && <div className={styles["actions"]}>
          <button
            type="button"
            className={styles["cancelButton"]}
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={`${styles["confirmButton"] ?? ""} ${
              styles[confirmVariant] ?? ""
            }`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "処理中..." : confirmText}
          </button>
        </div>}
      </div>
    </dialog>
  );
}
