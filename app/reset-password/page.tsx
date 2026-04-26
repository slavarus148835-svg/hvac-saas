"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LOGIN_PATH } from "@/lib/emailVerification";
import { formatSendEmailCodeApiError } from "@/lib/sendEmailCodeClientMessages";

const SESSION_LAST_SEND_MS = "hvac_password_reset_last_send_ms";
const COOLDOWN_SEC = 60;

function cooldownLeftSec(): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(SESSION_LAST_SEND_MS);
  if (!raw) return 0;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, COOLDOWN_SEC - Math.floor((Date.now() - ts) / 1000));
}

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const guardRef = useRef(false);

  const tick = useCallback(() => setCooldown(cooldownLeftSec()), []);

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  const handleSend = async () => {
    if (guardRef.current || busy) return;
    if (cooldownLeftSec() > 0) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("Введите email.");
      return;
    }
    guardRef.current = true;
    setBusy(true);
    setStatus("idle");
    setMessage("");
    try {
      const payload = { email: trimmed };
      console.log("[reset-password] POST /api/auth/send-password-reset-code", { payload });
      const res = await fetch("/api/auth/send-password-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        retryAfterSec?: number;
        error?: string;
        detail?: string;
      };
      console.log("[reset-password] response", res.status, data);
      if (!res.ok || !data.ok) {
        const maybe = formatSendEmailCodeApiError(data as { error?: string; detail?: string });
        throw new Error(maybe || "Не удалось отправить код.");
      }
      sessionStorage.setItem(SESSION_LAST_SEND_MS, String(Date.now()));
      setCooldown(
        Math.max(0, Number.isFinite(Number(data.retryAfterSec)) ? Number(data.retryAfterSec) : COOLDOWN_SEC)
      );
      setStep("code");
      setStatus("success");
      setMessage(
        "Мы отправили 6-значный код на вашу почту. Введите код ниже, затем задайте новый пароль."
      );
    } catch (e) {
      console.error("password reset", e);
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Не удалось отправить код.");
    } finally {
      setBusy(false);
      guardRef.current = false;
    }
  };

  const handleReset = async () => {
    if (guardRef.current || busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setStatus("error");
      setMessage("Введите email.");
      return;
    }
    if (String(code).replace(/\D/g, "").length !== 6) {
      setStatus("error");
      setMessage("Введите 6-значный код.");
      return;
    }
    if (newPassword.length < 6) {
      setStatus("error");
      setMessage("Новый пароль должен содержать минимум 6 символов.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("error");
      setMessage("Пароли не совпадают.");
      return;
    }
    guardRef.current = true;
    setBusy(true);
    setStatus("idle");
    setMessage("");
    try {
      const res = await fetch("/api/auth/reset-password-with-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          code: String(code).replace(/\D/g, "").slice(0, 6),
          newPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        attemptsLeft?: number;
      };
      if (!res.ok || !data.ok) {
        const err = String(data.error || "");
        if (err === "wrong_code") {
          const suffix =
            typeof data.attemptsLeft === "number" ? ` Осталось попыток: ${data.attemptsLeft}.` : "";
          throw new Error(`Неверный код.${suffix}`);
        }
        if (err === "expired") throw new Error("Код истёк. Отправьте код ещё раз.");
        if (err === "too_many_attempts") throw new Error("Превышен лимит попыток. Запросите новый код.");
        if (err === "code_used") throw new Error("Этот код уже использован. Запросите новый.");
        if (err === "no_code") throw new Error("Код не найден. Сначала запросите код.");
        if (err === "password_too_short") {
          throw new Error("Новый пароль должен содержать минимум 6 символов.");
        }
        throw new Error("Не удалось сменить пароль. Проверьте данные и попробуйте ещё раз.");
      }
      setStep("success");
      setStatus("success");
      setMessage("Пароль изменён. Теперь войдите с новым паролем.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
      guardRef.current = false;
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ marginTop: 0, marginBottom: 16, fontSize: 26 }}>Восстановление пароля</h1>
        {step === "email" ? (
          <p style={{ marginTop: 0, marginBottom: 16, color: "#4b5563", lineHeight: 1.5, fontSize: 15 }}>
            Введите email аккаунта — мы отправим 6-значный код для смены пароля.
          </p>
        ) : step === "code" ? (
          <p style={{ marginTop: 0, marginBottom: 16, color: "#4b5563", lineHeight: 1.5, fontSize: 15 }}>
            Мы отправили 6-значный код на вашу почту. Введите код ниже, затем задайте новый пароль.
          </p>
        ) : (
          <p style={{ marginTop: 0, marginBottom: 16, color: "#4b5563", lineHeight: 1.5, fontSize: 15 }}>
            Пароль изменён. Теперь войдите с новым паролем.
          </p>
        )}

        <label style={label}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={input}
            autoComplete="email"
          />
        </label>

        {step === "code" ? (
          <>
            <label style={label}>
              Код из письма
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                style={input}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <label style={label}>
              Новый пароль
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                style={input}
                autoComplete="new-password"
              />
            </label>
            <label style={label}>
              Повторите пароль
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                style={input}
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={busy}
              style={{
                ...btn,
                opacity: busy ? 0.55 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Смена пароля…" : "Сменить пароль"}
            </button>
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14 }}>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={busy || cooldown > 0}
                style={ghostInlineBtn}
              >
                {cooldown > 0 ? `Отправить код ещё раз через ${cooldown} с` : "Отправить код ещё раз"}
              </button>
            </p>
          </>
        ) : step === "success" ? (
          <button type="button" onClick={() => (window.location.href = LOGIN_PATH)} style={btn}>
            Перейти ко входу
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy || cooldown > 0}
            style={{
              ...btn,
              opacity: busy || cooldown > 0 ? 0.55 : 1,
              cursor: busy || cooldown > 0 ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Отправка…" : cooldown > 0 ? `Получить код через ${cooldown} с` : "Получить код"}
          </button>
        )}

        {message ? (
          <div
            style={{
              ...banner,
              background: status === "error" ? "#fef2f2" : "#ecfdf5",
              borderColor: status === "error" ? "#fecaca" : "#bbf7d0",
              color: status === "error" ? "#991b1b" : "#166534",
            }}
          >
            {message}
          </div>
        ) : null}

        <p style={{ marginTop: 20, marginBottom: 0, fontSize: 14 }}>
          <Link href={LOGIN_PATH} style={{ color: "#2563eb", fontWeight: 600 }}>
            ← Назад ко входу
          </Link>
        </p>
      </div>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f6f8",
  padding: 16,
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#fff",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 8px 28px rgba(0,0,0,0.06)",
};

const label: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  color: "#111827",
};

const input: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 8,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 16,
  boxSizing: "border-box",
};

const btn: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
};

const banner: CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid",
  fontSize: 14,
  lineHeight: 1.45,
};

const ghostInlineBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  color: "#2563eb",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "underline",
};
