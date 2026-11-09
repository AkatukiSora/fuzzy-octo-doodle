import { notFound } from "next/navigation";
import { ProfilePageLayout } from "../../../../../../components/layout/ProfilePageLayout";
import { PaymentInquiryForm } from "../../../../../../components/payments/PaymentInquiryForm";
import { paymentReader } from "../../../../../../lib/paymentApi";

export default async function PaymentInquiryPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const result = await paymentReader.payment(paymentId);
  if (result.kind === "not-found") notFound();
  return <ProfilePageLayout title="請求問い合わせ" backHref={`/mypage/payments/${encodeURIComponent(paymentId)}`}><PaymentInquiryForm result={result} /></ProfilePageLayout>;
}
