import * as UI from "../../../components/ui";
import Link from "next/link";
export default function SignupPage() {
  return (



    <main>
      <UI.FormField 
      label = "メールアドレス"
      htmlFor = "email"
      > </UI.FormField>
      <UI.Input id = "email"/>
       <UI.FormField 
      label = "パスワード"
      htmlFor = "パスワード"
      > </UI.FormField>
      <UI.Input id = "email"/>

        <label>
  <input type="checkbox" />
  ログイン状態を維持する
</label>
      <UI.Button fullWidth>ログイン</UI.Button>
     <div>
  <hr />
  または
  <hr />
  <Link href="/signup">新規登録はこちら</Link>
</div>


    </main>
  );
}