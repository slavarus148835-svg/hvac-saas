import { test, expect } from "@playwright/test";

/**
 * Проверки против запущенного приложения (локально: npm run build && npx playwright test).
 * Против production: PLAYWRIGHT_BASE_URL=https://your-domain npx playwright test
 * (без webServer: PLAYWRIGHT_NO_SERVER=1)
 */

test.describe("Email verification: code flow only", () => {
  test("GET /verify-email redirects to /verify-email-code", async ({ request }) => {
    const res = await request.get("/verify-email", { maxRedirects: 0 });
    const status = res.status();
    expect([301, 302, 307, 308]).toContain(status);
    const loc = res.headers()["location"] || "";
    expect(loc).toContain("/verify-email-code");
  });

  test("/register: нет текста link-flow, есть сценарий кода", async ({ page }) => {
    await page.goto("/register");
    const body = page.locator("body");
    await expect(body).not.toContainText("Мы отправили письмо со ссылкой");
    await expect(body).not.toContainText("Я подтвердил почту");
    await expect(body).not.toContainText("Отправить письмо повторно");
    await expect(page.getByRole("heading", { name: /Регистрация/i })).toBeVisible();
  });

  test("resend в коде вызывает только /api/auth/send-email-code", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const p = join(process.cwd(), "app", "verify-email-code", "page.tsx");
    const src = readFileSync(p, "utf8");
    expect(src).toContain("/api/auth/send-email-code");
    expect(src).not.toMatch(/\bsendEmailVerification\s*\(/);
  });

  test("исходник /verify-email-code: копирайт про код, не про ссылку (без сессии редирект на /login)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const p = join(process.cwd(), "app", "verify-email-code", "page.tsx");
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/6-значн/i);
    expect(src).toMatch(/код подтверждения/i);
    expect(src).not.toMatch(/Мы отправили письмо со ссылкой/i);
    expect(src).not.toMatch(/Я подтвердил почту/i);
  });

  test("после регистрации в коде зашит redirect на verify-email-code", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const p = join(process.cwd(), "app", "register", "page.tsx");
    const src = readFileSync(p, "utf8");
    expect(src).toMatch(/\$\{VERIFY_EMAIL_CODE_PATH\}\?from=register/);
    expect(src).not.toMatch(/["']\/verify-email["']/);
  });
});

test.describe("optional: полная регистрация", () => {
  test("регистрация и переход на /verify-email-code", async ({ page }) => {
    test.skip(
      !process.env.E2E_REGISTER_EMAIL || !process.env.E2E_REGISTER_PASSWORD,
      "Задайте E2E_REGISTER_EMAIL и E2E_REGISTER_PASSWORD"
    );
    const email = process.env.E2E_REGISTER_EMAIL!;
    const password = process.env.E2E_REGISTER_PASSWORD!;
    await page.goto("/register");
    await page.getByPlaceholder("Введите email").fill(email);
    await page.getByPlaceholder("Введите пароль").fill(password);
    await page.getByRole("button", { name: /Создать аккаунт/i }).click();
    await page.waitForURL(/\/verify-email-code/, { timeout: 60_000 });
    await expect(page).toHaveURL(/verify-email-code/);
    await expect(page.locator("body")).toContainText(/6-значн/i);
  });
});
