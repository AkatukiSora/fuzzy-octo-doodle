import { ProfilePageLayout } from "../../../../../components/layout/ProfilePageLayout";
import { ContactForm } from "../../../../../components/help/ContactForm";

export default function ContactPage() {
  return <ProfilePageLayout title="お問い合わせ" backHref="/mypage/help"><ContactForm /></ProfilePageLayout>;
}
