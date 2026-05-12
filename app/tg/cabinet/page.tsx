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

const statusBox: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 16,
  fontSize: 14,
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
  | "idle"
  | "checking"
  | "profile"
  | "need_registration"
  | "error"
  | "no_tg"
  | "no_init";

export default function TgCabinetPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  const [detail, setDetail] = useState("");
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
        setDetail(
          [
            "Telegram WebApp активен",
            wa.version ? `SDK: ${wa.version}` : null,
            wa.platform ? `Платформа: ${wa.platform}` : null,
            wa.initData ? "initData получен" : null,
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
        setDetail("Вне Telegram Mini App — откройте из бота для режима WebApp.");
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
        <h1 style={title}>Кабинет</h1>
        <div style={statusBox}>
          <strong>Подключение Telegram</strong>
          <br />
          <br />
          {!ready ? (
            "…"
          ) : (
            <>
              {inTelegram === true
                ? "Внутри Telegram WebApp: да"
                : inTelegram === false
                  ? "Внутри Telegram WebApp: нет"
                  : "Проверка…"}
              <br />
              <br />
              {detail}
            </>
          )}
        </div>

        {ready ? (
          <div style={{ ...statusBox, marginBottom: 16 }}>
            <strong>Профиль</strong>
            <br />
            <br />
            {authUi === "checking" ? (
              <span>Проверяем Telegram-аккаунт…</span>
            ) : null}
            {authUi === "profile" && profile ? (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 14,
                  color: "#475569",
                }}
              >
                {profile.uid ? <li>UID: {profile.uid}</li> : null}
                {profile.email ? <li>Email: {profile.email}</li> : null}
                <li>План: {profile.plan ?? "—"}</li>
                <li>Оплата: {profile.hasPaid ? "да" : "нет"}</li>
                {profile.telegramUsername ? (
                  <li>@{profile.telegramUsername}</li>
                ) : null}
                {profile.blocked ? (
                  <li style={{ color: "#b91c1c" }}>Заблокирован</li>
                ) : null}
              </ul>
            ) : null}
            {authUi === "need_registration" ? (
              <p style={{ margin: 0 }}>
                Аккаунт Telegram не привязан к HVAC-SaaS. Войдите или зарегистрируйтесь
                на сайте.
              </p>
            ) : null}
            {authUi === "error" && authError ? (
              <p style={{ margin: 0, color: "#b91c1c" }}>{authError}</p>
            ) : null}
            {authUi === "no_init" ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                Нет initData — откройте Mini App из бота.
              </p>
            ) : null}
            {authUi === "no_tg" ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                Полный кабинет на сайте — по ссылке ниже.
              </p>
            ) : null}
          </div>
        ) : null}

        {authUi === "profile" ? (
          <Link href="/dashboard" style={btn}>
            Открыть кабинет
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
          authUi === "error" ||
          authUi === "checking" ||
          authUi === "idle") && ready ? (
          <Link href="/dashboard" style={btn}>
            Открыть кабинет на сайте
          </Link>
        ) : null}

        <p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          В проекте кабинет — это /dashboard
        </p>
      </div>
    </>
  );
}
