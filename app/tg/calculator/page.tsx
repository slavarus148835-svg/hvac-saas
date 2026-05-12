"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "20px 16px 32px",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 12px",
};

const text: React.CSSProperties = {
  fontSize: 15,
  color: "#475569",
  lineHeight: 1.55,
  margin: "0 0 16px",
};

const btn: React.CSSProperties = {
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
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 12,
};

const tgLine: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  margin: "0 0 8px",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 16,
  fontSize: 14,
  lineHeight: 1.5,
  color: "#334155",
};

type AuthUi =
  | "idle"
  | "checking"
  | "profile"
  | "need_registration"
  | "error"
  | "no_tg"
  | "no_init";

export default function TgCalculatorPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  const [authUi, setAuthUi] = useState<AuthUi>("idle");
  const [profile, setProfile] = useState<TelegramMiniAppProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 10,
      });
      if (cancelled) return;

      if (wa) {
        try {
          wa.ready();
        } catch {
          /* */
        }
        setInTelegram(true);
        const initData = typeof wa.initData === "string" ? wa.initData.trim() : "";
        setAuthUi("checking");
        const resolved = await ensureTelegramMiniAppProfile(initData || null);
        if (cancelled) return;
        if (resolved.status === "profile") {
          setProfile(resolved.profile);
          setAuthUi("profile");
          setAuthError(null);
        } else if (resolved.status === "need_registration") {
          setAuthUi("need_registration");
          setAuthError(null);
        } else if (resolved.status === "error") {
          setAuthUi("error");
          setAuthError(resolved.message);
        } else {
          setAuthUi("no_init");
          setAuthError(null);
        }
      } else {
        setInTelegram(false);
        setAuthUi("checking");
        const resolved = await ensureTelegramMiniAppProfile(null);
        if (cancelled) return;
        if (resolved.status === "profile") {
          setProfile(resolved.profile);
          setAuthUi("profile");
          setAuthError(null);
        } else if (resolved.status === "need_registration") {
          setAuthUi("need_registration");
          setAuthError(null);
        } else if (resolved.status === "error") {
          setAuthUi("error");
          setAuthError(resolved.message);
        } else {
          setAuthUi("no_tg");
          setAuthError(null);
        }
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          const wa = window.Telegram?.WebApp;
          if (wa) {
            try {
              wa.ready();
            } catch {
              /* */
            }
          }
        }}
      />
      <div style={page}>
        <h1 style={title}>Калькулятор монтажника</h1>
        {!ready ? (
          <p style={text}>Проверка окружения…</p>
        ) : (
          <>
            <p style={tgLine}>
              {inTelegram === true
                ? "Внутри Telegram WebApp: да"
                : inTelegram === false
                  ? "Внутри Telegram WebApp: нет"
                  : "Проверка…"}
            </p>
            <p style={text}>
              {inTelegram
                ? "Telegram Mini App подключён"
                : "Откройте из Telegram для полного режима Mini App"}
            </p>

            <div style={card}>
              {authUi === "checking" ? (
                <p style={{ margin: 0 }}>Проверяем Telegram-аккаунт…</p>
              ) : null}
              {authUi === "profile" && profile ? (
                <>
                  <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#0f172a" }}>
                    Вы вошли через Telegram
                  </p>
                  <ul
                    style={{
                      margin: "0 0 12px",
                      paddingLeft: 18,
                      fontSize: 14,
                      color: "#475569",
                    }}
                  >
                    {profile.email ? <li>Email: {profile.email}</li> : null}
                    <li>План: {profile.plan ?? "—"}</li>
                    <li>Оплата: {profile.hasPaid ? "да" : "нет"}</li>
                  </ul>
                </>
              ) : null}
              {authUi === "need_registration" ? (
                <p style={{ margin: "0 0 12px" }}>
                  Свяжите аккаунт Telegram с профилем HVAC-SaaS, чтобы пользоваться
                  калькулятором.
                </p>
              ) : null}
              {authUi === "error" && authError ? (
                <p style={{ margin: "0 0 12px", color: "#b91c1c" }}>{authError}</p>
              ) : null}
              {authUi === "no_init" ? (
                <p style={{ margin: "0 0 12px", color: "#64748b" }}>
                  Нет initData — откройте страницу из бота.
                </p>
              ) : null}
              {authUi === "no_tg" ? (
                <p style={{ margin: "0 0 12px", color: "#64748b" }}>
                  Вне Telegram можно перейти на обычный калькулятор (потребуется вход на
                  сайте).
                </p>
              ) : null}
            </div>

            {authUi === "profile" ? (
              <Link href="/calculator" style={btn}>
                Открыть полный калькулятор
              </Link>
            ) : null}
            {authUi === "need_registration" ? (
              <>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Зарегистрироваться
                </Link>
              </>
            ) : null}
            {(authUi === "no_tg" ||
              authUi === "no_init" ||
              authUi === "error") && (
              <Link href="/calculator" style={btn}>
                Открыть калькулятор на сайте
              </Link>
            )}
          </>
        )}
      </div>
    </>
  );
}
