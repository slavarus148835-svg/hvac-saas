"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDocFromServer, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import { needsEmailCodeVerification, VERIFY_EMAIL_PATH } from "@/lib/emailVerification";
import { checkUserAccess } from "@/lib/checkAccess";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";
import {
  cabinetBadgeLabel,
  cabinetBillingShowsCommerce,
  cabinetNearExpirySoftParagraphs,
  cabinetShowsPaidAccessUntilRow,
  cabinetShowsPriceAndPaymentCopy,
  cabinetShowsTrialEndDateRow,
  getCabinetSubscriptionUiState,
} from "@/lib/subscriptionVisibility";
import {
  firestoreTimeToMs,
  isPaidActive,
  isTrialExpired,
  trialEndsMs,
  type UserTrialFields,
} from "@/lib/trialSubscription";

const MONTHLY_AMOUNT_KOPECKS = 1190 * 100;

export default function BillingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [userData, setUserData] = useState<UserTrialFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [expiredFromQuery, setExpiredFromQuery] = useState(false);
  const [paymentFailedFromBank, setPaymentFailedFromBank] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setExpiredFromQuery(p.get("reason") === "expired_trial");
    if (p.get("payment") === "failed") {
      setPaymentFailedFromBank(true);
      window.history.replaceState({}, "", "/billing");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
      setLoading(true);
      try {
        const currentUser = await resolveAuthUser(userFromObserver);
        if (!currentUser) {
          router.replace(buildLoginRedirectUrl("/billing"));
          return;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDocFromServer(userRef);

        if (!userSnap.exists()) {
          alert("Пользователь не найден");
          router.push("/dashboard");
          return;
        }

        const data = userSnap.data() as UserTrialFields;
        if (needsEmailCodeVerification(currentUser, data)) {
          router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
          return;
        }

        setUserData(data);
        setEmail(String(data.email || currentUser.email || ""));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        alert("Ошибка загрузки: " + message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const paid = useMemo(() => (userData ? isPaidActive(userData) : false), [userData]);

  const uiState = useMemo(
    () => getCabinetSubscriptionUiState(userData),
    [userData]
  );

  const commerce = useMemo(
    () => Boolean(userData && cabinetBillingShowsCommerce(userData)),
    [userData]
  );

  const showSoftIntro = useMemo(
    () => Boolean(userData && !commerce),
    [userData, commerce]
  );

  const pay = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert("Нет авторизации");
      return;
    }

    if (!userData || needsEmailCodeVerification(currentUser, userData)) {
      alert("Сначала подтвердите почту.");
      router.replace(`${VERIFY_EMAIL_PATH}?reason=access_blocked`);
      return;
    }

    if (!commerce) {
      return;
    }

    const effectiveUid = currentUser.uid;
    const orderId = `${effectiveUid}__${Date.now()}`;

    const payEmail = (email || currentUser.email || "").trim();
    if (!payEmail) {
      alert("Укажите email в профиле — он нужен для чека и оплаты.");
      router.push("/profile");
      return;
    }

    try {
      setPaying(true);

      await setDoc(
        doc(db, "users", effectiveUid),
        {
          lastPaymentIntent: {
            orderId,
            plan: "standard",
            months: 1,
            amount: MONTHLY_AMOUNT_KOPECKS,
            email: email || currentUser.email || "",
            status: "checkout_started",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const res = await fetch("/api/tbank/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: MONTHLY_AMOUNT_KOPECKS,
          months: 1,
          plan: "standard",
          userId: effectiveUid,
          orderId,
          email: (email || currentUser.email || "").trim(),
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(`${data.error || "Ошибка запроса"}${data.details ? "\n\nDetails:\n" + data.details : ""}`);
      }
    } catch {
      alert("Ошибка запроса");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <div style={loadingStyle}>Загрузка…</div>;
  }

  const accessOk = checkUserAccess(userData);
  const trialEndMs = userData ? trialEndsMs(userData) : 0;
  const paidEndMs = userData ? firestoreTimeToMs(userData.paidUntil) : 0;

  const priceFirstHero = Boolean(
    userData && commerce && cabinetShowsPriceAndPaymentCopy(userData)
  );
  const nearSoftHero = Boolean(
    userData &&
      commerce &&
      !priceFirstHero &&
      (uiState === "trial_active_3_days_or_less" || uiState === "paid_active_3_days_or_less")
  );

  const showPriceInCommerce = Boolean(
    userData && commerce && cabinetShowsPriceAndPaymentCopy(userData)
  );

  return (
    <div style={pageStyle}>
      {paymentFailedFromBank ? (
        <div style={noticeBannerFail}>
          Оплата не завершена или отменена. Можно оформить доступ снова — спишется только успешный платёж.
        </div>
      ) : null}

      {expiredFromQuery && userData && isTrialExpired(userData) && !paid ? (
        <div style={noticeBanner}>
          Срок доступа к разделам завершён. Ниже можно снова открыть инструменты.
        </div>
      ) : null}

      <div style={heroCard}>
        <div style={heroLabel}>Аккаунт</div>
        {paid && uiState === "paid_active_more_than_3_days" ? (
          <>
            <h1 style={heroTitle}>Доступ активен</h1>
            <p style={heroText}>
              Все инструменты открыты. Напоминание появится за три дня до даты окончания текущего срока.
            </p>
          </>
        ) : priceFirstHero ? (
          <>
            <h1 style={heroTitle}>1190 ₽ в месяц</h1>
            <p style={heroText}>Полный доступ ко всем разделам сервиса.</p>
          </>
        ) : nearSoftHero ? (
          <>
            <h1 style={heroTitle}>Срок доступа скоро закончится</h1>
            {cabinetNearExpirySoftParagraphs().map((t) => (
              <p key={t} style={{ ...heroText, marginTop: 8 }}>
                {t}
              </p>
            ))}
          </>
        ) : !commerce ? (
          <>
            <h1 style={heroTitle}>Работа в сервисе</h1>
            <p style={heroText}>
              Здесь появятся шаги для сохранения непрерывного доступа к разделам — за несколько дней до
              паузы в доступе либо если срок уже завершён.
            </p>
          </>
        ) : (
          <>
            <h1 style={heroTitle}>Продление доступа</h1>
            <p style={heroText}>Оформите доступ, чтобы продолжить пользоваться всеми разделами.</p>
          </>
        )}
      </div>

      <div style={statusCard}>
        <h2 style={sectionTitle}>Состояние</h2>
        <div style={infoRow}>
          <span style={labelStyle}>Email</span>
          <span style={valueStyle}>{email || "не указан"}</span>
        </div>
        <div style={infoRow}>
          <span style={labelStyle}>Статус</span>
          <span style={valueStyle}>{cabinetBadgeLabel(uiState)}</span>
        </div>
        <div style={infoRow}>
          <span style={labelStyle}>Доступ к разделам</span>
          <span style={{ ...valueStyle, color: accessOk ? "#166534" : "#b91c1c" }}>
            {accessOk ? "Открыт" : "Ограничен"}
          </span>
        </div>
        {userData && uiState === "no_trial_started" ? (
          <div style={infoRow}>
            <span style={labelStyle}>Разделы</span>
            <span style={valueStyle}>Откроются после первого сохранённого расчёта в калькуляторе</span>
          </div>
        ) : null}
        {userData && cabinetShowsTrialEndDateRow(userData) && trialEndMs > 0 ? (
          <div style={infoRow}>
            <span style={labelStyle}>Действует до</span>
            <span style={valueStyle}>{new Date(trialEndMs).toLocaleString("ru-RU")}</span>
          </div>
        ) : null}
        {userData && uiState === "trial_expired" && trialEndMs > 0 ? (
          <div style={infoRow}>
            <span style={labelStyle}>Закончилось</span>
            <span style={valueStyle}>{new Date(trialEndMs).toLocaleString("ru-RU")}</span>
          </div>
        ) : null}
        {userData && paid && cabinetShowsPaidAccessUntilRow(userData) && paidEndMs > 0 ? (
          <div style={infoRow}>
            <span style={labelStyle}>Действует до</span>
            <span style={valueStyle}>{new Date(paidEndMs).toLocaleString("ru-RU")}</span>
          </div>
        ) : null}
        {userData && uiState === "paid_expired" && paidEndMs > 0 ? (
          <div style={infoRow}>
            <span style={labelStyle}>Срок доступа до</span>
            <span style={valueStyle}>{new Date(paidEndMs).toLocaleString("ru-RU")}</span>
          </div>
        ) : null}
      </div>

      {commerce ? (
        <div style={singleCard}>
          <div style={planBadge}>Полный доступ</div>
          <h2 style={planTitle}>HVAC SaaS</h2>
          <p style={planSubtitle}>Калькулятор, прайс, история и кабинет.</p>
          <ul style={featureList}>
            <li>Личный кабинет и профиль</li>
            <li>Калькулятор, история расчётов и прайс</li>
            <li>Дополнительные услуги и автосохранение расчётов</li>
          </ul>
          <div style={{ ...priceRow, justifyContent: showPriceInCommerce ? "space-between" : "flex-end" }}>
            {showPriceInCommerce ? (
              <div>
                <div style={priceLabel}>Сумма за месяц</div>
                <div style={priceValue}>1190 ₽</div>
              </div>
            ) : null}
            <button type="button" onClick={() => void pay()} disabled={paying} style={payButton}>
              {paying
                ? "Переход…"
                : paid
                  ? "Продлить доступ"
                  : "Оформить доступ"}
            </button>
          </div>
        </div>
      ) : (
        <div style={softCard}>
          <h2 style={planTitle}>Пока без действий</h2>
          <p style={planSubtitle}>
            Сохраните первый расчёт в калькуляторе — так откроются все разделы. Когда до паузы в доступе
            останется несколько дней или срок уже завершится, здесь появятся следующие шаги.
          </p>
        </div>
      )}

      <div style={bottomButtons}>
        <button type="button" onClick={() => router.push("/dashboard")} style={secondaryButtonStyle}>
          Назад в кабинет
        </button>
      </div>
    </div>
  );
}

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
  maxWidth: "640px",
  margin: "0 auto",
};
const noticeBanner: React.CSSProperties = {
  marginBottom: "14px",
  padding: "14px 16px",
  borderRadius: "14px",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  fontSize: "15px",
  lineHeight: 1.45,
};
const noticeBannerFail: React.CSSProperties = {
  marginBottom: "14px",
  padding: "14px 16px",
  borderRadius: "14px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontSize: "15px",
  lineHeight: 1.45,
};
const heroCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "20px",
  marginBottom: "16px",
  boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
};
const heroLabel: React.CSSProperties = { fontSize: "12px", color: "#6b7280", marginBottom: "6px" };
const heroTitle: React.CSSProperties = { margin: 0, fontSize: "30px", lineHeight: 1.05, marginBottom: "8px" };
const heroText: React.CSSProperties = { margin: 0, color: "#6b7280", fontSize: "14px" };
const statusCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "16px",
  boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  marginBottom: "16px",
};
const sectionTitle: React.CSSProperties = { marginTop: 0, marginBottom: "14px", fontSize: "20px" };
const infoRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "10px 0",
  borderTop: "1px solid #eef1f4",
};
const labelStyle: React.CSSProperties = { fontSize: "12px", color: "#6b7280" };
const valueStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#111827",
  wordBreak: "break-word",
};
const singleCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  marginBottom: "16px",
  border: "2px solid #111827",
};
const softCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  marginBottom: "16px",
  border: "1px solid #e5e7eb",
};
const planBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 800,
  marginBottom: "12px",
  background: "#111827",
  color: "#fff",
};
const planTitle: React.CSSProperties = { margin: 0, fontSize: "26px", marginBottom: "8px" };
const planSubtitle: React.CSSProperties = { color: "#6b7280", fontSize: "14px", marginBottom: "16px" };
const featureList: React.CSSProperties = {
  margin: "0 0 20px 0",
  paddingLeft: "20px",
  color: "#111827",
  fontSize: "14px",
  lineHeight: 1.6,
};
const priceRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "16px",
  alignItems: "center",
  justifyContent: "space-between",
};
const priceLabel: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginBottom: "4px" };
const priceValue: React.CSSProperties = { fontSize: "28px", fontWeight: 900 };
const payButton: React.CSSProperties = {
  padding: "14px 24px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "16px",
  fontWeight: 700,
  cursor: "pointer",
};
const bottomButtons: React.CSSProperties = { display: "flex", gap: "10px" };
const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
