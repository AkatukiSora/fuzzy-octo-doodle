import * as UI from "../../../components/ui";
import Link from "next/link";
import Image from "next/image";
import "./login.css";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-container" aria-labelledby="login-title">
        <header className="login-brand">
          <Image
            src="/images/donee-login-brand.png"
            alt="Donee"
            width={768}
            height={768}
            priority
          />
        </header>

        <div className="login-form">
          <div className="login-field">
            <UI.Input
              className="login-input"
              id="email"
              name="email"
              type="email"
              placeholder="メールアドレス"
              autoComplete="email"
              required
            />
          </div>

          <div className="login-field">
            <UI.Input
              className="login-input"
              id="password"
              name="password"
              type="password"
              placeholder="パスワード"
              autoComplete="current-password"
              required
            />
          </div>

          <label className="login-remember">
            <input type="checkbox" name="remember" />
            <span>ログインしたままにする</span>
          </label>

          <UI.Button fullWidth size="lg" className="login-submit">
            <span>ログイン</span>
            <span className="login-arrow" aria-hidden="true">→</span>
          </UI.Button>
        </div>

        <div className="login-divider" aria-label="または">
          <span />
          <span className="login-divider-text">または</span>
          <span />
        </div>

        <p className="login-signup">
          <span>アカウントをお持ちでない方は</span>
          <Link href="/signup">新規登録はこちら <span aria-hidden="true">›</span></Link>
        </p>
      </section>
    </main>
  );
}
