import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return null;
  try {
    return JSON.parse(String(raw)) as ServiceAccount;
  } catch (e) {
    console.error(
      "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON",
      e
    );
    return null;
  }
}

export function getAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }
  const sa = parseServiceAccount();
  if (!sa) return null;
  return initializeApp({
    credential: cert(sa),
  });
}

export function getAdminDb(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app);
}
