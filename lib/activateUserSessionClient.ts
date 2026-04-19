import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateSessionId, getOrCreateDeviceId, setLocalSessionId } from "@/lib/deviceSession";

export async function activateUserSessionClient(uid: string): Promise<string> {
  const sessionId = generateSessionId();
  const deviceId = getOrCreateDeviceId();
  setLocalSessionId(sessionId);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  await setDoc(
    doc(db, "users", uid),
    {
      activeSessionId: sessionId,
      deviceId,
      lastLoginAt: new Date().toISOString(),
      lastLoginUserAgent: ua,
    },
    { merge: true }
  );
  return sessionId;
}
