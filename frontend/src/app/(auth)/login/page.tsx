"use client";

import { useEffect, useRef, useState } from "react";
import { authClient, clearProfileCache, readFormText } from "../../../lib/authClient";
import * as UI from "../../../components/ui";
import Link from "next/link";
import Image from "next/image";
import "./login.css";

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    setRegistered(new URLSearchParams(window.location.search).get("registered") === "1");
  }, []);

  async function submit(form: HTMLFormElement) {
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setError(null);
    const data = new FormData(form);
    try {
      const result = await authClient.signIn.email({
        email: readFormText(data, "email"),
        password: readFormText(data, "password"),
        rememberMe: data.get("remember") === "on",
      });
      if (result.error) {
        setError("ログインできませんでした。メールアドレスとパスワードを確認してください。");
        return;
      }
      clearProfileCache();
      window.location.assign("/mypage");
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }
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

        {registered && <p className="login-notice" role="status">新規登録が完了しました。ログインしてください。</p>}
        <form className="login-form" onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}>
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

          {error && <p className="login-error" role="alert">{error}</p>}
          <UI.Button fullWidth size="lg" type="submit" className="login-submit" disabled={isSubmitting}>
            <span>{isSubmitting ? "ログイン中..." : "ログイン"}</span>
            <span className="login-arrow" aria-hidden="true">→</span>
          </UI.Button>
        </form>

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
