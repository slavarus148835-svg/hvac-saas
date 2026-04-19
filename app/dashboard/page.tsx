"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, getDocFromServer, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import {
  SESSION_EMAIL_JUST_VERIFIED_KEY,
  VERIFY_EMAIL_PATH,
  needsEmailCodeVerification,
  syncUserAuthMirrorToFirestore,
} from "@/lib/emailVerification";
import {
  checkUserAccess,
  getFeatureTitle,
  hasFeatureAccess,
  type FeatureKey,
} from "@/lib/checkAccess";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";
import {
  cabinetBadgeLabel,
  cabinetNearExpirySoftParagraphs,
  cabinetBillingPrimaryCtaLabel,
  cabinetPostExpiryPriceLine,
  cabinetShowsBillingNavigation,
  cabinetShowsPaidNearExpirySoftBlock,
  cabinetShowsPaidExpiredHardBlock,
  cabinetShowsPaidAccessUntilRow,
  cabinetShowsTrialEndDateRow,
  cabinetShowsTrialExpiredHardBlock,
  cabinetShowsTrialNearExpirySoftBlock,
  getCabinetSubscriptionUiState,
} from "@/lib/subscriptionVisibility";
import {
  firestoreTimeToMs,
  isPaidActive,
  isTrialExpired,
  paidDaysRemainingWhileActive,
  trialDaysRemaining,
  trialEndsMs,
  type UserTrialFields,
} from "@/lib/trialSubscription";

type ProfileData = UserTrialFields & {
  uid?: string;
  email?: string;
  name?: string;
  phone?: string;
  emailVerifiedByCode?: boolean;
};

type FeatureCard = {
  key: FeatureKey;
  href: string;
  title: string;
  text: string;
};

const featureCards: FeatureCard[] = [
  { key: "profile", href: "/profile", title: "Профиль", text: "Имя, телефон, контакты" },
  { key: "pricing", href: "/pricing", title: "Прайс", text: "Личные цены на работы" },
  { key: "calculator", href: "/calculator", title: "Калькулятор", text: "Расчёт на объекте" },
  { key: "history", href: "/history", title: "История расчётов", text: "Все автосохранённые расчёты" },
  { key: "billing", href: "/billing", title: "Срок в сервисе", text: "Только когда пора продлить" },
];

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [verifiedWelcome, setVerifiedWelcome] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    if (sessionStorage.getItem(SESSION_EMAIL_JUST_VERIFIED_KEY) === "1") {
      sessionStorage.removeItem(SESSION_EMAIL_JUST_VERIFIED_KEY);
      setVerifiedWelcome(true);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
      const currentUser = await resolveAuthUser(userFromObserver);
      if (!currentUser) {
        setUser(null);
        router.replace(buildLoginRedirectUrl("/dashboard"));
        return;
      }

      setUser(currentUser);

      try {
        try {
          await syncUserAuthMirrorToFirestore(currentUser);
        } catch {
          /* не блокируем кабинет при временной ошибке Firestore */
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDocFromServer(userRef);

        const gateProfile = userSnap.exists() ? userSnap.data() : null;
        if (needsEmailCodeVerification(currentUser, gateProfile)) {
          setUser(null);
          router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
          return;
        }

        if (!userSnap.exists()) {
          const stamp = new Date().toISOString();
          const newProfile: ProfileData = {
            uid: currentUser.uid,
            email: currentUser.email || "",
            name: "",
            phone: "",
            blocked: false,
            plan: "trial",
            subscriptionStatus: "trial_pending",
            trialDays: 15,
          };

          await setDoc(userRef, {
            ...newProfile,
            emailVerified: currentUser.emailVerified,
            emailVerifiedByCode: false,
            createdAt: stamp,
            updatedAt: stamp,
          });

          setProfile(newProfile);
          return;
        }

        let data = userSnap.data() as ProfileData;

        const patch: Partial<ProfileData> = {};
        let needsPatch = false;

        if (typeof data.blocked !== "boolean") {
          patch.blocked = false;
          needsPatch = true;
        }
        if (!data.plan) {
          patch.plan = "trial";
          needsPatch = true;
        }
        if (typeof data.name !== "string") {
          patch.name = "";
          needsPatch = true;
        }
        if (typeof data.phone !== "string") {
          patch.phone = "";
          needsPatch = true;
        }

        if (needsPatch) {
          await updateDoc(userRef, {
            ...patch,
            updatedAt: new Date().toISOString(),
          });

          const refreshedSnap = await getDocFromServer(userRef);
          if (refreshedSnap.exists()) {
            setProfile(refreshedSnap.data() as ProfileData);
          } else {
            setProfile({ ...data, ...patch });
          }
        } else {
          setProfile(data);
        }
      } catch (error: any) {
        alert("Ошибка загрузки кабинета: " + error.message);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleOpenFeature = (feature: FeatureCard) => {
    if (!profile) return;

    if (hasFeatureAccess(profile, feature.key)) {
      router.push(feature.href);
      return;
    }

    if (
      feature.key !== "billing" &&
      isTrialExpired(profile) &&
      !isPaidActive(profile)
    ) {
      router.push("/billing?reason=expired_trial");
      return;
    }

    const featureTitle = getFeatureTitle(feature.key);

    router.push(
      `/no-access?feature=${encodeURIComponent(
        featureTitle
      )}&required=${encodeURIComponent(
        "ACCESS"
      )}&reason=${encodeURIComponent(
        "Этот раздел сейчас недоступен. Когда откроется возможность продления срока, воспользуйтесь ей в соответствующем разделе."
      )}`
    );
  };

  const accessOk = useMemo(() => checkUserAccess(profile), [profile]);
  const uiState = useMemo(
    () => getCabinetSubscriptionUiState(profile),
    [profile]
  );
  const trialLeft = profile ? trialDaysRemaining(profile) : null;
  const paidLeft = profile ? paidDaysRemainingWhileActive(profile) : null;
  const salesActive = useMemo(() => cabinetShowsBillingNavigation(profile), [profile]);
  const trialNearSoft = useMemo(
    () => cabinetShowsTrialNearExpirySoftBlock(profile),
    [profile]
  );
  const paidNearSoft = useMemo(
    () => cabinetShowsPaidNearExpirySoftBlock(profile),
    [profile]
  );
  const trialExpiredHard = useMemo(
    () => cabinetShowsTrialExpiredHardBlock(profile),
    [profile]
  );
  const paidExpiredHard = useMemo(
    () => cabinetShowsPaidExpiredHardBlock(profile),
    [profile]
  );
  const visibleFeatureCards = useMemo(
    () => featureCards.filter((c) => c.key !== "billing" || salesActive),
    [salesActive]
  );
  const trialEndLabel =
    profile && trialEndsMs(profile) > 0
      ? new Date(trialEndsMs(profile)).toLocaleString("ru-RU")
      : null;
  const paidUntilMs = profile ? firestoreTimeToMs(profile.paidUntil) : 0;

  if (!user) {
    return <div style={loadingStyle}>Загрузка...</div>;
  }

  return (
    <div style={pageStyle}>
      {trialNearSoft && trialLeft !== null ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            color: "#92400e",
            fontSize: "15px",
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>Срок доступа скоро закончится</div>
          <div style={{ color: "#78350f", marginBottom: "8px" }}>
            Осталось {trialLeft}{" "}
            {trialLeft === 1 ? "день" : trialLeft < 5 ? "дня" : "дней"} полного доступа к разделам.
          </div>
          {cabinetNearExpirySoftParagraphs().map((line) => (
            <div key={line} style={{ color: "#78350f", marginBottom: "6px" }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {paidNearSoft && paidLeft !== null ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            color: "#92400e",
            fontSize: "15px",
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>Срок доступа скоро закончится</div>
          <div style={{ color: "#78350f", marginBottom: "8px" }}>
            Осталось {paidLeft}{" "}
            {paidLeft === 1 ? "день" : paidLeft < 5 ? "дня" : "дней"} до паузы в доступе к разделам.
          </div>
          {cabinetNearExpirySoftParagraphs().map((line) => (
            <div key={`p-${line}`} style={{ color: "#78350f", marginBottom: "6px" }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {trialExpiredHard ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "15px",
            lineHeight: 1.45,
            fontWeight: 600,
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            Срок доступа к разделам завершён. Чтобы снова открыть калькулятор и
            остальные инструменты, оформите доступ.
          </div>
          <div style={{ fontWeight: 700 }}>{cabinetPostExpiryPriceLine()}</div>
        </div>
      ) : null}

      {paidExpiredHard ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "15px",
            lineHeight: 1.45,
            fontWeight: 600,
          }}
        >
          <div style={{ marginBottom: "8px" }}>Срок полного доступа истёк. Оформите доступ снова.</div>
          <div style={{ fontWeight: 700 }}>{cabinetPostExpiryPriceLine()}</div>
        </div>
      ) : null}

      {verifiedWelcome ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#ecfdf5",
            border: "1px solid #bbf7d0",
            color: "#166534",
            fontSize: "15px",
            fontWeight: 600,
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            Аккаунт успешно подтверждён: почта проверена, доступ к разделам сервиса открыт.
          </span>
          <button
            type="button"
            onClick={() => setVerifiedWelcome(false)}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid #166534",
              background: "#fff",
              color: "#166534",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Понятно
          </button>
        </div>
      ) : null}
      <div style={topCard}>
        <div style={topHeader}>
          <div>
            <div style={smallLabel}>Личный кабинет</div>
            <h1 style={titleStyle}>HVAC SaaS</h1>
          </div>

          <div
            style={{
              ...planBadgeStyle,
              ...(() => {
                if (uiState === "trial_expired" || uiState === "paid_expired") {
                  return { background: "#fef2f2", color: "#b91c1c" };
                }
                if (uiState === "paid_active_more_than_3_days" || uiState === "paid_active_3_days_or_less") {
                  return { background: "#eef2ff", color: "#3730a3" };
                }
                if (uiState === "trial_active_3_days_or_less") {
                  return { background: "#fffbeb", color: "#b45309" };
                }
                return { background: "#f0f9ff", color: "#0369a1" };
              })(),
            }}
          >
            {cabinetBadgeLabel(uiState)}
          </div>
        </div>

        <div style={infoBlock}>
          <div style={infoRow}>
            <span style={labelStyle}>Email</span>
            <span style={valueStyle}>{user.email}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Подтверждение почты</span>
            <span
              style={{
                ...valueStyle,
                color: !needsEmailCodeVerification(user, profile) ? "#166534" : "#b91c1c",
              }}
            >
              {!needsEmailCodeVerification(user, profile)
                ? "Почта подтверждена"
                : "Почта не подтверждена"}
            </span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Имя</span>
            <span style={valueStyle}>{profile?.name || "не указано"}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Телефон</span>
            <span style={valueStyle}>{profile?.phone || "не указан"}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Статус доступа</span>
            <span style={{ ...valueStyle, color: accessOk ? "#166534" : "#b91c1c" }}>
              {accessOk ? "Доступ открыт" : "Доступ ограничен"}
            </span>
          </div>

          {uiState === "no_trial_started" && (
            <div style={infoRow}>
              <span style={labelStyle}>Разделы</span>
              <span style={valueStyle}>
                Откроются после первого сохранённого расчёта в калькуляторе
              </span>
            </div>
          )}

          {profile && cabinetShowsTrialEndDateRow(profile) && trialEndLabel ? (
            <div style={infoRow}>
              <span style={labelStyle}>Действует до</span>
              <span style={valueStyle}>{trialEndLabel}</span>
            </div>
          ) : null}

          {profile && cabinetShowsPaidAccessUntilRow(profile) && paidUntilMs > 0 ? (
            <div style={infoRow}>
              <span style={labelStyle}>Доступ до</span>
              <span style={valueStyle}>{new Date(paidUntilMs).toLocaleString("ru-RU")}</span>
            </div>
          ) : null}
        </div>

        <div
          style={{
            ...topButtons,
            gridTemplateColumns: salesActive ? "repeat(auto-fit, minmax(180px, 1fr))" : "1fr",
          }}
        >
          {salesActive ? (
            <button type="button" onClick={() => router.push("/billing")} style={primaryButton}>
              {cabinetBillingPrimaryCtaLabel(uiState)}
            </button>
          ) : null}
          <button type="button" onClick={handleLogout} style={logoutButton}>
            Выйти
          </button>
        </div>
      </div>

      <div style={gridStyle}>
        {visibleFeatureCards.map((item) => {
          const allowed = hasFeatureAccess(profile, item.key);

          return (
            <button
              key={item.key}
              onClick={() => handleOpenFeature(item)}
              style={{
                ...menuCardButton,
                opacity: allowed ? 1 : 0.72,
                border: allowed ? "1px solid #eef1f4" : "1px solid #fecaca",
              }}
            >
              <div style={menuTopLine}>
                <div style={menuTitle}>{item.title}</div>
                <div
                  style={{
                    ...accessMiniBadge,
                    background: allowed ? "#ecfdf5" : "#fff1f2",
                    color: allowed ? "#166534" : "#b91c1c",
                  }}
                >
                  {allowed ? "Доступ" : "Нет доступа"}
                </div>
              </div>
              <div style={menuText}>{item.text}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f4f6f8", padding: "16px", maxWidth: "920px", margin: "0 auto" };
const loadingStyle: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" };
const topCard: React.CSSProperties = { background: "#ffffff", borderRadius: "20px", padding: "20px", boxShadow: "0 10px 28px rgba(0,0,0,0.06)", marginBottom: "16px" };
const topHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", marginBottom: "16px" };
const smallLabel: React.CSSProperties = { fontSize: "12px", color: "#6b7280", marginBottom: "6px" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "30px", lineHeight: 1.05 };
const planBadgeStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: "999px", fontSize: "13px", fontWeight: 800, whiteSpace: "nowrap" };
const infoBlock: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "16px" };
const infoRow: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", padding: "12px", borderRadius: "14px", background: "#f9fafb", border: "1px solid #eef1f4" };
const labelStyle: React.CSSProperties = { fontSize: "12px", color: "#6b7280" };
const valueStyle: React.CSSProperties = { fontSize: "16px", fontWeight: 700, color: "#111827", wordBreak: "break-word" };
const topButtons: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginBottom: "16px" };
const menuCardButton: React.CSSProperties = { textAlign: "left", background: "#ffffff", borderRadius: "18px", padding: "16px", boxShadow: "0 4px 18px rgba(0,0,0,0.05)", cursor: "pointer" };
const menuTopLine: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", marginBottom: "8px" };
const menuTitle: React.CSSProperties = { fontSize: "18px", fontWeight: 800 };
const menuText: React.CSSProperties = { fontSize: "14px", color: "#6b7280", lineHeight: 1.45 };
const accessMiniBadge: React.CSSProperties = { padding: "6px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" };
const primaryButton: React.CSSProperties = { width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", background: "#111827", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" };
const logoutButton: React.CSSProperties = { width: "100%", padding: "14px 16px", borderRadius: "14px", border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: "15px", fontWeight: 600, cursor: "pointer" };
