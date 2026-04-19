"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { generateSessionId, getOrCreateDeviceId, setLocalSessionId } from "@/lib/deviceSession";
import {
  VERIFY_EMAIL_CODE_PATH,
  needsEmailCodeVerification,
  firebaseAuthErrorMessage,
  recordVerificationEmailSentAtNow,
} from "@/lib/emailVerification";
import { formatSendEmailCodeApiError } from "@/lib/sendEmailCodeClientMessages";
import { getSafePostLoginPath } from "@/lib/safeRedirect";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryingCode, setRetryingCode] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [diag, setDiag] = useState<{
    account: "создан" | "не создан";
    code: "отправлено" | "не отправлено" | "ошибка";
    telegram: "отправлено" | "ошибка" | "неизвестно";
    email: "выполнено" | "ожидается";
    access: "разрешен" | "заблокирован";
  }>({
    account: "не создан",
    code: "не отправлено",
    telegram: "неизвестно",
    email: "ожидается",
    access: "заблокирован",
  });
  const router = useRouter();
  const registeringRef = useRef(false);
  const holdOnPageRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
      const currentUser = await resolveAuthUser(userFromObserver);
      if (cancelled || !currentUser) return;
      if (registeringRef.current) return;
      if (holdOnPageRef.current) return;
      const snap = await getDocFromServer(doc(db, "users", currentUser.uid));
      const data = snap.exists() ? snap.data() : null;
      if (needsEmailCodeVerification(currentUser, data)) {
        router.replace(`${VERIFY_EMAIL_CODE_PATH}?from=register`);
        return;
      }
      router.replace(getSafePostLoginPath("/dashboard"));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  const loadRegistrationStatus = async (idToken: string) => {
    const res = await fetch("/api/auth/registration-status", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });
    const body = await res.text();
    console.log("[registration-status] loaded", res.status, body.slice(0, 1000));
    let json: Record<string, unknown> = {};
    try {
      json = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }
    if (res.ok) {
      const telegramRaw = String(json.telegramNotificationStatus || "unknown");
      const telegram =
        telegramRaw === "sent"
          ? "отправлено"
          : telegramRaw === "failed"
            ? "ошибка"
            : "неизвестно";
      const emailVerified = Boolean(
        json.emailVerificationSatisfied ?? json.emailVerifiedByCode
      );
      const stage = String(json.registrationStage || "");
      const sentAt = Boolean(json.emailCodeSentAt);
      const hasCode = Boolean(json.hasActiveCode);
      setDiag((prev) => {
        let codeStatus: "отправлено" | "не отправлено" | "ошибка" = prev.code;
        if (stage === "code_send_failed" || json.emailCodeSendError) {
          codeStatus = "ошибка";
        } else if (hasCode || sentAt || stage === "code_sent") {
          codeStatus = "отправлено";
        } else if (stage === "code_send_started") {
          codeStatus = "не отправлено";
        }
        return {
          ...prev,
          telegram,
          email: emailVerified ? "выполнено" : "ожидается",
          access: emailVerified ? "разрешен" : "заблокирован",
          code: codeStatus,
        };
      });
    }
    return { status: res.status, body, json, ok: res.ok };
  };

  const sendEmailCode = async (idToken: string) => {
    console.log("[register] send code start");
    setStatusText("Отправка кода на почту…");
    const res = await fetch("/api/auth/send-email-code", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const body = await res.text();
    console.log("[register] send code response status", res.status);
    console.log("[register] send code response body", body.slice(0, 2000));
    if (res.ok) {
      console.log("[register] send code success");
      recordVerificationEmailSentAtNow();
      setDiag((prev) => ({ ...prev, code: "отправлено" }));
      setStatusText("Код отправлен");
      return { ok: true as const };
    }
    console.log("[register] send code fail");
    let errorText = "Не удалось отправить код подтверждения.";
    try {
      const parsed = JSON.parse(body) as {
        error?: string;
        detail?: string;
        retryAfterSec?: number;
      };
      errorText = formatSendEmailCodeApiError(parsed);
    } catch {
      if (body.trim()) errorText = body.slice(0, 300);
    }
    setDiag((prev) => ({ ...prev, code: "ошибка" }));
    return { ok: false as const, message: errorText };
  };

  const retrySendCode = async () => {
    if (retryingCode) return;
    const user = auth.currentUser;
    if (!user) {
      setUserMessage("Сессия отсутствует. Войдите заново и отправьте код повторно.");
      return;
    }
    setRetryingCode(true);
    try {
      const idToken = await user.getIdToken(true);
      const result = await sendEmailCode(idToken);
      await loadRegistrationStatus(idToken);
      if (result.ok) {
        holdOnPageRef.current = false;
        setShowResend(false);
        setStatusText("Переход на подтверждение…");
        router.push(`${VERIFY_EMAIL_CODE_PATH}?from=register`);
      } else {
        setUserMessage(result.message);
      }
    } catch (e) {
      setUserMessage(firebaseAuthErrorMessage(e));
    } finally {
      setRetryingCode(false);
    }
  };

  const handleRegister = async () => {
    if (isSubmitting) return;
    holdOnPageRef.current = false;
    setStatusText("Создание аккаунта…");
    setUserMessage("");
    setShowResend(false);
    setDiag({
      account: "не создан",
      code: "не отправлено",
      telegram: "неизвестно",
      email: "ожидается",
      access: "заблокирован",
    });
    try {
      setIsSubmitting(true);
      registeringRef.current = true;

      console.log("[register] custom code flow start");
      console.log("[register] sendEmailVerification legacy flow disabled");
      console.log("[register] create user start");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log("[register] create user success");

      const user = userCredential.user;
      setStatusText("Аккаунт создан");
      setDiag((prev) => ({ ...prev, account: "создан" }));

      const now = new Date().toISOString();
      const sessionId = generateSessionId();
      const deviceId = getOrCreateDeviceId();
      setLocalSessionId(sessionId);
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

      await setDoc(
        doc(db, PRICING_FS.users, user.uid),
        {
          uid: user.uid,
          email: user.email,
          emailVerified: false,
          emailVerifiedByCode: false,
          registrationStage: "auth_created",
          emailCodeSentAt: null,
          emailCodeSendError: null,
          telegramNotifiedAt: null,
          telegramNotifyError: null,
          lastRegistrationError: null,
          createdAt: now,
          updatedAt: now,
          role: "user",
          blocked: false,
          plan: "trial",
          subscriptionStatus: "trial_pending",
          trialDays: 15,
          name: "",
          company: "",
          phone: "",
          telegram: "",
          whatsapp: "",
          avito: "",
          giftRouteMeters: 1,
          activeSessionId: sessionId,
          deviceId,
          lastLoginAt: now,
          lastLoginUserAgent: ua,
        },
        { merge: true }
      );

      await setDoc(doc(db, PRICING_FS.priceLists, user.uid), {
        standard_7_9: 5900,
        standard_12: 6900,
        standard_18: 7900,
        standard_24: 9500,
        standard_30: 10500,
        standard_36: 11500,

        existing_7_9: 6900,
        existing_12: 7900,
        existing_18: 8900,
        existing_24: 10500,
        existing_30: 11500,
        existing_36: 12500,

        route_7_9: 2000,
        route_12: 2200,
        route_18: 2200,
        route_24: 2700,
        route_30: 2700,
        route_36: 2900,

        baseArmConcreteSurcharge: 4000,
        extraHoleNormal: 1000,
        extraHoleArm: 5000,

        stroba_brick_small: 1000,
        stroba_brick_big: 1200,
        stroba_concrete_small: 1500,
        stroba_concrete_big: 1600,

        cable40: 600,
        cable16: 200,

        bracketsAndFasteners: 1000,
        dismantlingOldUnit: 3500,
        glassUnitWork: 1000,
        facadeTileCut: 1300,
        drainageToGutter: 200,
        drainPumpInstall: 3000,
        outdoorConnectionLadder: 500,
        floorCarryTools: 500,
        outdoorBlockCarry: 1000,

        updatedAt: new Date().toISOString(),
      });

      const idToken = await user.getIdToken(true);

      try {
        console.log("[register] telegram notify-registration start");
        const nr = await fetch("/api/auth/notify-registration", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        });
        if (!nr.ok) {
          const errBody = await nr.text().catch(() => "");
          console.warn("[register] notify-registration HTTP", nr.status, errBody.slice(0, 500));
        }
      } catch (e) {
        console.error("[register] notify-registration request failed", e);
      }

      const codeResult = await sendEmailCode(idToken);
      await loadRegistrationStatus(idToken);
      if (!codeResult.ok) {
        holdOnPageRef.current = true;
        setShowResend(true);
        setUserMessage(
          `${codeResult.message} Отправьте код повторно или проверьте настройки почты на сервере.`
        );
        return;
      }
      setStatusText("Переход на подтверждение…");
      router.push(`${VERIFY_EMAIL_CODE_PATH}?from=register`);
    } catch (error: unknown) {
      console.error("[register]", error);
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      setStatusText("Создание аккаунта не удалось");
      setUserMessage(
        (code ? `Ошибка регистрации [${code}]: ` : "Ошибка регистрации: ") + firebaseAuthErrorMessage(error)
      );
    } finally {
      registeringRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Регистрация</h1>

        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Введите email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          style={isSubmitting ? { ...inputStyle, ...inputDisabledStyle } : inputStyle}
        />

        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="Введите пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          style={isSubmitting ? { ...inputStyle, ...inputDisabledStyle } : inputStyle}
        />

        <button
          type="button"
          onClick={() => void handleRegister()}
          disabled={isSubmitting}
          style={{
            ...primaryButton,
            opacity: isSubmitting ? 0.6 : 1,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Создание аккаунта…" : "Создать аккаунт"}
        </button>

        {statusText ? <p style={statusStyle}>{statusText}</p> : null}
        {userMessage ? (
          <div style={errorBannerStyle}>
            {userMessage}
          </div>
        ) : null}
        {showResend ? (
          <button
            onClick={() => void retrySendCode()}
            disabled={retryingCode}
            style={{
              ...secondaryButton,
              opacity: retryingCode ? 0.55 : 1,
              cursor: retryingCode ? "not-allowed" : "pointer",
            }}
          >
            {retryingCode ? "Повторная отправка…" : "Отправить код повторно"}
          </button>
        ) : null}

        <div style={diagCardStyle}>
          <div style={diagTitleStyle}>Статус регистрации</div>
          <div style={diagRowStyle}>Аккаунт: {diag.account}</div>
          <div style={diagRowStyle}>Письмо с кодом: {diag.code}</div>
          <div style={diagRowStyle}>Telegram: {diag.telegram}</div>
          <div style={diagRowStyle}>Подтверждение email: {diag.email}</div>
          <div style={diagRowStyle}>Доступ в разделы: {diag.access}</div>
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f6f8",
  padding: "16px",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  background: "#fff",
  borderRadius: "18px",
  padding: "20px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "16px",
  fontSize: "28px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
  marginBottom: "12px",
  backgroundColor: "#ffffff",
  color: "#111827",
  caretColor: "#111827",
  opacity: 1,
  colorScheme: "light",
  // Снимает «серый» вид текста от Chrome/Safari autofill
  WebkitBoxShadow: "0 0 0 1000px #ffffff inset",
  WebkitTextFillColor: "#111827",
};

const inputDisabledStyle: React.CSSProperties = {
  opacity: 0.65,
  cursor: "not-allowed",
  backgroundColor: "#f3f4f6",
};

const primaryButton: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "15px",
  fontWeight: 700,
};

const secondaryButton: React.CSSProperties = {
  width: "100%",
  marginTop: "10px",
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
};

const statusStyle: React.CSSProperties = {
  marginTop: "14px",
  marginBottom: "8px",
  color: "#1f2937",
  fontSize: "14px",
};

const errorBannerStyle: React.CSSProperties = {
  marginTop: "8px",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: "14px",
  lineHeight: 1.4,
};

const diagCardStyle: React.CSSProperties = {
  marginTop: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "10px 12px",
  background: "#f9fafb",
  fontSize: "13px",
};

const diagTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: "6px",
  color: "#111827",
};

const diagRowStyle: React.CSSProperties = {
  color: "#374151",
  marginBottom: "3px",
};
