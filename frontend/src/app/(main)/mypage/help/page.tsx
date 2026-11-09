import { ProfilePageLayout } from "../../../../components/layout/ProfilePageLayout";
import { HelpContent } from "../../../../components/help/HelpContent";

export default function HelpPage() {
  return <ProfilePageLayout title="ヘルプ・お問い合わせ" backHref="/mypage"><HelpContent /></ProfilePageLayout>;
}
