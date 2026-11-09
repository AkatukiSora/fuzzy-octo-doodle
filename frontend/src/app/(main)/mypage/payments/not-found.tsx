import { ProfilePageLayout } from "../../../../components/layout/ProfilePageLayout";
import { PaymentDataMessage } from "../../../../components/payments/PaymentParts";

export default function PaymentNotFound() {
  return <ProfilePageLayout title="情報が見つかりません" backHref="/mypage/payments"><PaymentDataMessage kind="not-found" subject="指定された決済・問い合わせ" /></ProfilePageLayout>;
}
