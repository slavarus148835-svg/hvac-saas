"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import { cabinetShowsBillingNavigation } from "@/lib/subscriptionVisibility";
import type { UserTrialFields } from "@/lib/trialSubscription";
import { withAuthGuard } from "@/lib/withAuthGuard";

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL || "https://t.me/karmaforce";

function NoAccessPage() {
  const router = useRouter();
  const [loadingUser, setLoadingUser] = useState(true);
  const [showCommerceCta, setShowCommerceCta] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (userFromObserver) => {
      setLoadingUser(true);
      try {
        const currentUser = await resolveAuthUser(userFromObserver);
        if (!currentUser) {
          setShowCommerceCta(false);
          return;
        }
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDocFromServer(userRef);
        if (!snap.exists()) {
          setShowCommerceCta(false);
          return;
        }
        const data = snap.data() as UserTrialFields;
        setShowCommerceCta(cabinetShowsBillingNavigation(data));
      } finally {
        setLoadingUser(false);
      }
    });
    return () => unsub();
  }, []);

  if (loadingUser) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>Загрузка…</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={badgeStyle}>Доступ ограничен</div>
        <h1 style={titleStyle}>Доступ ограничен</h1>
        {showCommerceCta ? (
          <p style={bodyStyle}>
            Сейчас можно снова открыть полный набор разделов — перейдите по кнопке ниже.
          </p>
        ) : (
          <p style={bodyStyle}>
            Вернитесь в кабинет или напишите в поддержку — подскажем, что делать дальше.
          </p>
        )}

        <div style={buttonsStyle}>
          {showCommerceCta ? (
            <button type="button" onClick={() => router.push("/billing")} style={primaryButtonStyle}>
              Оформить доступ
            </button>
          ) : null}

          <button type="button" onClick={() => router.push("/dashboard")} style={backButtonStyle}>
            В кабинет
          </button>

          <button
            type="button"
            onClick={() => window.open(SUPPORT_URL, "_blank")}
            style={secondaryButtonStyle}
          >
            Написать в Telegram
          </button>
        </div>
      </div>
    </div>
  );
}

export default withAuthGuard(NoAccessPage);

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6f8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "560px",
  background: "#ffffff",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#fff1f2",
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: 700,
  marginBottom: "12px",
};

const titleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: "12px",
  fontSize: "30px",
};

const bodyStyle: CSSProperties = {
  margin: "0 0 20px",
  color: "#4b5563",
  fontSize: "15px",
  lineHeight: 1.5,
};

const buttonsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const primaryButtonStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
};

const backButtonStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #111827",
  background: "#fff",
  color: "#111827",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
