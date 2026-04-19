"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  LOGIN_PATH,
  firebaseAuthErrorMessageWithCode,
  getPasswordResetActionCodeSettings,
} from "@/lib/emailVerification";

const SESSION_LAST_SEND_MS = "hvac_password_reset_last_send_ms";
const COOLDOWN_SEC = 45;

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
      await sendPasswordResetEmail(auth, trimmed, getPasswordResetActionCodeSettings());
      sessionStorage.setItem(SESSION_LAST_SEND_MS, String(Date.now()));
      setCooldown(COOLDOWN_SEC);
      setStatus("success");
      setMessage(
        "Мы отправили ссылку для восстановления пароля на вашу почту. Откройте письмо и следуйте инструкциям, затем войдите с новым паролем."
      );
    } catch (e) {
      console.error("password reset", e);
      setStatus("error");
      setMessage(firebaseAuthErrorMessageWithCode(e));
    } finally {
      setBusy(false);
      guardRef.current = false;
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ marginTop: 0, marginBottom: 16, fontSize: 26 }}>Восстановление пароля</h1>
        <p style={{ marginTop: 0, marginBottom: 16, color: "#4b5563", lineHeight: 1.5, fontSize: 15 }}>
          Укажите email аккаунта. После смены пароля по ссылке из письма войдите на странице «Вход» с
          новым паролем — сессия сохранится на этом устройстве как обычно.
        </p>

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
          {busy
            ? "Отправка…"
            : cooldown > 0
              ? `Отправить снова через ${cooldown} с`
              : "Отправить письмо"}
        </button>

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
