"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import {
  buildVerifyEmailCodePathForPostAuth,
  markTelegramPostAuthFlow,
  TG_REGISTER_PATH,
} from "@/lib/telegramPostAuthRedirect";
import {
  formatSendEmailCodeApiError,
} from "@/lib/sendEmailCodeClientMessages";
import {
  getVerificationResendCooldownLeftSec,
  recordVerificationEmailSentAtNow,
} from "@/lib/emailVerification";
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
};

export function TgMiniAppGateShell({
  phase,
  initData,
  profile,
  errorMessage,
  onLinked,
  onRetryLogin,
}: Props) {
  const router = useRouter();

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

  if (phase === "need_verify") {
    return (
      <TgVerifyEmailScreen
        email={profile?.email ?? null}
        onContinue={() => {
          markTelegramPostAuthFlow();
          router.push(buildVerifyEmailCodePathForPostAuth());
        }}
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

function TgVerifyEmailScreen({
  email,
  onContinue,
}: {
  email: string | null;
  onContinue: () => void;
}) {
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const tryResend = () => {
    void (async () => {
      const left = getVerificationResendCooldownLeftSec();
      if (left > 0) {
        setCooldown(left);
        setResendMsg(`Повторная отправка через ${left} с`);
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        setResendMsg("Войдите по email на сайте, затем подтвердите почту.");
        return;
      }
      setResendBusy(true);
      setResendMsg(null);
      try {
        const idToken = await user.getIdToken(true);
        const res = await fetch("/api/auth/send-email-code", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          recordVerificationEmailSentAtNow();
          setResendMsg("Код отправлен на почту");
          setCooldown(getVerificationResendCooldownLeftSec());
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?: string;
          };
          setResendMsg(formatSendEmailCodeApiError(body));
        }
      } catch {
        setResendMsg("Не удалось отправить код. Попробуйте позже.");
      } finally {
        setResendBusy(false);
      }
    })();
  };

  return (
    <div style={page}>
      <h1 style={title}>Подтвердите email</h1>
      <p style={sub}>
        Доступ к калькулятору и прайсу откроется после подтверждения почты кодом из письма.
      </p>
      <div style={card}>
        {email ? (
          <p style={{ margin: "0 0 14px", fontSize: 15, color: "#334155" }}>
            Email: <strong>{email}</strong>
          </p>
        ) : null}
        <button
          type="button"
          style={{ ...btn, opacity: resendBusy ? 0.75 : 1 }}
          onClick={() => {
            tgHapticButtonTap();
            onContinue();
          }}
        >
          Ввести код подтверждения
        </button>
        <button
          type="button"
          style={{ ...btnSecondary, opacity: resendBusy || cooldown > 0 ? 0.7 : 1 }}
          disabled={resendBusy || cooldown > 0}
          onClick={() => {
            tgHapticButtonTap();
            tryResend();
          }}
        >
          {resendBusy ? "Отправляем…" : "Отправить код повторно"}
        </button>
        {resendMsg ? (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>{resendMsg}</p>
        ) : null}
        {!auth.currentUser ? (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
            Если вы регистрировались ранее на другом устройстве,{" "}
            <Link href="/login" style={{ color: "#0f172a", fontWeight: 600 }}>
              войдите по email
            </Link>{" "}
            и вернитесь в Mini App.
          </p>
        ) : null}
      </div>
    </div>
  );
}
