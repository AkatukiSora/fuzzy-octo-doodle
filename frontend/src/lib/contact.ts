import { contactCategories } from "./helpContent.ts";
import { inquiryImageError } from "./inquiryImages.ts";

export interface ContactDraft {
  category: string;
  subject: string;
  detail: string;
  images: File[];
}
export interface ContactErrors { category?: string; subject?: string; detail?: string; images?: string }
export function validateContact(draft: ContactDraft): ContactErrors {
  const errors: ContactErrors = {};
  if (!contactCategories.some(category => category.value === draft.category)) errors.category = "お問い合わせカテゴリを選択してください。";
  if (!draft.subject.trim()) errors.subject = "件名を入力してください。";
  if (!draft.detail.trim() || draft.detail.length > 1000) errors.detail = "お問い合わせ内容を1〜1000文字で入力してください。";
  const imageError = inquiryImageError(draft.images);
  if (imageError) errors.images = imageError;
  return errors;
}

export interface ContactReceipt { id: string; submittedAt: string }
export type ContactSubmission = { kind: "unavailable" } | { kind: "sent"; receipt: ContactReceipt };
