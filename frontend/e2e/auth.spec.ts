import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// Run against an isolated local DB/API (see docs/better-auth.md).
// Forward real requests to the API; no auth response or session is mocked.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:55438${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});

for (const width of [1280, 375]) {
  test(`signup, login, persistence and logout (${String(width)}px)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    const email = `${randomUUID()}@example.test`;
    const password = randomBytes(18).toString("hex");
    await page.goto("/signup");
    const signup = page.getByRole("button", { name: "新規登録", exact: true });
    const consent = page.getByRole("checkbox", { name: "利用規約とプライバシーポリシーに同意する" });
    await expect(consent).not.toBeChecked();
    await expect(signup).toBeDisabled();
    await expect(page.getByRole("link", { name: "利用規約", exact: true })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "プライバシーポリシー", exact: true })).toHaveAttribute("href", "/privacy");
    await page.getByLabel("ユーザー名", { exact: true }).fill("ブラウザ確認");
    await page.getByLabel("メールアドレス", { exact: true }).fill(email);
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByLabel("パスワード（確認用）", { exact: true }).fill(password);
    await consent.check();
    await expect(signup).toBeEnabled();
    await consent.uncheck();
    await expect(signup).toBeDisabled();
    await consent.check();
    await signup.click();
    await expect(page).toHaveURL(/\/login\?registered=1$/);
    await expect(page.getByRole("status")).toHaveText("新規登録が完了しました。ログインしてください。");
    expect((await context.cookies()).some((cookie) => cookie.name.includes("session_token"))).toBe(false);
    await page.getByPlaceholder("メールアドレス", { exact: true }).fill(email);
    await page.getByPlaceholder("パスワード", { exact: true }).fill(password);
    await page.getByRole("checkbox", { name: "ログインしたままにする" }).check();
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page).toHaveURL(/\/mypage$/);
    await expect(page.getByText("ブラウザ確認", { exact: true })).toBeVisible();
    const cookies = await context.cookies("http://localhost:3000/api/me");
    const sessionCookie = cookies.find((cookie) => cookie.name.includes("session_token"));
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    await page.reload();
    await expect(page.getByText("ブラウザ確認", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "ログアウトしますか？" });
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await modal.getByRole("button", { name: "キャンセル" }).click();
    await expect(modal).not.toBeVisible();
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await modal.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).some((cookie) => cookie.name.includes("session_token") && cookie.value)).toBe(false);
    expect(await page.evaluate(async () => (await fetch("/api/me")).status)).toBe(401);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
