import type { ObjectionReasonType } from "../components/layout/ObjectionReasonSelector";

export interface ObjectionDraft {
  reasonType: ObjectionReasonType;
  reasonDetail: string;
}

export function readObjectionDraft(key: string): ObjectionDraft | null {
  const stored = sessionStorage.getItem(key);
  if (stored === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "reasonType" in value &&
    (value.reasonType === "insufficient_evidence" ||
      value.reasonType === "conditions_not_met" ||
      value.reasonType === "other") &&
    "reasonDetail" in value &&
    typeof value.reasonDetail === "string" &&
    value.reasonDetail.trim().length > 0 &&
    value.reasonDetail.length <= 200
  ) {
    return {
      reasonType: value.reasonType,
      reasonDetail: value.reasonDetail,
    };
  }

  sessionStorage.removeItem(key);
  return null;
}
