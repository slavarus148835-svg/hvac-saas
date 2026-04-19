import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase Auth — Authorized domains (Authentication → Settings):
 * обязательно: hvac-saas-lovat.vercel.app
 * также: localhost (dev), 127.0.0.1, и URL вида *.vercel.app для preview-деплоев.
 *
 * NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN должен быть из консоли Firebase
 * (обычно {projectId}.firebaseapp.com), не хост Vercel.
 */
const DEV_FALLBACK: FirebaseOptions = {
  apiKey: "AIzaSyBTw6YsO2QuYxaqbPjtg-Jnws2zM85_i6g",
  authDomain: "hvac-saas-aab5a.firebaseapp.com",
  projectId: "hvac-saas-aab5a",
  storageBucket: "hvac-saas-aab5a.firebasestorage.app",
  messagingSenderId: "158504798622",
  appId: "1:158504798622:web:0212082035ad7da1be2e8f",
};

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t.length ? t : undefined;
}

function looksLikeVercelOrSiteHost(host: string): boolean {
  return /\.vercel\.app$/i.test(host) || host === "localhost" || host === "127.0.0.1";
}

function buildFirebaseWebConfig(): FirebaseOptions {
  const apiKey = trimEnv("NEXT_PUBLIC_FIREBASE_API_KEY") ?? DEV_FALLBACK.apiKey;
  const rawAuthDomain = trimEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  const projectId =
    trimEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ?? DEV_FALLBACK.projectId!;
  const storageBucket =
    trimEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") ?? DEV_FALLBACK.storageBucket;
  const messagingSenderId =
    trimEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ??
    DEV_FALLBACK.messagingSenderId;
  const appId = trimEnv("NEXT_PUBLIC_FIREBASE_APP_ID") ?? DEV_FALLBACK.appId;

  let authDomain = rawAuthDomain ?? `${projectId}.firebaseapp.com`;
  if (rawAuthDomain) {
    const hostOnly = rawAuthDomain.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
    if (hostOnly && looksLikeVercelOrSiteHost(hostOnly)) {
      if (typeof window !== "undefined") {
        console.warn(
          "[Firebase] NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN похож на хост приложения, не Firebase. Используется",
          `${projectId}.firebaseapp.com`
        );
      }
      authDomain = `${projectId}.firebaseapp.com`;
    }
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

const firebaseConfig = buildFirebaseWebConfig();

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function initClientAuth() {
  if (typeof window === "undefined") {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    const a = getAuth(app);
    void setPersistence(a, browserLocalPersistence);
    return a;
  }
}

export const auth = initClientAuth();
auth.languageCode = "ru";

export const db = getFirestore(app);
