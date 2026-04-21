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
  getClientPublicAppBaseUrl,
} from "@/lib/emailVerification";
import { getSafePostLoginPath } from "@/lib/safeRedirect";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

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
  const [telegramClientError, setTelegramClientError] = useState(false);
  const [showAltEntry, setShowAltEntry] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const root = document.getElementById("login-telegram-login-widget");
    if (!root) return;
    root.innerHTML = "";
    const bot = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "hvac_cash_bot").trim();
    const nextSafe = getSafePostLoginPath(searchParams.get("next"));
    const authUrl = `${getClientPublicAppBaseUrl()}/api/auth/telegram?next=${encodeURIComponent(
      nextSafe
    )}`;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", authUrl);
    script.setAttribute("data-request-access", "write");
    root.appendChild(script);
    return () => {
      root.innerHTML = "";
    };
  }, [searchParams]);

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
      if (typeof window !== "undefined") {
        const hash = window.location.hash || "";
        const m = /^#tg_token=(.+)$/.exec(hash);
        if (m?.[1]) {
          const token = decodeURIComponent(m[1]);
          const bare = window.location.pathname + window.location.search;
          window.history.replaceState(null, "", bare);
          try {
            const cred = await signInWithCustomToken(auth, token);
            if (cancelled) return;
            await reload(cred.user);
            const u = auth.currentUser ?? cred.user;
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
            return;
          } catch (error: unknown) {
            console.error("[login] telegram custom token sign-in failed", error);
            setTelegramClientError(true);
            setShowAltEntry(true);
          }
        }
      }

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

  const handleLogin = async () => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await reload(cred.user);
      const user = auth.currentUser ?? cred.user;
      await syncUserAuthMirrorToFirestore(user);
      await activateUserSessionClient(user.uid);
      await notifyLeadCompleted(user);
      const snap = await getDocFromServer(doc(db, "users", user.uid));
      const profile = snap.exists() ? snap.data() : null;
      if (needsEmailCodeVerification(user, profile)) {
        router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
      } else {
        const next = getSafePostLoginPath(searchParams.get("next"));
        router.replace(next);
      }
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
          <div id="login-telegram-login-widget" style={telegramWidgetHostStyle} />
        </div>

        {telegramClientError ? (
          <div style={{ ...altRecoveryCardStyle, marginBottom: 14 }}>
            <div style={altRecoveryTitleStyle}>Не удалось войти через Telegram</div>
            <Link href="/register#email-register-block" style={altRecoveryLinkStyle}>
              Получить код на email
            </Link>
          </div>
        ) : null}

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

const telegramWidgetHostStyle: CSSProperties = {
  minHeight: "44px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
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
