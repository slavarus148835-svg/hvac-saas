"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";

const page: React.CSSProperties = {
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

const ONBOARDING_KEY = "hvac_tg_onboarding_seen";

export default function TgMiniAppHomePage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Проверка окружения…");
  const [authUi, setAuthUi] = useState<AuthUi>("hidden");
  const [profile, setProfile] = useState<TelegramMiniAppProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 10,
      });
      if (cancelled) return;

      if (wa) {
        prepareTelegramMiniAppShell(wa);
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
        setStatus(
          "Открыто вне Telegram или скрипт не загрузился. Для Mini App откройте страницу из бота."
        );
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
          setAuthUi("hidden");
          setAuthError(null);
        }
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY) === "1") {
        setOnboardingDismissed(true);
      }
    } catch {
      /* */
    }
  }, []);

  function finishOnboarding() {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      /* */
    }
    setOnboardingDismissed(true);
  }

  const showOnboarding =
    ready && inTelegram === true && !onboardingDismissed && onboardingStep < 3;

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
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

        {ready && authUi !== "hidden" ? (
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
                <Link href="/tg/history" style={btnSecondary}>
                  Сохранённые расчёты
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

        {showOnboarding ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              background: "rgba(15,23,42,0.92)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "24px max(20px, env(safe-area-inset-right)) 32px max(20px, env(safe-area-inset-left))",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 18,
                padding: "28px 22px",
                maxWidth: 400,
                margin: "0 auto",
                width: "100%",
              }}
            >
              <p style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                {onboardingStep === 0
                  ? "Расчёт кондиционера за 1 минуту"
                  : onboardingStep === 1
                    ? "Ничего не забудете в смете"
                    : "Отправка клиенту прямо с объекта"}
              </p>
              <p style={{ margin: 0, fontSize: 15, color: "#475569", lineHeight: 1.55 }}>
                {onboardingStep === 0
                  ? "Мощность, трасса, опции и ваш прайс — всё в одном экране Mini App."
                  : onboardingStep === 1
                    ? "Штроба, кабель-каналы, подъёмы и услуги из прайса учитываются автоматически."
                    : "WhatsApp, Telegram, SMS, PDF и копирование текста — без переключения в другие приложения."}
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                {onboardingStep < 2 ? (
                  <button
                    type="button"
                    style={{ ...btn, flex: 1, marginTop: 0 }}
                    onClick={() => setOnboardingStep((s) => s + 1)}
                  >
                    Далее
                  </button>
                ) : (
                  <button type="button" style={{ ...btn, flex: 1, marginTop: 0 }} onClick={finishOnboarding}>
                    Начать
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
