"use client";

import { ComponentType, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import {
  needsEmailCodeVerification,
  VERIFY_EMAIL_PATH,
} from "@/lib/emailVerification";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";

/**
 * Только авторизация + подтверждение email (без проверки уровня доступа к разделам).
 */
export function withAuthGuard<P extends object>(
  WrappedComponent: ComponentType<P>
) {
  return function AuthGuarded(props: P) {
    const router = useRouter();
    const pathname = usePathname();
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
      let cancelled = false;
      let unsub: (() => void) | undefined;

      void auth.authStateReady().then(() => {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, async (userFromObserver) => {
          if (cancelled) return;
          const user = await resolveAuthUser(userFromObserver);
          if (cancelled) return;

          if (!user) {
            router.replace(buildLoginRedirectUrl(pathname || "/dashboard"));
            return;
          }

          const snap = await getDocFromServer(doc(db, "users", user.uid));
          const profile = snap.exists() ? snap.data() : null;
          if (needsEmailCodeVerification(user, profile)) {
            router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
            return;
          }

          setAllowed(true);
        });
      });

      return () => {
        cancelled = true;
        unsub?.();
      };
    }, [router, pathname]);

    if (!allowed) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f4f6f8",
            fontSize: "18px",
          }}
        >
          Проверка доступа…
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
}
