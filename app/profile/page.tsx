"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDocFromServer, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { withFeatureGuard } from "@/lib/withFeatureGuard";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import {
  cabinetBillingPrimaryCtaLabel,
  cabinetProfileStatusTitle,
  cabinetProfileStatusValue,
  cabinetShowsBillingNavigation,
  cabinetShowsPaidAccessUntilRow,
  cabinetShowsPaidNearExpirySoftBlock,
  cabinetShowsTrialEndDateRow,
  cabinetShowsTrialNearExpirySoftBlock,
  getCabinetSubscriptionUiState,
} from "@/lib/subscriptionVisibility";
import {
  firestoreTimeToMs,
  isPaidActive,
  isTrialPending,
  isTrialRunning,
  paidDaysRemainingWhileActive,
  trialDaysRemaining,
  trialEndsMs,
  type UserTrialFields,
} from "@/lib/trialSubscription";

type ProfileData = UserTrialFields & {
  email?: string;
  name?: string;
  phone?: string;
};

function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
      const currentUser = await resolveAuthUser(userFromObserver);
      if (!currentUser) {
        router.replace(buildLoginRedirectUrl("/profile"));
        return;
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDocFromServer(userRef);

        if (!userSnap.exists()) {
          router.push("/dashboard");
          return;
        }

        setData(userSnap.data() as ProfileData);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!data) return;
    setName(typeof data.name === "string" ? data.name : "");
    setPhone(typeof data.phone === "string" ? data.phone : "");
  }, [data]);

  const handleSaveProfile = async () => {
    const u = auth.currentUser;
    if (!u) {
      alert("Войдите снова.");
      return;
    }
    setSavingProfile(true);
    try {
      await setDoc(
        doc(db, "users", u.uid),
        {
          name: name.trim(),
          phone: phone.trim(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setData((prev) =>
        prev ? { ...prev, name: name.trim(), phone: phone.trim() } : prev
      );
    } catch (e) {
      console.error("[profile] save", e);
      alert("Не удалось сохранить. Проверьте соединение и правила Firestore.");
    } finally {
      setSavingProfile(false);
    }
  };

  const uiState = useMemo(() => getCabinetSubscriptionUiState(data), [data]);
  const salesActive = useMemo(() => cabinetShowsBillingNavigation(data), [data]);
  const trialNearSoft = useMemo(() => cabinetShowsTrialNearExpirySoftBlock(data), [data]);
  const paidNearSoft = useMemo(() => cabinetShowsPaidNearExpirySoftBlock(data), [data]);
  const paid = data ? isPaidActive(data) : false;
  const pending = data ? isTrialPending(data) : false;
  const running = data ? isTrialRunning(data) : false;
  const left = data ? trialDaysRemaining(data) : null;
  const paidLeft = data ? paidDaysRemainingWhileActive(data) : null;
  const trialEndLabel =
    data && trialEndsMs(data) > 0 ? new Date(trialEndsMs(data)).toLocaleString("ru-RU") : null;

  if (loading) {
    return <div style={loadingStyle}>Загрузка профиля...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Профиль</h1>

        <div style={profileEditSectionStyle}>
          <div style={profileFieldStyle}>
            <label style={profileLabelStyle} htmlFor="profile-name">
              Имя
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться"
              style={profileInputStyle}
              autoComplete="name"
            />
          </div>
          <div style={profileFieldStyle}>
            <label style={profileLabelStyle} htmlFor="profile-phone">
              Телефон
            </label>
            <input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 …"
              style={profileInputStyle}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <button
            type="button"
            disabled={savingProfile}
            onClick={() => void handleSaveProfile()}
            style={{
              ...primaryButtonStyle,
              width: "100%",
              opacity: savingProfile ? 0.65 : 1,
              cursor: savingProfile ? "not-allowed" : "pointer",
            }}
          >
            {savingProfile ? "Сохранение…" : "Сохранить"}
          </button>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>{cabinetProfileStatusTitle(uiState)}</span>
          <span style={valueStyle}>{cabinetProfileStatusValue(uiState)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Срок</span>
          <span style={valueStyle}>
            {pending
              ? "Начнётся с первого сохранённого расчёта"
              : running && trialNearSoft && left !== null
                ? `Осталось ${left} ${left === 1 ? "день" : left < 5 ? "дня" : "дней"} до паузы в доступе`
                : paid && paidNearSoft && paidLeft !== null
                  ? `Осталось ${paidLeft} ${paidLeft === 1 ? "день" : paidLeft < 5 ? "дня" : "дней"} до обновления срока`
                  : running || paid
                    ? "Инструменты открыты"
                    : "—"}
          </span>
        </div>
        {data && cabinetShowsTrialEndDateRow(data) && trialEndLabel ? (
          <div style={rowStyle}>
            <span style={labelStyle}>Действует до</span>
            <span style={valueStyle}>{trialEndLabel}</span>
          </div>
        ) : null}
        {data && cabinetShowsPaidAccessUntilRow(data) && firestoreTimeToMs(data.paidUntil) > 0 ? (
          <div style={rowStyle}>
            <span style={labelStyle}>Действует до</span>
            <span style={valueStyle}>
              {new Date(firestoreTimeToMs(data.paidUntil)).toLocaleString("ru-RU")}
            </span>
          </div>
        ) : null}
        <div
          style={{
            ...buttonRow,
            gridTemplateColumns: salesActive ? "1fr 1fr" : "1fr",
          }}
        >
          {salesActive ? (
            <button type="button" onClick={() => router.push("/billing")} style={primaryButtonStyle}>
              {cabinetBillingPrimaryCtaLabel(uiState)}
            </button>
          ) : null}
          <button type="button" onClick={() => router.push("/dashboard")} style={secondaryButtonStyle}>
            Назад в кабинет
          </button>
        </div>
      </div>
    </div>
  );
}

export default withFeatureGuard(ProfilePage, "profile");

const loadingStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f6f8",
  fontSize: "18px",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: "16px",
  maxWidth: "760px",
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 8px 26px rgba(0,0,0,0.05)",
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "16px",
  fontSize: "28px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "12px 0",
  borderTop: "1px solid #eef1f4",
};

const labelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
};

const valueStyle: React.CSSProperties = {
  color: "#111827",
  fontSize: "16px",
  fontWeight: 700,
  textAlign: "right",
  maxWidth: "62%",
};

const buttonRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginTop: "16px",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "12px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  cursor: "pointer",
};

const profileEditSectionStyle: React.CSSProperties = {
  marginBottom: 20,
  paddingBottom: 20,
  borderBottom: "1px solid #eef1f4",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const profileFieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: "100%",
};

const profileLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const profileInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 16,
  background: "#fff",
  color: "#111827",
};
