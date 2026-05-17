"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeEmailForAuth } from "@/lib/authEmailNormalize";
import {
  firebaseAuthErrorMessage,
  recordVerificationEmailSentAtNow,
} from "@/lib/emailVerification";
import { formatSendEmailCodeApiError } from "@/lib/sendEmailCodeClientMessages";
import { formatPreRegisterCheckError } from "@/lib/registrationPreCheckMessages";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { generateSessionId, getOrCreateDeviceId, setLocalSessionId } from "@/lib/deviceSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import { bootstrapMiniApp } from "@/lib/telegramMiniAppSession";
import {
  getPendingRegistrationSessionId,
  savePendingRegistrationSessionId,
} from "@/lib/telegramMiniAppPending";
import {
  buildVerifyEmailCodePathForPostAuth,
  DEFAULT_TELEGRAM_POST_AUTH_RETURN,
  markTelegramPostAuthFlow,
} from "@/lib/telegramPostAuthRedirect";

export default function TgRegisterPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [telegramReady, setTelegramReady] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userMessage, setUserMessage] = useState("");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    markTelegramPostAuthFlow(DEFAULT_TELEGRAM_POST_AUTH_RETURN);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({ intervalMs: 200, maxAttempts: 12 });
      if (cancelled) return;
      if (!wa) {
        setPhase("error");
        setUserMessage("Откройте регистрацию из Telegram-бота (Mini App).");
        return;
      }
      prepareTelegramMiniAppShell(wa);
      const initData = typeof wa.initData === "string" ? wa.initData.trim() : "";
      const boot = await bootstrapMiniApp(initData);
      if (cancelled) return;
      if (boot.ok && boot.profile) {
        router.replace("/tg/calculator");
        return;
      }
      if (boot.ok && boot.pending_email_registration) {
        const sid =
          boot.pendingSessionId || getPendingRegistrationSessionId() || "";
        if (sid) {
          savePendingRegistrationSessionId(sid);
          setPendingSessionId(sid);
        }
        setTelegramReady(true);
        setPhase("ready");
        return;
      }
      if (boot.ok && boot.need_email_linking) {
        setPhase("error");
        setUserMessage(
          "Этот email уже зарегистрирован. Войдите по email на сайте, затем привяжите Telegram в кабинете."
        );
        return;
      }
      setPhase("error");
      setUserMessage(boot.error ?? "Не удалось подтвердить Telegram.");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleRegister = async () => {
    if (isSubmitting) return;
    const sid = pendingSessionId || getPendingRegistrationSessionId();
    if (!sid) {
      setUserMessage("Сессия Telegram устарела. Откройте Mini App из бота снова.");
      return;
    }

    setIsSubmitting(true);
    setUserMessage("");
    setStatusText("Создание аккаунта…");
    console.log("EMAIL_REGISTER_START");

    const norm = normalizeEmailForAuth(email);

    try {
      const preRes = await fetch("/api/auth/pre-register-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: norm }),
        cache: "no-store",
      });
      const preJson = (await preRes.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        reason?: string;
        error?: string;
      };
      if (!preRes.ok || preJson.ok !== true) {
        setUserMessage(formatPreRegisterCheckError(preJson));
        return;
      }

      console.log("EMAIL_REGISTER_CREATED_AUTH");
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      const now = new Date().toISOString();
      const sessionId = generateSessionId();
      const deviceId = getOrCreateDeviceId();
      setLocalSessionId(sessionId);

      console.log("EMAIL_REGISTER_CREATED_PROFILE");
      await setDoc(
        doc(db, PRICING_FS.users, user.uid),
        {
          uid: user.uid,
          email: user.email,
          normalizedEmail: norm,
          authProvider: "email",
          registrationSource: "telegram_mini_app",
          emailVerified: false,
          emailVerifiedByCode: false,
          registrationStage: "auth_created",
          createdAt: now,
          updatedAt: now,
          role: "user",
          blocked: false,
          plan: "trial",
          subscriptionStatus: "trial_pending",
          trialDays: 15,
          activeSessionId: sessionId,
          deviceId,
          hasPaid: false,
        },
        { merge: true }
      );

      const idToken = await user.getIdToken(true);

      const linkRes = await fetch("/api/auth/complete-telegram-registration", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pendingSessionId: sid }),
      });
      const linkJson = (await linkRes.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        sessionToken?: string;
      };
      if (!linkRes.ok || linkJson.ok !== true) {
        setUserMessage(
          typeof linkJson.message === "string" && linkJson.message.trim()
            ? linkJson.message
            : "Аккаунт создан, но не удалось привязать Telegram. Напишите в поддержку."
        );
        return;
      }

      if (typeof linkJson.sessionToken === "string" && linkJson.sessionToken.trim()) {
        const { saveMiniAppSessionToken } = await import("@/lib/telegramMiniAppSession");
        saveMiniAppSessionToken(linkJson.sessionToken);
      }

      console.log("EMAIL_REGISTER_EMAIL_CODE_SENT");
      const codeRes = await fetch("/api/auth/send-email-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (codeRes.ok) {
        recordVerificationEmailSentAtNow();
        setStatusText("Код отправлен на почту");
        router.push(buildVerifyEmailCodePathForPostAuth());
        return;
      }
      const codeBody = (await codeRes.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      setUserMessage(formatSendEmailCodeApiError(codeBody));
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : "";
      if (code === "auth/email-already-in-use") {
        setUserMessage("Аккаунт с этим email уже есть. Войдите по email.");
      } else {
        setUserMessage(firebaseAuthErrorMessage(e));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <RegisterShell>
        {phase === "loading" ? (
          <p style={{ color: "#64748b" }}>Проверка Telegram…</p>
        ) : null}
        {phase === "ready" && telegramReady ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Регистрация</h1>
            <p style={{ color: "#16a34a", fontWeight: 600, margin: "0 0 8px" }}>
              Telegram подтверждён.
            </p>
            <p style={{ color: "#64748b", lineHeight: 1.5, margin: "0 0 20px" }}>
              Укажите email — он будет использоваться для входа и восстановления доступа.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              style={inputStyle}
            />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleRegister()}
              style={btnStyle}
            >
              {isSubmitting ? "Создание…" : "Создать аккаунт и начать триал"}
            </button>
            {statusText ? <p style={{ marginTop: 12 }}>{statusText}</p> : null}
            {userMessage ? (
              <p style={{ marginTop: 12, color: "#b91c1c" }}>{userMessage}</p>
            ) : null}
          </>
        ) : null}
        {phase === "error" && userMessage ? (
          <p style={{ color: "#b91c1c" }}>{userMessage}</p>
        ) : null}
      </RegisterShell>
    </>
  );
}

function RegisterShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "20px 16px",
        maxWidth: 440,
        margin: "0 auto",
        background: "#f8fafc",
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  marginBottom: 12,
  fontSize: 16,
  boxSizing: "border-box",
};

const btnStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
