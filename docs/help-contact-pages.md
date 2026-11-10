# ヘルプ・お問い合わせ画面

## 提供する画面

- `/mypage/help`：6カテゴリ・12件のFAQ。カテゴリへのアンカー、キーボード操作可能なネイティブのdetails/summary、関連画面へのリンク、お問い合わせ導線を用意。
- `/mypage/help/contact`：カテゴリ・件名・内容・画像を入力し、同じ画面内で内容確認と修正ができる。修正時にも内容・画像を保持する。送信は無効。
- `/mypage/help/contact/complete`：送信API接続後の受付結果を表示するための画面。現時点では「送信は準備中」「送信されていません」を表示し、ヘルプへ戻れる。

ProfilePageLayout / Card / Button / Input / Select / Textarea を再利用。既存レイアウトの横幅いっぱいのヘッダーとフッター用下余白を継承し、紫色・白いカード・角丸を既存設定画面に合わせた。決済問い合わせからローカル画像選択・プレビュー・削除を `InquiryImagePicker` に抽出し、両フォームから利用する。

## FAQの根拠

FAQデータは `frontend/src/lib/helpContent.ts` にまとめている。外部の一般的なサービス仕様から案内を作らず、次の実装を確認した。

| カテゴリ | 確認した仕様 | 主な確認先 |
| --- | --- | --- |
| タスク作成 | 期限10分〜72時間、ペナルティ100〜10,000円、初回未提出タスクは同時3件まで | `backend/src/domain/task/task-policy.ts`、`frontend/src/lib/taskDraft.ts` |
| 証拠提出 | JPEG/PNG/WebP、1〜3枚、期限までに開始、開始済みでも期限+5分までに完了 | `frontend/src/components/evidence/EvidenceInitial.tsx`、`backend/src/domain/evidence/upload-session.ts`、`backend/src/domain/task/task.ts` |
| 異議申し立て | フレンドの審査中タスク、期限内、本人のタスクは不可、初回は追加証拠待ちへ | `backend/src/application/usecases/objections/create-objection.usecase.ts`、`backend/src/domain/task/task.ts` |
| フレンド | 招待リンク→申請→承認、ブロックで関係解除、解除で自動復元しない | `frontend/src/lib/friendInviteApi.ts`、`frontend/src/lib/friendsApi.ts`、`frontend/src/components/friends/FriendDetailContent.tsx` |
| 決済 | 取得・変更・再試行・問い合わせ送信は準備中、決済/タスク/問い合わせ状態は独立 | `frontend/src/lib/paymentApi.ts`、`frontend/src/lib/payments.ts`、`docs/payment-pages.md` |
| アカウント設定 | プロフィール編集導線、メール・パスワード・再設定・通知変更は準備中 | `frontend/src/app/(main)/mypage/profile/edit/page.tsx`、`frontend/src/app/(main)/mypage/account/page.tsx`、`frontend/src/app/(main)/mypage/notifications/page.tsx` |

## 入力・未実装機能

- カテゴリは用意した7択から必須選択。件名・内容は空白のみを不可とし、内容は1〜1000文字（既存Textareaと同じJavaScriptの文字列長で計数）。1001文字以上はエラーとし、確認画面へ進めない。
- JPEG/PNG/WebPを最大3枚。超過・非対応形式は選択を拒否し、選択済みファイルは保持する。プレビューのObject URLは変更・アンマウント時に解放する。
- 「入力内容を確認する」は画面内の確認だけ。確認後も送信ボタンはdisabledで、API呼び出し・画像アップロード・保存・受付番号発行・完了URLへの遷移は行わない。
- 入力内容はReactの状態だけに保持し、画面離脱で破棄する。完了URLのクエリやブラウザ保存値から成功を推測しない。
- `frontend/src/lib/contactApi.ts` に送信と信頼できる受付結果取得の接続境界を用意。現段階では両方ともunavailableを返す。完了メッセージは将来のAPIが返した受付情報がある場合だけ描画できる型・コンポーネント構成にしている。
- API接続時には、認証付き送信・画像アップロード・受付情報の取得・失敗時の処理を追加する必要がある。今回はバックエンド・API・DBを変更していない。

## 検証

- フロントエンド63テスト。必須項目・1000/1001文字・共有画像検証・API未実装時の非成功を含む。
- Edge/Playwrightで3画面×320/375/390/430/768/1440pxの18ケースを確認。FAQを全件開いた場合にも横はみ出しなし。
- マイページからの遷移、FAQのEnterによる開閉、ページ末尾のボタンとフッターの位置、必須/空白/文字数エラー、3画像・4枚目・非画像・削除、確認/修正時の保持、直接完了URLにアクセスしたときの非成功表示を確認。
- 共通化した決済問い合わせの画像追加・削除と送信無効化も回帰確認。問い合わせに関するAPI書き込み・ブラウザ例外なし。
