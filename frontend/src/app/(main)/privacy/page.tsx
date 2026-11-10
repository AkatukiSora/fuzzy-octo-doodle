import { ProfilePageLayout } from "../../../components/layout/ProfilePageLayout";
import { LegalDocument, LegalSection } from "../../../components/legal/LegalDocument";

export default function PrivacyPage() {
  return <ProfilePageLayout title="プライバシーポリシー" backHref="/mypage">
    <LegalDocument updatedAt="2026年11月10日">
      <LegalSection title="1. 基本方針"><p>Donee（以下「本サービス」）は、利用者のプライバシーを尊重し、個人情報保護法その他の適用法令に従って、取得した情報を適切に取り扱います。本書は公開前の草案であり、正式な運営主体の情報は公開前に確定します。</p></LegalSection>
      <LegalSection title="2. 取得する情報"><ul><li>アカウント情報（メールアドレス、表示名、プロフィール情報等）</li><li>タスクの内容、期限、進行状況、証拠写真、コメント、承認・異議申立ての履歴</li><li>友人関係、招待・ブロック等の利用情報</li><li>お問い合わせ内容と対応履歴</li><li>アクセス日時、端末・ブラウザ情報、IPアドレス、操作ログ等の技術情報（取得する場合）</li><li>決済機能の提供時に必要となる取引情報（提供開始時に詳細を案内）</li></ul></LegalSection>
      <LegalSection title="3. 利用目的"><ul><li>アカウント認証および本サービスの提供・維持</li><li>タスク、証拠提出、友人による確認、異議申立ての処理</li><li>通知、お問い合わせへの対応および重要なお知らせ</li><li>不正利用の防止、セキュリティ確保、障害対応</li><li>サービス改善のための利用状況の分析（実施する場合）</li><li>法令への対応および権利保護</li></ul></LegalSection>
      <LegalSection title="4. 情報の共有・公開範囲"><p>タスクや証拠写真、承認状況などは、機能上必要な範囲で、当該タスクに関係する友人などに表示されることがあります。一般公開される範囲は、実際の画面仕様に従います。第三者の個人情報が含まれる写真の提出には十分注意してください。</p></LegalSection>
      <LegalSection title="5. 第三者提供・外部委託"><p>法令に基づく場合や本人の同意がある場合などを除き、個人データを第三者に提供しません。サーバー運用、ストレージ、通知、決済などを外部事業者に委託する場合は、委託先を適切に監督します。利用する事業者、国外での取扱いの有無については正式公開前に確認・明示します。</p></LegalSection>
      <LegalSection title="6. 保存期間・削除"><p>取得した情報は利用目的に必要な期間、または法令上必要な期間保存します。タスクや証拠など、機能上削除できない情報がある場合は、その理由と保存方針を明確にします。アカウント削除・利用停止時の取扱いについても正式公開前に定めます。</p></LegalSection>
      <LegalSection title="7. 安全管理措置"><p>アクセス権限の管理、通信の保護、ログの監視など、取り扱う情報の性質に応じて合理的な安全管理措置を講じます。ただし、インターネット上での情報の安全性を完全に保証するものではありません。</p></LegalSection>
      <LegalSection title="8. Cookie等"><p>認証状態の維持や利便性向上のため、Cookie等を利用する場合があります。アクセス解析ツールなどを導入する場合は、その目的、提供先、停止方法を別途案内します。</p></LegalSection>
      <LegalSection title="9. 開示・訂正・利用停止等"><p>本人からの保有個人データの開示、訂正、利用停止、削除等の請求には、法令に従って対応します。本人確認をお願いする場合があります。お問い合わせ方法は正式公開前に確定します。</p></LegalSection>
      <LegalSection title="10. 未成年者の利用"><p>未成年者が利用する場合、必要に応じて親権者等の同意を得てください。金銭的なペナルティを伴う機能の利用条件は、正式提供前に別途明確にします。</p></LegalSection>
      <LegalSection title="11. 改定・お問い合わせ"><p>本ポリシーを改定する場合、重要な変更は本サービス上で案内します。個人情報取扱事業者の名称・住所・代表者名（該当する場合）および問い合わせ窓口は、正式公開前に確定・掲載します。</p></LegalSection>
    </LegalDocument>
  </ProfilePageLayout>;
}
