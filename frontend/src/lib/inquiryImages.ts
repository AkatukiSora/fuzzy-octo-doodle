export const inquiryImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export function inquiryImageError(files: { type: string }[]): string | null {
  if (files.length > 3) return "添付画像は最大3枚です。";
  if (files.some(file => !inquiryImageTypes.some(type => type === file.type))) return "JPEG・PNG・WebPの画像を選択してください。";
  return null;
}
