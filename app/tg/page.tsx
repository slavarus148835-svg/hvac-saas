"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, type CSSProperties } from "react";
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";

const page: CSSProperties = {
  minHeight: "100dvh",
  padding: "20px 16px max(32px, env(safe-area-inset-bottom))",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const title: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 8px",
  letterSpacing: "-0.02em",
};

const sub: CSSProperties = {
  fontSize: 15,
  color: "#64748b",
  margin: "0 0 20px",
  lineHeight: 1.5,
};

const btn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "16px 18px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 12,
};

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 16,
  marginBottom: 16,
};

/**
 * Точка входа Mini App: сначала проверка сессии / initData, затем калькулятор только для привязанного аккаунта.
 */
export default function TgMiniAppHomePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "telegram" | "browser">("checking");
  const [tgAuth, setTgAuth] = useState<
    | "idle"
    | "loading"
    | "profile"
    | "need_registration"
    | "need_email_linking"
    | "error"
    | "no_init"
  >("idle");
  const [tgError, setTgError] = useState<string | null>(null);
  const [emailLinkInitData, setEmailLinkInitData] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 12,
      });
      if (cancelled) return;
      if (wa) {
        prepareTelegramMiniAppShell(wa);
        setPhase("telegram");
        setTgAuth("loading");
        const initData = typeof wa.initData === "string" ? wa.initData.trim() : "";
        const resolved = await ensureTelegramMiniAppProfile(initData || null);
        if (cancelled) return;
        if (resolved.status === "profile") {
          setTgAuth("profile");
          router.replace("/tg/calculator");
          return;
        }
        if (resolved.status === "need_email_linking") {
          setTgAuth("need_email_linking");
          setEmailLinkInitData(resolved.initData || "");
          setTgError(null);
          return;
        }
        if (resolved.status === "need_registration") {
          setTgAuth("need_registration");
          setTgError(null);
          return;
        }
        if (resolved.status === "error") {
          setTgAuth("error");
          setTgError(resolved.message);
          return;
        }
        setTgAuth("no_init");
        setTgError(null);
        return;
      }
      setPhase("browser");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      {phase === "checking" || (phase === "telegram" && tgAuth === "loading") ? (
        <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 16 }}>Проверка аккаунта…</p>
        </div>
      ) : null}
      {phase === "telegram" && tgAuth === "profile" ? (
        <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 16 }}>Открываем калькулятор…</p>
        </div>
      ) : null}
      {phase === "telegram" &&
      (tgAuth === "need_registration" ||
        tgAuth === "need_email_linking" ||
        tgAuth === "error" ||
        tgAuth === "no_init") ? (
        <div style={page}>
          <h1 style={title}>HVAC SaaS</h1>
          <p style={sub}>
            Чтобы пользоваться калькулятором и прайсом в Telegram, войдите в аккаунт HVAC-SaaS или
            зарегистрируйтесь и привяжите Telegram.
          </p>
          <div style={card}>
            {tgAuth === "need_email_linking" && emailLinkInitData ? (
              <>
                <TgMiniAppEmailLink
                  initData={emailLinkInitData}
                  onLinked={(_profile) => {
                    router.replace("/tg/calculator");
                  }}
                />
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
                  Нет аккаунта?{" "}
                  <Link href="/register" style={{ color: "#0f172a", fontWeight: 600 }}>
                    Регистрация на сайте
                  </Link>
                </p>
              </>
            ) : null}
            {tgAuth === "need_registration" ? (
              <>
                <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.5 }}>
                  Аккаунт с этим Telegram не найден. Войдите или зарегистрируйтесь на сайте — после
                  привязки откройте Mini App снова из бота.
                </p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Регистрация
                </Link>
              </>
            ) : null}
            {tgAuth === "error" && tgError ? (
              <p style={{ margin: 0, color: "#b91c1c", fontSize: 15 }}>{tgError}</p>
            ) : null}
            {tgAuth === "no_init" ? (
              <p style={{ margin: 0, color: "#64748b", fontSize: 15 }}>
                Нет данных Telegram. Откройте приложение кнопкой из бота HVAC-SaaS.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {phase === "browser" ? (
        <div style={page}>
          <h1 style={title}>HVAC SaaS</h1>
          <p style={sub}>
            Слой Mini App для Telegram. Внутри Telegram после входа открывается калькулятор. Здесь —
            веб-справка и ссылки.
          </p>
          <Link href="/tg/calculator" style={btn}>
            Калькулятор Mini App
          </Link>
          <Link href="/tg/history" style={btnSecondary}>
            История расчётов
          </Link>
          <Link href="/tg/cabinet" style={btnSecondary}>
            Кабинет (Mini App)
          </Link>
        </div>
      ) : null}
    </>
  );
}
