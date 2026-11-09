import { ProfilePageLayout } from "../../../../components/layout/ProfilePageLayout";
import { PaymentHistory } from "../../../../components/payments/PaymentHistory";
import { paymentReader } from "../../../../lib/paymentApi";

export default async function PaymentsPage() {
  return <ProfilePageLayout title="決済履歴" backHref="/mypage"><PaymentHistory result={await paymentReader.list()} /></ProfilePageLayout>;
}
