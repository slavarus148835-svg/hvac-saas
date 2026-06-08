"use client";

import type { ClipboardEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";
import {
  getVerificationResendCooldownLeftSec,
  recordVerificationEmailSentAtNow,
} from "@/lib/emailVerification";
import { formatSendEmailCodeApiError } from "@/lib/sendEmailCodeClientMessages";
import { tgHapticButtonTap } from "@/lib/telegramHaptic";

const inputStyle: React.CSSProperties = {
  width: 44,
  height: 52,
  textAlign: "center",
  fontSize: 22,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "15px 18px",
  borderRadius: 14,
  border: "2px solid #e2e8f0",
  background: "#fff",
  color: "#0f172a",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  boxSizing: "border-box",
};

type Props = {
  email: string | null;
  onVerified: () => void;
};

export function TgMiniAppEmailCodeForm({ email, onVerified }: Props) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setCooldownLeft(getVerificationResendCooldownLeftSec());
    const id = window.setInterval(() => {
      setCooldownLeft(getVerificationResendCooldownLeftSec());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const sessionHeaders = (): HeadersInit | null => {
    const token = getMiniAppSessionToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const sendCode = async () => {
    const headers = sessionHeaders();
    if (!headers) {
      setStatus({
        kind: "err",
        text: "Сессия Mini App не найдена. Откройте приложение из бота снова.",
      });
      return;
    }
    const left = getVerificationResendCooldownLeftSec();
    if (left > 0) {
      setStatus({ kind: "err", text: `Повторная отправка через ${left} с` });
      return;
    }
    setResendBusy(true);
    setStatus({ kind: "idle", text: "" });
    try {
      const res = await fetch("/api/telegram/miniapp-send-email-code", {
        method: "POST",
        headers,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      if (res.ok) {
        recordVerificationEmailSentAtNow();
        setCooldownLeft(getVerificationResendCooldownLeftSec());
        setStatus({ kind: "ok", text: "Код отправлен на почту" });
      } else {
        setStatus({ kind: "err", text: formatSendEmailCodeApiError(body) });
      }
    } catch {
      setStatus({ kind: "err", text: "Не удалось отправить код. Попробуйте позже." });
    } finally {
      setResendBusy(false);
    }
  };

  const verify = async (code: string) => {
    const headers = sessionHeaders();
    if (!headers) {
      setStatus({ kind: "err", text: "Сессия Mini App не найдена." });
      return;
    }
    setBusy(true);
    setStatus({ kind: "idle", text: "" });
    try {
      const res = await fetch("/api/telegram/miniapp-verify-email-code", {
        method: "POST",
        headers,
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        attemptsLeft?: number;
      };
      if (res.ok) {
        setStatus({ kind: "ok", text: "Email подтверждён" });
        onVerified();
        return;
      }
      let msg = "Неверный код";
      if (body.error === "expired") msg = "Код истёк. Запросите новый.";
      else if (body.error === "no_code") msg = "Сначала запросите код на почту.";
      else if (body.error === "wrong_code" && typeof body.attemptsLeft === "number") {
        msg = `Неверный код. Осталось попыток: ${body.attemptsLeft}`;
      }
      setStatus({ kind: "err", text: msg });
      setDigits(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } catch {
      setStatus({ kind: "err", text: "Ошибка проверки. Попробуйте снова." });
    } finally {
      setBusy(false);
    }
  };

  const updateDigit = (index: number, value: string) => {
    const d = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = d;
    setDigits(next);
    if (d && index < 5) inputsRef.current[index + 1]?.focus();
    const joined = next.join("");
    if (joined.length === 6 && !busy) {
      void verify(joined);
    }
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
    setDigits(next);
    if (pasted.length === 6 && !busy) void verify(pasted);
  };

  return (
    <div>
      {email ? (
        <p style={{ margin: "0 0 14px", fontSize: 15, color: "#334155" }}>
          Код отправлен на <strong>{email}</strong>
        </p>
      ) : null}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={d}
            disabled={busy}
            style={inputStyle}
            onChange={(e) => updateDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={i === 0 ? onPaste : undefined}
          />
        ))}
      </div>
      <button
        type="button"
        style={{ ...btnSecondary, opacity: resendBusy || cooldownLeft > 0 ? 0.7 : 1 }}
        disabled={resendBusy || cooldownLeft > 0 || busy}
        onClick={() => {
          tgHapticButtonTap();
          void sendCode();
        }}
      >
        {resendBusy
          ? "Отправляем…"
          : cooldownLeft > 0
            ? `Отправить снова (${cooldownLeft} с)`
            : "Отправить код на почту"}
      </button>
      {status.text ? (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 13,
            color: status.kind === "err" ? "#b91c1c" : "#64748b",
            lineHeight: 1.5,
          }}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
