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
import { TgProtectedMiniApp } from "@/components/tg/TgProtectedMiniApp";
import { TgChannelPromoCard } from "@/components/tg/TgChannelPromoCard";

const page: React.CSSProperties = {
  minHeight: "100dvh",
  padding:
    "max(20px, env(safe-area-inset-top)) 16px max(32px, env(safe-area-inset-bottom))",
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
  margin: "0 0 16px",
  letterSpacing: "-0.02em",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 16,
};

const cardTitle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 16,
  fontWeight: 700,
  color: "#0f172a",
};

const profileRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "11px 0",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 15,
  lineHeight: 1.45,
};

const profileLabel: React.CSSProperties = {
  color: "#64748b",
  flexShrink: 0,
};

const profileValue: React.CSSProperties = {
  color: "#0f172a",
  fontWeight: 600,
  textAlign: "right",
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

const hint: React.CSSProperties = {
  margin: "14px 0 0",
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.5,
  textAlign: "center",
};

type AuthUi =
  | "idle"
  | "checking"
  | "profile"
  | "need_registration"
  | "need_email_linking"
  | "error"
  | "no_tg"
  | "no_init";

function formatTariffLabel(
  profile: TelegramMiniAppProfile,
  accountExtra: MiniAppMeAccount | null
): string {
  if (profile.hasPaid) return "Платная подписка";

  const status = accountExtra?.accessStatusLabel;
  if (status === "Подписка активна") return "Платная подписка";
  if (status === "Триал активен") return "Пробный период";

  const plan = (profile.plan ?? "").trim().toLowerCase();
  if (plan === "trial" || plan.includes("trial")) return "Пробный период";
  if (
    plan === "paid" ||
    plan === "subscription" ||
    plan.includes("paid") ||
    plan.includes("pro")
  ) {
    return "Платная подписка";
  }
  if (status === "Доступ истёк") return "Нет активного доступа";

  return "—";
}

function ProfileRows({
  profile,
  accountExtra,
}: {
  profile: TelegramMiniAppProfile;
  accountExtra: MiniAppMeAccount | null;
}) {
  const status =
    accountExtra?.accessStatusLabel ?? (profile.hasPaid ? "Подписка активна" : "—");
  const until = accountExtra?.accessUntilLabel ?? "—";
  const tariff = formatTariffLabel(profile, accountExtra);

  const rows: { label: string; value: string; valueStyle?: React.CSSProperties }[] = [
    { label: "Статус", value: status },
    { label: "Срок действия", value: until },
    { label: "Тариф", value: tariff },
  ];

  if (profile.blocked) {
    rows.push({
      label: "Статус аккаунта",
      value: "Заблокирован",
      valueStyle: { color: "#b91c1c" },
    });
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            ...profileRow,
            borderBottom: i === rows.length - 1 ? "none" : profileRow.borderBottom,
            paddingBottom: i === rows.length - 1 ? 0 : profileRow.padding,
            paddingTop: i === 0 ? 0 : profileRow.padding,
          }}
        >
          <span style={profileLabel}>{row.label}</span>
          <span style={{ ...profileValue, ...row.valueStyle }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function TgCabinetPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
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

  const showProfileCard =
    ready &&
    (authUi === "profile" ||
      authUi === "checking" ||
      authUi === "need_email_linking" ||
      authUi === "need_registration" ||
      authUi === "error" ||
      authUi === "no_init" ||
      authUi === "no_tg");

  return (
    <TgProtectedMiniApp requireSubscription={false}>
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        <h1 style={title}>Кабинет</h1>
        {ready && authUi === "profile" ? <TgMiniAppNav /> : null}

        {!ready ? (
          <div style={card}>
            <p style={{ margin: 0, fontSize: 15, color: "#64748b" }}>Загрузка…</p>
          </div>
        ) : null}

        {showProfileCard ? (
          <div style={card}>
            {authUi === "checking" ? (
              <p style={{ margin: 0, fontSize: 15, color: "#64748b" }}>
                Проверяем аккаунт…
              </p>
            ) : null}

            {authUi === "profile" && profile ? (
              <>
                <h2 style={cardTitle}>Ваш доступ</h2>
                <ProfileRows profile={profile} accountExtra={accountExtra} />
              </>
            ) : null}

            {authUi === "need_email_linking" && emailLinkInitData ? (
              <>
                <h2 style={cardTitle}>Привязка email</h2>
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
              <>
                <h2 style={cardTitle}>Вход в аккаунт</h2>
                <p style={{ margin: 0, fontSize: 15, color: "#475569", lineHeight: 1.5 }}>
                  Аккаунт Telegram не привязан к HVAC-SaaS. Войдите или зарегистрируйтесь на
                  сайте.
                </p>
              </>
            ) : null}

            {authUi === "error" && authError ? (
              <p style={{ margin: 0, color: "#b91c1c", fontSize: 15, lineHeight: 1.5 }}>
                {authError}
              </p>
            ) : null}

            {authUi === "no_init" ? (
              <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.5 }}>
                Откройте Mini App из бота HVAC-SaaS, чтобы увидеть профиль.
              </p>
            ) : null}

            {authUi === "no_tg" ? (
              <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.5 }}>
                Полный кабинет и оплата доступны в веб-версии.
              </p>
            ) : null}
          </div>
        ) : null}

        {authUi === "profile" ? (
          <>
            <TgChannelPromoCard alwaysVisible />
            <Link href="/dashboard" style={btn}>
              Открыть веб-кабинет
            </Link>
          </>
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
          authUi === "idle") &&
        ready ? (
          <Link href="/dashboard" style={btn}>
            Открыть кабинет на сайте
          </Link>
        ) : null}

        {authUi === "profile" ? (
          <p style={hint}>Оплата и управление подпиской — в веб-кабинете.</p>
        ) : null}

        <TgMiniAppLegalFooter />
      </div>
    </>
    </TgProtectedMiniApp>
  );
}
