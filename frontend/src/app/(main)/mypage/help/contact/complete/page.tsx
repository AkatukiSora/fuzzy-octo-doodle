import { ProfilePageLayout } from "../../../../../../components/layout/ProfilePageLayout";
import { ContactCompletion } from "../../../../../../components/help/ContactCompletion";
import { contactApi } from "../../../../../../lib/contactApi";

export default async function ContactCompletePage() {
  return <ProfilePageLayout title="お問い合わせ" backHref="/mypage/help"><ContactCompletion result={await contactApi.completion()} /></ProfilePageLayout>;
}
