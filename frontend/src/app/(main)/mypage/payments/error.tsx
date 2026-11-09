"use client";
import { ProfilePageLayout } from "../../../../components/layout/ProfilePageLayout";
import { PaymentDataMessage } from "../../../../components/payments/PaymentParts";
import { Button } from "../../../../components/ui/Button";

export default function PaymentError({ reset }: { reset: () => void }) {
  return <ProfilePageLayout title="決済情報" backHref="/mypage"><PaymentDataMessage kind="error" subject="決済・問い合わせ情報" /><Button onClick={reset}>もう一度読み込む</Button></ProfilePageLayout>;
}
