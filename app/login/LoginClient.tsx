"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

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
            alert(
              "Не удалось войти через Telegram. Попробуйте ещё раз или используйте email."
            );
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

        <div style={fields}>
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
