"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import * as UI from "../../../components/ui";
import "./signup.css";

export default function SignupPage() {
  const [hasAgreed, setHasAgreed] = useState(false);

  return (
    <main className="signup-page">
      <section className="signup-container" aria-labelledby="signup-title">
        <h1 className="signup-visually-hidden" id="signup-title">新規登録</h1>

        <header className="signup-brand">
          <Image
            src="/images/donee-login-brand.png"
            alt="Donee"
            width={768}
            height={768}
            priority
          />
        </header>

        <form className="signup-form" onReset={() => { setHasAgreed(false); }}>
          <div className="signup-field">
            <label className="signup-visually-hidden" htmlFor="username">ユーザー名</label>
            <UI.Input
              className="signup-input"
              id="username"
              name="username"
              type="text"
              placeholder="ユーザー名"
              autoComplete="nickname"
              required
              fullWidth
            />
            <p className="signup-hint">アプリ内で表示される名前です</p>
          </div>

          <div className="signup-field">
            <label className="signup-visually-hidden" htmlFor="email">メールアドレス</label>
            <UI.Input
              className="signup-input"
              id="email"
              name="email"
              type="email"
              placeholder="メールアドレス"
              autoComplete="email"
              required
              fullWidth
            />
          </div>

          <div className="signup-field">
            <label className="signup-visually-hidden" htmlFor="password">パスワード</label>
            <UI.Input
              className="signup-input"
              id="password"
              name="password"
              type="password"
              placeholder="パスワード"
              autoComplete="new-password"
              required
              fullWidth
            />
            <p className="signup-hint">半角英数字8文字以上で入力してください</p>
          </div>

          <div className="signup-field">
            <label className="signup-visually-hidden" htmlFor="password-confirm">パスワード（確認用）</label>
            <UI.Input
              className="signup-input"
              id="password-confirm"
              name="passwordConfirm"
              type="password"
              placeholder="パスワード（確認用）"
              autoComplete="new-password"
              required
              fullWidth
            />
          </div>

          <div className="signup-consent">
            <input
              id="signup-consent"
              name="termsAccepted"
              type="checkbox"
              value="true"
              checked={hasAgreed}
              onChange={(event) => { setHasAgreed(event.target.checked); }}
              required
            />
            <label htmlFor="signup-consent">
              <Link href="/terms" target="_blank" rel="noopener noreferrer">利用規約</Link>
              と
              <Link href="/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</Link>
              に同意する
            </label>
          </div>

          <UI.Button fullWidth size="lg" type="submit" className="signup-submit" disabled={!hasAgreed}>
            <span>新規登録</span>
            <span className="signup-arrow" aria-hidden="true">→</span>
          </UI.Button>
        </form>

        <p className="signup-login">
          <span>すでにアカウントをお持ちの方は</span>
          <Link href="/login">ログインはこちら <span aria-hidden="true">›</span></Link>
        </p>
      </section>
    </main>
  );
}
