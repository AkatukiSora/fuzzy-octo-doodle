import { notFound } from "next/navigation";
import { ProfilePageLayout } from "../../../../../components/layout/ProfilePageLayout";
import { PaymentDetail } from "../../../../../components/payments/PaymentDetail";
import { paymentReader } from "../../../../../lib/paymentApi";

export default async function PaymentDetailPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const result = await paymentReader.payment(paymentId);
  if (result.kind === "not-found") notFound();
  return <ProfilePageLayout title="決済詳細" backHref="/mypage/payments"><PaymentDetail result={result} /></ProfilePageLayout>;
}
