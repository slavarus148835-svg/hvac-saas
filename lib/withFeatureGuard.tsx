"use client";

import { ComponentType, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Feature, hasAccess } from "@/lib/access";
import {
  isPaidActive,
  isTrialExpired,
  logTrialAccessDebug,
  type UserTrialFields,
} from "@/lib/trialSubscription";
import { needsEmailCodeVerification, VERIFY_EMAIL_PATH } from "@/lib/emailVerification";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

export function withFeatureGuard<P extends object>(
  WrappedComponent: ComponentType<P>,
  feature: Feature
) {
  return function ProtectedComponent(props: P) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [allowed, setAllowed] = useState(false);
    const initialGateRef = useRef(true);

    useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
        const showBlockingOverlay = initialGateRef.current;
        if (showBlockingOverlay) {
          setLoading(true);
          setAllowed(false);
        }
        try {
          const currentUser = await resolveAuthUser(userFromObserver);
          if (!currentUser) {
            router.replace(
              buildLoginRedirectUrl(
                typeof window !== "undefined" ? window.location.pathname : "/dashboard"
              )
            );
            return;
          }

          const userRef = doc(db, "users", currentUser.uid);
          const userSnap = await getDocFromServer(userRef);
          const profileData = userSnap.exists() ? userSnap.data() : null;

          if (needsEmailCodeVerification(currentUser, profileData)) {
            router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
            return;
          }

          if (!userSnap.exists()) {
            router.replace("/dashboard");
            return;
          }

          const userData = userSnap.data() as UserTrialFields;

          logTrialAccessDebug(userData, `withFeatureGuard:${feature}`);

          if (!hasAccess(userData, feature)) {
            if (isTrialExpired(userData) && !isPaidActive(userData)) {
              router.replace("/billing?reason=expired_trial");
            } else {
              router.replace("/no-access");
            }
            return;
          }

          setAllowed(true);
        } catch {
          router.replace("/dashboard");
        } finally {
          if (showBlockingOverlay) {
            setLoading(false);
            initialGateRef.current = false;
          }
        }
      });

      return () => unsubscribe();
    }, [router]);

    if (loading) {
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
          Проверка доступа...
        </div>
      );
    }

    if (!allowed) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f4f6f8",
            fontSize: "16px",
            color: "#4b5563",
          }}
        >
          Перенаправление…
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
}
