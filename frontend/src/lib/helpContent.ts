// Keep answers aligned with these implementations; sources are documented in docs/help-contact-pages.md.
export const helpCategories = [
  { id: "tasks", label: "タスク作成", items: [
    { question: "タスクの期限とペナルティ金額はどう設定しますか？", answer: "タスクの期限は作成時点から10分〜72時間、ペナルティ金額は100〜10,000円の整数で設定できます。タイトル、達成条件などを入力し、内容を確認してから作成してください。", href: "/tasks/create", linkLabel: "タスクを作成する" },
    { question: "タスクはいくつまで同時に作れますか？", answer: "初回の証拠が未提出のタスクは、同時に3件までです。上限に達している場合は、現在のタスクを確認してください。", href: "/tasks", linkLabel: "タスクを確認する" },
  ] },
  { id: "evidence", label: "証拠提出", items: [
    { question: "証拠として何を提出できますか？", answer: "タスクの詳細から、実施したことがわかる写真を1〜3枚提出できます。JPEG・PNG・WebP形式に対応しています。内容を確認し、提出操作が完了したことを画面で確認してください。" },
    { question: "証拠はいつまでに提出すればよいですか？", answer: "初回証拠のアップロードはタスクの期限までに開始してください。開始済みのアップロードも期限の5分後までに完了する必要があります。追加証拠が必要な場合は、画面に表示された追加証拠の期限を確認してください。" },
  ] },
  { id: "objections", label: "異議申し立て", items: [
    { question: "異議申し立ては誰が行えますか？", answer: "フレンドの審査中のタスクについて、審査期限内に理由を添えて申し立てられます。自分のタスクには申し立てできません。対象タスクの状態や権限によって、操作できない場合があります。" },
    { question: "異議申し立てと請求への問い合わせは同じですか？", answer: "別の手続きです。タスク審査への異議が受理されると、初回は追加証拠待ちになります。決済への問い合わせは請求についての確認です。現在、請求問い合わせの送信機能は準備中です。", href: "/mypage/payments", linkLabel: "決済履歴を確認する" },
  ] },
  { id: "friends", label: "フレンド", items: [
    { question: "フレンドを追加するにはどうすればよいですか？", answer: "フレンド画面から招待リンクを作成・共有できます。リンクを受け取った相手が申請し、招待した側が承認するとフレンドになります。", href: "/friends", linkLabel: "フレンド画面を開く" },
    { question: "ブロックを解除するとフレンドに戻りますか？", answer: "自動では戻りません。ブロックするとフレンド関係が解除され、お互いのタスクを閲覧できなくなります。ブロック解除後も、再びフレンドになるには申請と承認が必要です。" },
  ] },
  { id: "payments", label: "決済", items: [
    { question: "決済履歴や支払い方法を確認・変更できますか？", answer: "決済関連の画面はありますが、現在は履歴と支払い方法の取得、支払い方法の変更、支払いの再試行は準備中です。画面に実際の履歴や登録状況は表示されず、この画面から決済は実行されません。", href: "/mypage/payments", linkLabel: "決済履歴を開く" },
    { question: "「調査中」は支払いが完了したという意味ですか？", answer: "いいえ。「調査中」は問い合わせの対応状態です。支払い完了や請求取消とは別に扱います。支払いが完了しても、対象タスクの達成状態は変わりません。現在、請求問い合わせの送信と状況の取得は準備中です。" },
  ] },
  { id: "account", label: "アカウント設定", items: [
    { question: "プロフィールはどこで変更できますか？", answer: "マイページの「プロフィールを編集」から編集画面を開けます。画面に表示された項目を変更し、保存してください。", href: "/mypage/profile/edit", linkLabel: "プロフィールを編集する" },
    { question: "メールアドレス・パスワードや通知設定を変更できますか？", answer: "現在、メールアドレス変更・パスワード変更・再設定メールの送信、通知設定の変更は準備中です。通知設定画面から通知は送信されません。", href: "/mypage/account", linkLabel: "アカウント設定を開く" },
  ] },
] as const;

export const contactCategories = [
  { value: "tasks", label: "タスク作成" }, { value: "evidence", label: "証拠提出" },
  { value: "objections", label: "異議申し立て" }, { value: "friends", label: "フレンド" },
  { value: "payments", label: "決済" }, { value: "account", label: "アカウント設定" },
  { value: "other", label: "その他" },
];
