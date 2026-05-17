"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { auth } from "@/lib/firebase";
import { tryAttachPartnerManagerFromStorage } from "@/lib/partner/clientAttachPartnerManager";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import { ensureTelegramMiniAppProfile, getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";
import { fetchMiniAppMeAccount, type MiniAppMeAccount } from "@/lib/telegramMiniAppCalculatorApi";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import { TgMiniAppLegalFooter } from "@/components/tg/TgMiniAppLegalFooter";

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

function formatIsoDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AuthUi =
  | "idle"
  | "checking"
  | "profile"
  | "need_registration"
  | "need_email_linking"
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
  const [accountExtra, setAccountExtra] = useState<MiniAppMeAccount | null>(null);
  const [emailLinkInitData, setEmailLinkInitData] = useState("");

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
          const me = await fetchMiniAppMeAccount();
          if (!cancelled && me.ok) setAccountExtra(me.account);
        } else if (resolved.status === "need_email_linking") {
          if (resolved.initData) {
            setAuthUi("need_email_linking");
            setEmailLinkInitData(resolved.initData);
          } else {
            setAuthUi("need_registration");
            setEmailLinkInitData("");
          }
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
          const me = await fetchMiniAppMeAccount();
          if (!cancelled && me.ok) setAccountExtra(me.account);
        } else if (resolved.status === "need_email_linking") {
          if (resolved.initData) {
            setAuthUi("need_email_linking");
            setEmailLinkInitData(resolved.initData);
          } else {
            setAuthUi("need_registration");
            setEmailLinkInitData("");
          }
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

  useEffect(() => {
    if (authUi !== "profile" || !profile?.uid) return;
    const uid = profile.uid;
    void tryAttachPartnerManagerFromStorage(
      uid,
      async () => {
        const m = getMiniAppSessionToken();
        if (m?.trim()) return m.trim();
        const u = auth.currentUser;
        if (!u) return "";
        return u.getIdToken();
      },
      "telegram_miniapp"
    );
  }, [authUi, profile?.uid]);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        <h1 style={title}>Кабинет</h1>
        {ready && authUi === "profile" ? <TgMiniAppNav /> : null}
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
                {profile.email ? <li>Email: {profile.email}</li> : null}
                <li>
                  Статус:{" "}
                  {accountExtra?.accessStatusLabel ?? (profile.hasPaid ? "Подписка активна" : "—")}
                </li>
                <li>Срок: {accountExtra?.accessUntilLabel ?? "—"}</li>
                <li>План: {profile.plan ?? "—"}</li>
                {profile.telegramUsername ? (
                  <li>@{profile.telegramUsername}</li>
                ) : null}
                {profile.blocked ? (
                  <li style={{ color: "#b91c1c" }}>Заблокирован</li>
                ) : null}
              </ul>
            ) : null}
            {authUi === "need_email_linking" && emailLinkInitData ? (
              <>
                <TgMiniAppEmailLink
                  initData={emailLinkInitData}
                  onLinked={async (p) => {
                    setProfile(p);
                    setAuthUi("profile");
                    setAuthError(null);
                    const me = await fetchMiniAppMeAccount();
                    if (me.ok) setAccountExtra(me.account);
                  }}
                />
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
                  Нет аккаунта?{" "}
                  <Link href="/tg/register" style={{ color: "#0f172a", fontWeight: 600 }}>
                    Регистрация на сайте
                  </Link>
                </p>
              </>
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
            Открыть веб-кабинет
          </Link>
        ) : null}
        {authUi === "need_registration" ? (
          <>
            <Link href="/login" style={btn}>
              Войти
            </Link>
            <Link href="/tg/register" style={btnSecondary}>
              Зарегистрироваться
            </Link>
          </>
        ) : null}
        {authUi === "need_email_linking" && inTelegram === false ? (
          <>
            <Link href="/login" style={btn}>
              Войти
            </Link>
            <Link href="/tg/register" style={btnSecondary}>
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
          Полный кабинет и оплата — на сайте (/dashboard)
        </p>
        <TgMiniAppLegalFooter />
      </div>
    </>
  );
}
