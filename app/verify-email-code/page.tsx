"use client";

import type { ClipboardEvent, CSSProperties, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import {
  SESSION_EMAIL_JUST_VERIFIED_KEY,
  firebaseAuthErrorMessageWithCode,
  needsEmailCodeVerification,
  recordVerificationEmailSentAtNow,
  getVerificationResendCooldownLeftSec,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC,
} from "@/lib/emailVerification";
import { doc, getDocFromServer } from "firebase/firestore";
import { getSafePostLoginPath } from "@/lib/safeRedirect";
import { formatSendEmailCodeApiError } from "@/lib/sendEmailCodeClientMessages";

const TEMP_OVERLOAD_MESSAGE = "Сервис временно недоступен. Попробуйте ещё раз через 30–60 секунд.";

function isHtmlPayload(contentType: string, body: string) {
  const ctype = String(contentType || "").toLowerCase();
  const trimmed = String(body || "").trim().toLowerCase();
  return (
    ctype.includes("text/html") ||
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html")
  );
}

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default function VerifyEmailCodePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [statusLabel, setStatusLabel] = useState("код еще не отправлен");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [registrationStatus, setRegistrationStatus] = useState<{
    account: string;
    code: string;
    telegram: string;
    email: string;
    access: string;
  }>({
    account: "неизвестно",
    code: "неизвестно",
    telegram: "неизвестно",
    email: "ожидается",
    access: "заблокирован",
  });
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    console.log("[verify-email-code] screen mounted");
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      await auth.authStateReady();
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, async (userFromObserver) => {
        const user = await resolveAuthUser(userFromObserver);
        if (cancelled) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        const snap = await getDocFromServer(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : null;
        if (!needsEmailCodeVerification(user, data)) {
          sessionStorage.setItem(SESSION_EMAIL_JUST_VERIFIED_KEY, "1");
          router.replace(getSafePostLoginPath("/dashboard"));
          return;
        }
        setEmail(user.email ?? null);
        setCooldownLeft(getVerificationResendCooldownLeftSec());
        const idToken = await user.getIdToken(true);
        await loadRegistrationStatus(idToken);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      setCooldownLeft(getVerificationResendCooldownLeftSec());
    }, 1000);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "access_blocked") {
      setStatus({
        kind: "err",
        text: "Доступ закрыт, пока вы не подтвердите email кодом.",
      });
    }
  }, []);

  const loadRegistrationStatus = async (idToken: string) => {
    console.log("[register] api request start: /api/auth/registration-status");
    const res = await fetch("/api/auth/registration-status", {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    const body = await res.text();
    const contentType = res.headers.get("content-type") || "";
    console.log("[register] api response content-type:", contentType);
    if (isHtmlPayload(contentType, body)) {
      console.warn("[register] unexpected HTML response from API");
      return;
    }
    console.log("[registration-status] loaded", res.status, body.slice(0, 1000));
    let j: Record<string, unknown> = {};
    try {
      j = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      console.log("[register] api failed", res.status);
      return;
    }
    console.log("[register] api success");
    const stage = String(j.registrationStage || "");
    const sentAt = Boolean(j.emailCodeSentAt);
    const hasCode = Boolean(j.hasActiveCode);
    const telegramRaw = String(j.telegramNotificationStatus || "unknown");
    const telegramText =
      telegramRaw === "sent"
        ? "отправлено"
        : telegramRaw === "failed"
          ? "ошибка"
          : "неизвестно";
    const emailVerified = Boolean(
      j.emailVerificationSatisfied ?? j.emailVerifiedByCode
    );
    let codeLine = "не отправлено";
    if (emailVerified) {
      codeLine = "выполнено";
    } else if (stage === "code_send_failed" || j.emailCodeSendError) {
      codeLine = "ошибка";
    } else if (hasCode || sentAt || stage === "code_sent") {
      codeLine = "отправлено";
    }
    setRegistrationStatus({
      account: Boolean(j.authUserExists) ? "создан" : "не создан",
      code: codeLine,
      telegram: telegramText,
      email: emailVerified ? "выполнено" : "ожидается",
      access: emailVerified ? "разрешен" : "заблокирован",
    });
    if (emailVerified) {
      setStatusLabel("код подтвержден");
    } else if (codeLine === "отправлено") {
      setStatusLabel("код отправлен");
    } else if (codeLine === "ошибка") {
      setStatusLabel("ошибка отправки кода");
    } else {
      setStatusLabel("код еще не отправлен");
    }
  };

  const handleDigit = (index: number, value: string) => {
    const d = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = d;
    setDigits(next);
    if (d && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (t.length === 6) {
      e.preventDefault();
      setDigits(t.split(""));
      inputsRef.current[5]?.focus();
    }
  };

  const submit = async () => {
    const code = digits.join("");
    if (code.length !== 6) {
      setStatus({ kind: "err", text: "Введите все 6 цифр" });
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    setBusy(true);
    console.log("[verify-email-code] verify start");
    setStatusLabel("идет проверка кода");
    setStatus({ kind: "idle", text: "" });
    try {
      const idToken = await user.getIdToken(true);
      const verifyWithRetry = async (allowRetry: boolean) => {
        console.log("[register] api request start: /api/auth/verify-email-code");
        const res = await fetch("/api/auth/verify-email-code", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        });
        const raw = await res.text();
        const contentType = res.headers.get("content-type") || "";
        console.log("[register] api response content-type:", contentType);
        if (isHtmlPayload(contentType, raw)) {
          console.warn("[register] unexpected HTML response from API");
          if (allowRetry) {
            console.log("[register] retry request");
            await waitMs(2500);
            return verifyWithRetry(false);
          }
          return { html: true as const, res, raw };
        }
        return { html: false as const, res, raw };
      };

      const verifyResult = await verifyWithRetry(true);
      if (verifyResult.html) {
        setStatusLabel("небольшая задержка сервера");
        setStatus({ kind: "err", text: TEMP_OVERLOAD_MESSAGE });
        console.log("[register] api failed");
        return;
      }
      const { res, raw } = verifyResult;
      let j: { ok?: boolean; error?: string } = {};
      try {
        j = JSON.parse(raw) as { ok?: boolean; error?: string };
      } catch {
        /* ignore */
      }
      if (!res.ok || !j.ok) {
        console.log("[register] api failed", res.status);
        console.log("[verify-email-code] verify fail", res.status, raw.slice(0, 500));
        const map: Record<string, string> = {
          wrong_code: "Неверный код",
          expired: "Код истёк — запросите новый",
          too_many_attempts: "Слишком много попыток — запросите новый код",
          no_code: "Код не найден — нажмите «Отправить код»",
          code_used: "Код уже использован",
        };
        const msg = map[j.error || ""] || j.error || raw.slice(0, 200);
        if (j.error === "wrong_code") setStatusLabel("код неверный");
        else if (j.error === "expired") setStatusLabel("код истек");
        else if (j.error === "too_many_attempts") setStatusLabel("превышен лимит попыток");
        setStatus({ kind: "err", text: msg });
        await loadRegistrationStatus(idToken);
        return;
      }
      const idTokenAfterVerify = await user.getIdToken(true);
      console.log("[register] api success");
      console.log("[verify-email-code] verify success");
      sessionStorage.setItem(SESSION_EMAIL_JUST_VERIFIED_KEY, "1");
      setStatusLabel("код подтвержден");
      setStatus({ kind: "ok", text: "Готово. Переходим в кабинет…" });
      await loadRegistrationStatus(idTokenAfterVerify);
      router.replace(getSafePostLoginPath("/dashboard"));
    } catch (e) {
      console.log("[verify-email-code] verify fail", e);
      setStatus({ kind: "err", text: firebaseAuthErrorMessageWithCode(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendBusy || cooldownLeft > 0) return;
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    setResendBusy(true);
    setStatusLabel("отправка кода...");
    setStatus({ kind: "idle", text: "" });
    try {
      const idToken = await user.getIdToken(true);
      console.log("[verify-email-code] resend code start");
      const sendWithRetry = async (allowRetry: boolean) => {
        console.log("[register] api request start: /api/auth/send-email-code");
        const res = await fetch("/api/auth/send-email-code", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const raw = await res.text();
        const contentType = res.headers.get("content-type") || "";
        console.log("[register] api response content-type:", contentType);
        if (isHtmlPayload(contentType, raw)) {
          console.warn("[register] unexpected HTML response from API");
          if (allowRetry) {
            console.log("[register] retry request");
            await waitMs(2500);
            return sendWithRetry(false);
          }
          return { html: true as const, res, raw };
        }
        return { html: false as const, res, raw };
      };

      const sendResult = await sendWithRetry(true);
      if (sendResult.html) {
        setStatus({ kind: "err", text: TEMP_OVERLOAD_MESSAGE });
        setStatusLabel("небольшая задержка сервера");
        console.log("[register] api failed");
        return;
      }
      const { res, raw } = sendResult;
      console.log("[verify-email-code] send code response status", res.status);
      console.log("[verify-email-code] send code response body", raw.slice(0, 2000));
      if (res.status === 429) {
        console.log("[register] api failed", res.status);
        try {
          const j = JSON.parse(raw) as {
            error?: string;
            retryAfterSec?: number;
          };
          setStatus({
            kind: "err",
            text: formatSendEmailCodeApiError({
              error: j.error || "rate_limited",
              retryAfterSec: j.retryAfterSec,
            }),
          });
          setStatusLabel(`повторная отправка будет доступна через ${j.retryAfterSec ?? 60} сек`);
        } catch {
          setStatus({
            kind: "err",
            text: formatSendEmailCodeApiError({ error: "rate_limited" }),
          });
        }
        await loadRegistrationStatus(idToken);
        console.log("[verify-email-code] resend code fail (rate limit)");
        return;
      }
      if (!res.ok) {
        console.log("[register] api failed", res.status);
        let parsed: { error?: string; detail?: string; retryAfterSec?: number } = {};
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          /* ignore */
        }
        setStatus({
          kind: "err",
          text: formatSendEmailCodeApiError(parsed),
        });
        setStatusLabel("ошибка отправки кода");
        await loadRegistrationStatus(idToken);
        console.log("[verify-email-code] resend code fail", res.status);
        return;
      }
      console.log("[register] api success");
      console.log("[verify-email-code] resend code success");
      recordVerificationEmailSentAtNow();
      setCooldownLeft(EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC);
      setStatusLabel("код отправлен");
      setStatus({ kind: "ok", text: "Код отправлен на почту" });
      await loadRegistrationStatus(idToken);
    } catch (e) {
      console.log("[verify-email-code] resend code fail", e);
      setStatus({ kind: "err", text: firebaseAuthErrorMessageWithCode(e) });
      setStatusLabel("ошибка отправки кода");
    } finally {
      setResendBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={muted}>Загрузка…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Введите код подтверждения</h1>
        <p style={lead}>
          Мы отправили 6-значный код на адрес{" "}
          <strong style={{ wordBreak: "break-all" }}>{email || "—"}</strong>
        </p>
        <p style={stepStyle}>Статус: {statusLabel}</p>
        {cooldownLeft > 0 ? (
          <p style={cooldownStyle}>
            Повторная отправка будет доступна через {cooldownLeft} сек
          </p>
        ) : null}

        <div style={diagCardStyle}>
          <div style={diagTitleStyle}>Статус регистрации</div>
          <div style={diagRowStyle}>Аккаунт: {registrationStatus.account}</div>
          <div style={diagRowStyle}>Письмо с кодом: {registrationStatus.code}</div>
          <div style={diagRowStyle}>Telegram: {registrationStatus.telegram}</div>
          <div style={diagRowStyle}>Подтверждение email: {registrationStatus.email}</div>
          <div style={diagRowStyle}>Доступ в разделы: {registrationStatus.access}</div>
        </div>

        <div style={row} onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={digitInput}
            />
          ))}
        </div>

        {status.text ? (
          <div
            style={{
              ...banner,
              background: status.kind === "err" ? "#fef2f2" : "#ecfdf5",
              borderColor: status.kind === "err" ? "#fecaca" : "#bbf7d0",
              color: status.kind === "err" ? "#991b1b" : "#166534",
            }}
          >
            {status.text}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          style={{
            ...primaryBtn,
            opacity: busy ? 0.55 : 1,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Проверка…" : "Подтвердить код"}
        </button>

        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resendBusy || cooldownLeft > 0}
          style={{
            ...secondaryBtn,
            opacity: resendBusy || cooldownLeft > 0 ? 0.55 : 1,
          }}
        >
          {resendBusy
            ? "Отправка…"
            : cooldownLeft > 0
              ? `Отправить код повторно через ${cooldownLeft} с`
              : "Отправить код повторно"}
        </button>

        <button type="button" onClick={() => void handleLogout()} style={ghostBtn}>
          Выйти
        </button>

        <p style={hint}>
          Код действует 10 минут. Не пришло письмо — проверьте «Спам».
        </p>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f6f8",
  padding: "16px",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "480px",
  background: "#fff",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const titleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "12px",
  fontSize: "26px",
};

const lead: CSSProperties = {
  fontSize: "15px",
  lineHeight: 1.55,
  color: "#374151",
  marginBottom: "8px",
};

const stepStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "6px",
  fontSize: "14px",
  color: "#1f2937",
};

const cooldownStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "10px",
  fontSize: "13px",
  color: "#b45309",
};

const diagCardStyle: CSSProperties = {
  marginBottom: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "10px 12px",
  background: "#f9fafb",
  fontSize: "13px",
};

const diagTitleStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: "6px",
  color: "#111827",
};

const diagRowStyle: CSSProperties = {
  color: "#374151",
  marginBottom: "3px",
};

const row: CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "center",
  marginBottom: "16px",
};

const digitInput: CSSProperties = {
  width: "44px",
  height: "48px",
  textAlign: "center",
  fontSize: "20px",
  fontWeight: 700,
  borderRadius: "12px",
  border: "1px solid #d1d5db",
};

const banner: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid",
  fontSize: "14px",
  marginBottom: "12px",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "15px",
  fontWeight: 700,
  marginBottom: "10px",
};

const secondaryBtn: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "8px",
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  width: "100%",
  padding: "10px",
  border: "none",
  background: "transparent",
  color: "#6b7280",
  fontSize: "14px",
  cursor: "pointer",
};

const hint: CSSProperties = {
  marginTop: "16px",
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: 1.45,
};

const muted: CSSProperties = { fontSize: "14px", color: "#6b7280" };
