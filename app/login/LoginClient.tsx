"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  reload,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { activateUserSessionClient } from "@/lib/activateUserSessionClient";
import {
  VERIFY_EMAIL_PATH,
  needsEmailCodeVerification,
  firebaseAuthErrorMessage,
  syncUserAuthMirrorToFirestore,
} from "@/lib/emailVerification";
import { getSafePostLoginPath } from "@/lib/safeRedirect";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

const TG_SESSION_STORAGE_KEY = "tg_login_session_id";
const TG_SESSION_EXPIRES_STORAGE_KEY = "tg_login_session_expires_ms";

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 14px",
  marginBottom: 0,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 16,
  background: "#fff",
  color: "#111827",
};

async function notifyLeadCompleted(user: User) {
  try {
    const idToken = await user.getIdToken(true);
    await fetch("/api/auth/complete-lead", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (e) {
    console.warn("[login] complete-lead failed", e);
  }
}

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showAltEntry, setShowAltEntry] = useState(false);
  const [tgSessionId, setTgSessionId] = useState("");
  const [tgExpiresAtMs, setTgExpiresAtMs] = useState(0);
  const [tgWaiting, setTgWaiting] = useState(false);
  const [tgStatusText, setTgStatusText] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const finishSignedInUser = async (user: User) => {
    await reload(user);
    const u = auth.currentUser ?? user;
    await syncUserAuthMirrorToFirestore(u);
    await activateUserSessionClient(u.uid);
    await notifyLeadCompleted(u);
    const snap = await getDocFromServer(doc(db, "users", u.uid));
    const profile = snap.exists() ? snap.data() : null;
    if (needsEmailCodeVerification(u, profile)) {
      router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
      return;
    }
    router.replace(getSafePostLoginPath(searchParams.get("next")));
  };

  const openTelegramBotLogin = async () => {
    try {
      setTgWaiting(true);
      setTgStatusText("Открываем Telegram...");
      const res = await fetch("/api/auth/telegram-session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
        botUrl?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId || !data.botUrl || !data.expiresAt) {
        setTgWaiting(false);
        setTgStatusText("Не удалось создать сессию входа через Telegram.");
        return;
      }
      const popup = window.open(data.botUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        window.location.href = data.botUrl;
      }
      console.log("[login] telegram session created", { sessionId: data.sessionId });
      setTgSessionId(data.sessionId);
      const expiresMs = Date.parse(data.expiresAt);
      setTgExpiresAtMs(expiresMs);
      try {
        localStorage.setItem(TG_SESSION_STORAGE_KEY, data.sessionId);
        localStorage.setItem(TG_SESSION_EXPIRES_STORAGE_KEY, String(expiresMs));
      } catch {
        /* ignore */
      }
      setTgStatusText("Ожидаем подтверждение в Telegram...");
    } catch (e) {
      console.error("[login] openTelegramBotLogin failed", e);
      setTgWaiting(false);
      setTgStatusText("Не удалось открыть Telegram. Попробуйте снова.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      if (auth.currentUser) return;
      setShowAltEntry(true);
    }, 10_000);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        window.clearTimeout(t);
        setShowAltEntry(false);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
        const currentUser = await resolveAuthUser(userFromObserver);
        if (cancelled || !currentUser) return;
        const snap = await getDocFromServer(doc(db, "users", currentUser.uid));
        const profile = snap.exists() ? snap.data() : null;
        if (needsEmailCodeVerification(currentUser, profile)) {
          router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
          return;
        }
        router.replace(getSafePostLoginPath(searchParams.get("next")));
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (tgWaiting || tgSessionId) return;
    const sid = String(localStorage.getItem(TG_SESSION_STORAGE_KEY) || "").trim();
    const exp = Number(localStorage.getItem(TG_SESSION_EXPIRES_STORAGE_KEY) || 0);
    if (!sid || !exp || exp <= Date.now()) return;
    setTgSessionId(sid);
    setTgExpiresAtMs(exp);
    setTgWaiting(true);
    setTgStatusText("Ожидаем подтверждение в Telegram...");
  }, [tgWaiting, tgSessionId]);

  useEffect(() => {
    if (!tgWaiting || !tgSessionId) return;
    let stopped = false;
    const interval = window.setInterval(() => {
      void pollOnce();
    }, 1500);

    const pollOnce = async () => {
      if (stopped) return;
      if (tgExpiresAtMs > 0 && Date.now() >= tgExpiresAtMs) {
        try {
          localStorage.removeItem(TG_SESSION_STORAGE_KEY);
          localStorage.removeItem(TG_SESSION_EXPIRES_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setTgWaiting(false);
        setTgStatusText("Время ожидания истекло. Попробуйте снова.");
        return;
      }
      try {
        console.log("[login] telegram session poll", { sessionId: tgSessionId });
        const res = await fetch(
          `/api/auth/telegram-session/status?sessionId=${encodeURIComponent(tgSessionId)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          status?: "pending" | "confirmed" | "expired" | "error";
          canCompleteLogin?: boolean;
          customToken?: string;
        };
        if (data.status === "expired") {
          try {
            localStorage.removeItem(TG_SESSION_STORAGE_KEY);
            localStorage.removeItem(TG_SESSION_EXPIRES_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          setTgWaiting(false);
          setTgStatusText("Время ожидания истекло. Попробуйте снова.");
          return;
        }
        if (data.status === "confirmed" && data.canCompleteLogin && data.customToken) {
          setTgStatusText("Подтверждено. Выполняем вход...");
          const cred = await signInWithCustomToken(auth, data.customToken);
          await fetch("/api/auth/telegram-session/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: tgSessionId }),
          }).catch(() => null);
          await finishSignedInUser(cred.user);
          try {
            localStorage.removeItem(TG_SESSION_STORAGE_KEY);
            localStorage.removeItem(TG_SESSION_EXPIRES_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          setTgWaiting(false);
          return;
        }
      } catch (e) {
        console.error("[login] telegram session poll failed", e);
      }
    };
    void pollOnce();
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [tgSessionId, tgWaiting, tgExpiresAtMs, router, searchParams]);

  const handleLogin = async () => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await finishSignedInUser(cred.user);
    } catch (error: unknown) {
      alert("Ошибка входа: " + firebaseAuthErrorMessage(error));
    }
  };

  return (
    <div style={pageWrap}>
      <div style={card}>
        <h1 style={title}>Вход</h1>

        <div id="telegram-login-section" style={telegramBlockStyle}>
          <div style={telegramTitleStyle}>Вход через Telegram</div>
          <div style={telegramStepsStyle}>
            1. Нажмите кнопку ниже
            <br />
            2. В Telegram нажмите Start
            <br />
            3. Вернитесь на сайт - вход завершится автоматически
          </div>
          <button
            type="button"
            onClick={() => void openTelegramBotLogin()}
            style={{
              ...submitBtn,
              marginBottom: 0,
              opacity: tgWaiting ? 0.7 : 1,
            }}
            disabled={tgWaiting}
          >
            Войти через Telegram
          </button>
          {tgStatusText ? <div style={telegramStatusStyle}>{tgStatusText}</div> : null}
          <div style={telegramOrStyle}>или войдите по email</div>
        </div>

        <div id="email-login-block" style={fields}>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />

          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        {showAltEntry ? (
          <div style={{ ...altRecoveryCardStyle, marginBottom: 14 }}>
            <div style={altRecoveryHintStyle}>Другой способ входа</div>
            <button
              type="button"
              onClick={() =>
                document.getElementById("telegram-login-section")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              style={altSecondaryBtn}
            >
              Войти через Telegram
            </button>
            <Link href="/register#email-register-block" style={{ ...altSecondaryBtn, marginTop: 8 }}>
              Получить код на email
            </Link>
          </div>
        ) : null}

        <div style={linksRow}>
          <Link href="/register" style={linkPrimary}>
            Регистрация
          </Link>
          <Link href="/reset-password" style={linkMuted}>
            Забыли пароль?
          </Link>
        </div>

        <button type="button" onClick={() => void handleLogin()} style={submitBtn}>
          Войти
        </button>

        <Link href="/" style={homeSecondary}>
          На главную
        </Link>
      </div>
    </div>
  );
}

const pageWrap: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px 16px",
  background: "#f4f6f8",
  boxSizing: "border-box",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 20,
  padding: "28px 22px",
  boxShadow: "0 10px 40px rgba(0,0,0,0.06)",
  border: "1px solid #eef0f3",
  boxSizing: "border-box",
};

const title: CSSProperties = {
  marginTop: 0,
  marginBottom: "22px",
  fontSize: 26,
  textAlign: "center",
  letterSpacing: "-0.02em",
};

const telegramBlockStyle: CSSProperties = {
  marginBottom: "18px",
  paddingBottom: "16px",
  borderBottom: "1px solid #eef0f3",
};

const telegramTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#111827",
  marginBottom: "10px",
  textAlign: "center",
};

const telegramStepsStyle: CSSProperties = {
  fontSize: "14px",
  lineHeight: 1.45,
  color: "#374151",
  marginBottom: "12px",
};

const telegramStatusStyle: CSSProperties = {
  marginTop: "10px",
  fontSize: "13px",
  color: "#1f2937",
};

const telegramOrStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "13px",
  color: "#6b7280",
  textAlign: "center",
};

const fields: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginBottom: 16,
};

const linksRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 20,
};

const linkPrimary: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#111827",
  textDecoration: "none",
};

const linkMuted: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#2563eb",
  textDecoration: "none",
};

const submitBtn: CSSProperties = {
  width: "100%",
  padding: "15px 18px",
  borderRadius: 14,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  marginBottom: 14,
};

const homeSecondary: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  boxSizing: "border-box",
};

const altRecoveryCardStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
};

const altRecoveryTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#111827",
  marginBottom: "10px",
};

const altRecoveryHintStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "10px",
};

const altRecoveryLinkStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "10px 14px",
  borderRadius: "12px",
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
  boxSizing: "border-box",
};

const altSecondaryBtn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "10px 14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  boxSizing: "border-box",
  cursor: "pointer",
  fontFamily: "inherit",
};
