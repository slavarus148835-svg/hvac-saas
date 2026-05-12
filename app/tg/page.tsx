"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import {
  authTelegramMiniApp,
  type TelegramMiniAppProfile,
} from "@/lib/telegramMiniAppAuth";
import { waitForTelegramWebApp } from "@/lib/telegramMiniApp";

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
  margin: "0 0 8px",
  letterSpacing: "-0.02em",
};

const sub: React.CSSProperties = {
  fontSize: 15,
  color: "#64748b",
  margin: "0 0 20px",
  lineHeight: 1.5,
};

const statusBox: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 16,
  fontSize: 14,
  lineHeight: 1.45,
};

const authBox: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "16px 16px",
  marginBottom: 16,
  fontSize: 15,
  lineHeight: 1.5,
  color: "#334155",
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
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 12,
};

type AuthUi =
  | "hidden"
  | "checking"
  | "profile"
  | "need_registration"
  | "error"
  | "no_init";

export default function TgMiniAppHomePage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Проверка окружения…");
  const [authUi, setAuthUi] = useState<AuthUi>("hidden");
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
        setStatus(
          [
            "Telegram WebApp доступен",
            wa.version ? `Версия SDK: ${wa.version}` : null,
            wa.platform ? `Платформа: ${wa.platform}` : null,
            wa.initData ? "initData получен" : "initData пуст (откройте из Telegram)",
          ]
            .filter(Boolean)
            .join("\n")
        );

        const initData = typeof wa.initData === "string" ? wa.initData.trim() : "";
        if (initData) {
          setAuthUi("checking");
          const ar = await authTelegramMiniApp(initData);
          if (cancelled) return;
          if (ar.ok && ar.profile) {
            setProfile(ar.profile);
            setAuthUi("profile");
            setAuthError(null);
          } else if (ar.ok && ar.need_registration) {
            setAuthUi("need_registration");
            setAuthError(null);
          } else {
            setAuthUi("error");
            setAuthError(ar.error ?? "Не удалось проверить аккаунт.");
          }
        } else {
          setAuthUi("no_init");
        }
      } else {
        setInTelegram(false);
        setStatus(
          "Открыто вне Telegram или скрипт не загрузился. Для Mini App откройте страницу из бота."
        );
        setAuthUi("hidden");
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
        <h1 style={title}>HVAC SaaS</h1>
        <p style={sub}>Telegram Mini App — слой /tg (основной сайт не затронут).</p>

        <div style={statusBox}>
          <strong>Статус</strong>
          <br />
          {ready ? (
            <>
              {inTelegram === true
                ? "Внутри Telegram WebApp: да"
                : inTelegram === false
                  ? "Внутри Telegram WebApp: нет"
                  : "Проверка…"}
              <br />
              <br />
              {status}
            </>
          ) : (
            "…"
          )}
        </div>

        {ready && inTelegram && authUi !== "hidden" ? (
          <div style={authBox}>
            {authUi === "checking" ? (
              <p style={{ margin: 0 }}>Проверяем Telegram-аккаунт…</p>
            ) : null}
            {authUi === "profile" && profile ? (
              <>
                <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#0f172a" }}>
                  Аккаунт найден
                </p>
                <ul
                  style={{
                    margin: "0 0 16px",
                    paddingLeft: 18,
                    fontSize: 14,
                    color: "#475569",
                  }}
                >
                  {profile.email ? <li>Email: {profile.email}</li> : null}
                  <li>План: {profile.plan ?? "—"}</li>
                  <li>Оплата: {profile.hasPaid ? "да" : "нет"}</li>
                  {profile.blocked ? (
                    <li style={{ color: "#b91c1c" }}>Аккаунт заблокирован</li>
                  ) : null}
                </ul>
                <Link href="/tg/calculator" style={btn}>
                  Открыть калькулятор
                </Link>
              </>
            ) : null}
            {authUi === "need_registration" ? (
              <>
                <p style={{ margin: "0 0 16px" }}>
                  Аккаунт Telegram пока не связан с профилем HVAC-SaaS
                </p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Зарегистрироваться
                </Link>
              </>
            ) : null}
            {authUi === "error" && authError ? (
              <p style={{ margin: 0, color: "#b91c1c" }}>{authError}</p>
            ) : null}
            {authUi === "no_init" ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                Нет initData — откройте Mini App из Telegram-бота, затем обновите
                страницу.
              </p>
            ) : null}
          </div>
        ) : null}

        {authUi !== "profile" ? (
          <Link href="/tg/calculator" style={{ ...btn, opacity: authUi === "checking" ? 0.65 : 1 }}>
            Калькулятор (Mini App)
          </Link>
        ) : null}
      </div>
    </>
  );
}
