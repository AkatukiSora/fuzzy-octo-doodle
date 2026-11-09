import type { TaskStatus } from "../types/task.ts";

// Payment and inquiry states are independent; cancellation is never a paid state.
export type PaymentStatus = "unpaid" | "processing" | "paid" | "failed" | "cancelled";
export type InquiryStatus = "received" | "investigating" | "answered" | "closed";
export type PaymentFilter = "all" | "completed" | "incomplete";
export const inquiryReasons = {
  evidence: "証拠を提出したはず",
  amount: "請求金額が違う",
  duplicate: "二重に請求された",
  other: "その他",
} as const;
export type InquiryReason = keyof typeof inquiryReasons;
export interface PaymentMethod {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}
export interface Payment {
  id: string;
  task: { id: string; title: string; status: TaskStatus; deadlineAt: string };
  amount: number;
  status: PaymentStatus;
  chargedAt: string;
  reason: string;
  method: PaymentMethod | null;
  inquiry: { id: string; status: InquiryStatus } | null;
}
export interface PaymentInquiry {
  id: string;
  paymentId: string;
  taskTitle: string;
  reason: InquiryReason;
  submittedAt: string;
  attachmentCount: number;
  status: InquiryStatus;
  // Only recorded events are rendered, never inferred progress or timestamps.
  events: { id: string; status: InquiryStatus; occurredAt: string; message: string | null }[];
}
export type PaymentData<T> =
  | { kind: "ready"; data: T }
  | { kind: "unavailable" }
  | { kind: "not-found" }
  | { kind: "error" };

export function filterPayments(payments: Payment[], filter: PaymentFilter): Payment[] {
  if (filter === "completed") return payments.filter(payment => payment.status === "paid");
  if (filter === "incomplete") return payments.filter(payment => ["unpaid", "processing", "failed"].includes(payment.status));
  return payments;
}
export function validateInquiry(reason: string, detail: string, files: { type: string }[]): string[] {
  const errors: string[] = [];
  if (!Object.hasOwn(inquiryReasons, reason)) errors.push("問い合わせ理由を選択してください。");
  if (detail.trim().length === 0 || Array.from(detail).length > 1000) errors.push("詳細説明を1〜1000文字で入力してください。");
  if (files.length > 3) errors.push("添付画像は最大3枚です。");
  if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) errors.push("JPEG・PNG・WebPの画像を選択してください。");
  return errors;
}
export function formatPaymentDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
export function formatPaymentAmount(amount: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
}
