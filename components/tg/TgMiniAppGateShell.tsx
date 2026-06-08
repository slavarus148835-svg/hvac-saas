"use client";

import Link from "next/link";
import { useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import { TgMiniAppEmailCodeForm } from "@/components/tg/TgMiniAppEmailCodeForm";
import {
  markTelegramPostAuthFlow,
  TG_REGISTER_PATH,
} from "@/lib/telegramPostAuthRedirect";
import { CABINET_MONTHLY_PRICE_RUB } from "@/lib/subscriptionVisibility";
import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";
import { getTelegramWebApp } from "@/lib/telegramMiniApp";
import type { TgProtectedPhase } from "@/lib/miniAppAccessGate";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

const page: React.CSSProperties = {
  minHeight: "100dvh",
  padding:
    "max(20px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom))",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "18px 16px",
  marginBottom: 16,
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 8px",
  letterSpacing: "-0.02em",
};

const sub: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 15,
  lineHeight: 1.5,
  color: "#64748b",
};

const btn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "15px 18px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 10,
};

type Props = {
  phase: TgProtectedPhase;
  initData: string;
  profile: TelegramMiniAppProfile | null;
  errorMessage?: string | null;
  onLinked?: (profile: TelegramMiniAppProfile) => void;
  onRetryLogin?: () => void;
  onEmailVerified?: () => void;
};

export function TgMiniAppGateShell({
  phase,
  initData,
  profile,
  errorMessage,
  onLinked,
  onRetryLogin,
  onEmailVerified,
}: Props) {
  if (phase === "loading") {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ margin: 0, color: "#64748b", fontSize: 16 }}>Проверка аккаунта…</p>
      </div>
    );
  }

  if (phase === "no_init") {
    return (
      <div style={page}>
        <h1 style={title}>HVAC SaaS</h1>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.5 }}>
            Откройте приложение из Telegram-бота HVAC-SaaS, чтобы войти.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={page}>
        <h1 style={title}>HVAC SaaS</h1>
        <div style={card}>
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 15, lineHeight: 1.5 }}>
            {errorMessage || "Не удалось проверить аккаунт."}
          </p>
          <button
            type="button"
            style={{ ...btn, marginTop: 16 }}
            onClick={() => {
              tgHapticButtonTap();
              if (onRetryLogin) onRetryLogin();
              else window.location.reload();
            }}
          >
            🔄 Повторить вход
          </button>
        </div>
      </div>
    );
  }

  if (phase === "blocked") {
    return (
      <div style={page}>
        <h1 style={title}>Доступ ограничен</h1>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.5 }}>
            Аккаунт заблокирован. Напишите в поддержку:{" "}
            <a href="mailto:Komfort.service.Krasnodar@gmail.com" style={{ color: "#0f172a" }}>
              Komfort.service.Krasnodar@gmail.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (phase === "subscription_expired") {
    return <TgSubscriptionExpiredScreen />;
  }

  if (phase === "need_verify") {
    return (
      <TgVerifyEmailScreen
        email={profile?.email ?? null}
        onVerified={() => onEmailVerified?.()}
      />
    );
  }

  if (phase === "need_link") {
    return (
      <div style={page}>
        <h1 style={title}>Вход в HVAC-SaaS</h1>
        <p style={sub}>
          Telegram подтверждён. Чтобы пользоваться калькулятором, привяжите email или создайте
          новый аккаунт.
        </p>
        <div style={card}>
          <p style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            У меня уже есть аккаунт
          </p>
          {initData ? (
            <TgMiniAppEmailLink
              initData={initData}
              onLinked={(p) => {
                onLinked?.(p);
              }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>
              Нет данных Telegram. Откройте Mini App из бота снова.
            </p>
          )}
        </div>
        <div style={card}>
          <p style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            Создать новый аккаунт
          </p>
          <p style={{ margin: "0 0 14px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
            Регистрация по email с подтверждением почты. Trial начнётся после первого расчёта.
          </p>
          <Link
            href={TG_REGISTER_PATH}
            style={btn}
            onClick={() => {
              tgHapticButtonTap();
              markTelegramPostAuthFlow();
            }}
          >
            Создать новый аккаунт
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

function TgSubscriptionExpiredScreen() {
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const startPayment = () => {
    void (async () => {
      tgHapticButtonTap();
      const token = getMiniAppSessionToken();
      if (!token) {
        setPayError("Сессия не найдена. Закройте Mini App и откройте снова из бота.");
        return;
      }
      setPaying(true);
      setPayError(null);
      try {
        const res = await fetch("/api/telegram/miniapp-create-payment", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          url?: string;
          error?: string;
          message?: string;
        };
        if (!res.ok || !data.url) {
          if (data.error === "email_not_verified") {
            setPayError("Сначала подтвердите email в Mini App.");
          } else {
            setPayError(
              typeof data.message === "string" && data.message.trim()
                ? data.message
                : typeof data.error === "string"
                  ? data.error
                  : "Не удалось создать платёж"
            );
          }
          return;
        }
        const wa = getTelegramWebApp();
        if (wa?.openLink) {
          wa.openLink(data.url, { try_instant_view: false });
        } else {
          window.location.href = data.url;
        }
      } catch {
        setPayError("Ошибка соединения. Попробуйте позже.");
      } finally {
        setPaying(false);
      }
    })();
  };

  return (
    <div style={page}>
      <h1 style={title}>Пробный период закончился</h1>
      <div style={card}>
        <p style={{ margin: "0 0 14px", fontSize: 15, color: "#64748b", lineHeight: 1.5 }}>
          Доступ к калькулятору, прайсу и истории закрыт. Оформите подписку, чтобы продолжить
          работу в сервисе.
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
          {CABINET_MONTHLY_PRICE_RUB} ₽ / мес
        </p>
        <button
          type="button"
          style={{ ...btn, opacity: paying ? 0.75 : 1 }}
          disabled={paying}
          onClick={startPayment}
        >
          {paying ? "Подготовка оплаты…" : "Оформить подписку"}
        </button>
        {payError ? (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
            {payError}
          </p>
        ) : null}
        <Link href="/tg/cabinet" style={{ ...btnSecondary, marginTop: 12 }}>
          Личный кабинет
        </Link>
      </div>
    </div>
  );
}

function TgVerifyEmailScreen({
  email,
  onVerified,
}: {
  email: string | null;
  onVerified: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={page}>
      <h1 style={title}>Подтвердите email</h1>
      <p style={sub}>
        Доступ к калькулятору и прайсу откроется после подтверждения почты кодом из письма.
      </p>
      <div style={card}>
        {showForm ? (
          <TgMiniAppEmailCodeForm email={email} onVerified={onVerified} />
        ) : (
          <>
            {email ? (
              <p style={{ margin: "0 0 14px", fontSize: 15, color: "#334155" }}>
                Email: <strong>{email}</strong>
              </p>
            ) : null}
            <button
              type="button"
              style={btn}
              onClick={() => {
                tgHapticButtonTap();
                setShowForm(true);
              }}
            >
              Ввести код подтверждения
            </button>
          </>
        )}
      </div>
    </div>
  );
}
