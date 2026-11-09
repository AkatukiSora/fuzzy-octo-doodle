import { notFound } from "next/navigation";
import { ProfilePageLayout } from "../../../../../../components/layout/ProfilePageLayout";
import { PaymentInquiryStatus } from "../../../../../../components/payments/PaymentInquiryStatus";
import { paymentReader } from "../../../../../../lib/paymentApi";

export default async function InquiryStatusPage({ params }: { params: Promise<{ inquiryId: string }> }) {
  const { inquiryId } = await params;
  const result = await paymentReader.inquiry(inquiryId);
  if (result.kind === "not-found") notFound();
  return <ProfilePageLayout title="問い合わせ状況" backHref="/mypage/payments"><PaymentInquiryStatus result={result} /></ProfilePageLayout>;
}
