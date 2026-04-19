"use client";

import { useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getLocalSessionId, setLocalSessionId } from "@/lib/deviceSession";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

export function SessionMonitor() {
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (raw) => {
      const user = await resolveAuthUser(raw);
      if (cancelled || !user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      if (cancelled || !snap.exists()) return;
      const remote = String((snap.data() as { activeSessionId?: string }).activeSessionId || "");
      if (!remote) return;
      const local = getLocalSessionId();
      if (!local) {
        setLocalSessionId(remote);
        return;
      }
      if (local !== remote) {
        await signOut(auth);
        alert("Вход выполнен на другом устройстве");
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return null;
}
