"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import {
  computeCalculatorEstimate,
  DEFAULT_CALCULATOR_PRICES,
  formatRubles,
  MAX_BLOCKS,
  MAX_CABLE_METERS,
  MAX_FLOORS,
  MAX_HOLES,
  MAX_MONEY,
  MAX_ROUTE_METERS,
  MAX_STROBA_METERS,
  sanitizeDecimalMetersString,
  sanitizeNonNegativeIntString,
  sanitizeNonNegativeMoneyString,
} from "@/lib/calculator";
import type { QuickCalculationExtra, UserCustomService } from "@/lib/customServices";
import type { CalculatorPriceList, SelectedExtraServiceMap } from "@/lib/calculator";
import { quoteCardToPngBlob } from "@/lib/quoteCardCanvas";
import {
  buildClientQuoteText,
  buildSmsShareUrl,
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
} from "@/lib/shareQuote";
import { hydrateTgCalculatorFromHistoryDoc } from "@/lib/tgCalculatorHistoryHydrate";
import { tgHapticButtonTap, tgHapticNotification } from "@/lib/telegramHaptic";
import {
  fetchMiniAppCalculatorContext,
  fetchMiniAppHistoryDocument,
  saveMiniAppCalculation,
} from "@/lib/telegramMiniAppCalculatorApi";
import { ensureTelegramMiniAppProfile, getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";

const ONBOARDING_STORAGE_KEY = "hvac_tg_onboarding_seen";
const ONBOARDING_SLIDES = [
  "Расчёт кондиционера за 1 минуту",
  "Ничего не забудете в смете",
  "Отправка клиенту прямо с объекта",
] as const;

const page: React.CSSProperties = {
  minHeight: "100dvh",
  padding:
    "max(12px, env(safe-area-inset-top)) 16px calc(168px + env(safe-area-inset-bottom))",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 12px",
};

const text: React.CSSProperties = {
  fontSize: 15,
  color: "#475569",
  lineHeight: 1.55,
  margin: "0 0 16px",
};

const btn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "16px 18px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
  textDecoration: "none",
  boxSizing: "border-box",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 12,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 16,
  fontSize: 14,
  lineHeight: 1.5,
  color: "#334155",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#475569",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const chk: React.CSSProperties = { width: 22, height: 22 };

type AuthUi =
  | "idle"
  | "checking"
  | "profile"
  | "need_registration"
  | "error"
  | "no_tg"
  | "no_init";

type CalcPhase = "idle" | "loading_context" | "ready" | "context_error";

export default function TgCalculatorPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  const [authUi, setAuthUi] = useState<AuthUi>("idle");
  const [profile, setProfile] = useState<TelegramMiniAppProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [calcPhase, setCalcPhase] = useState<CalcPhase>("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [prices, setPrices] = useState<CalculatorPriceList>(DEFAULT_CALCULATOR_PRICES);
  const [giftRouteMeters, setGiftRouteMeters] = useState(1);
  const [models, setModels] = useState<{ id: string; name: string; price: number }[]>([]);
  const [customServices, setCustomServices] = useState<UserCustomService[]>([]);

  const [capacity, setCapacity] = useState("12");
  const [mountType, setMountType] = useState<"standard" | "existing">("standard");
  const [routeMeters, setRouteMeters] = useState("0");
  const [baseWallType, setBaseWallType] = useState<"normal" | "arm">("normal");
  const [extraHolesNormal, setExtraHolesNormal] = useState("0");
  const [extraHolesArm, setExtraHolesArm] = useState("0");
  const [carryToolFloors, setCarryToolFloors] = useState("0");
  const [carryBlockCount, setCarryBlockCount] = useState("0");
  const [manualDismantlingCost, setManualDismantlingCost] = useState("0");
  const [strobaType, setStrobaType] = useState<"none" | "brick" | "concrete">("none");
  const [strobaMeters, setStrobaMeters] = useState("0");
  const [cable40Meters, setCable40Meters] = useState("0");
  const [cable16Meters, setCable16Meters] = useState("0");
  const [buyAcAndRouteFromUs, setBuyAcAndRouteFromUs] = useState(false);
  const [includeBrackets, setIncludeBrackets] = useState(false);
  const [includeGlass, setIncludeGlass] = useState(false);
  const [includeTile, setIncludeTile] = useState(false);
  const [includeDrain, setIncludeDrain] = useState(false);
  const [includePump, setIncludePump] = useState(false);
  const [includeLadderConnection, setIncludeLadderConnection] = useState(false);
  const [percentDiscount, setPercentDiscount] = useState("0");
  const [selectedAcModelIds, setSelectedAcModelIds] = useState<string[]>([]);
  const [modelPick, setModelPick] = useState("");
  const [selectedExtraServices, setSelectedExtraServices] =
    useState<SelectedExtraServiceMap>({});
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [quickCalculationExtras, setQuickCalculationExtras] = useState<
    QuickCalculationExtra[]
  >([]);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const wa = await waitForTelegramWebApp({
        intervalMs: 200,
        maxAttempts: 12,
      });
      if (cancelled) return;

      if (wa) {
        prepareTelegramMiniAppShell(wa);
        setInTelegram(true);
        setReady(true);
        const initData = typeof wa.initData === "string" ? wa.initData.trim() : "";
        setAuthUi("checking");
        const resolved = await ensureTelegramMiniAppProfile(initData || null);
        if (cancelled) return;
        if (resolved.status === "profile") {
          setProfile(resolved.profile);
          setAuthUi("profile");
          setAuthError(null);
          setCalcPhase("loading_context");
          const ctx = await fetchMiniAppCalculatorContext();
          if (cancelled) return;
          if (ctx.ok) {
            setPrices(ctx.prices);
            setGiftRouteMeters(ctx.giftRouteMeters);
            setModels(ctx.models);
            setCustomServices(ctx.customServices);
            setCalcPhase("ready");
            setContextError(null);
          } else {
            setCalcPhase("context_error");
            setContextError(ctx.error);
          }
        } else if (resolved.status === "need_registration") {
          setAuthUi("need_registration");
          setAuthError(null);
          setCalcPhase("ready");
        } else if (resolved.status === "error") {
          setAuthUi("error");
          setAuthError(resolved.message);
          setCalcPhase("ready");
        } else {
          setAuthUi("no_init");
          setAuthError(null);
          setCalcPhase("ready");
        }
      } else {
        setInTelegram(false);
        setAuthUi("checking");
        const resolved = await ensureTelegramMiniAppProfile(null);
        if (cancelled) return;
        if (resolved.status === "profile") {
          setProfile(resolved.profile);
          setAuthUi("profile");
          setAuthError(null);
          setCalcPhase("loading_context");
          const ctx = await fetchMiniAppCalculatorContext();
          if (cancelled) return;
          if (ctx.ok) {
            setPrices(ctx.prices);
            setGiftRouteMeters(ctx.giftRouteMeters);
            setModels(ctx.models);
            setCustomServices(ctx.customServices);
            setCalcPhase("ready");
            setContextError(null);
          } else {
            setCalcPhase("context_error");
            setContextError(ctx.error);
          }
        } else if (resolved.status === "need_registration") {
          setAuthUi("need_registration");
        } else if (resolved.status === "error") {
          setAuthUi("error");
          setAuthError(resolved.message);
        } else {
          setAuthUi("no_tg");
        }
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (inTelegram !== true || !ready) return;
    try {
      if (typeof localStorage === "undefined") return;
      if (localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1") return;
      setOnboardingStep(0);
      setOnboardingOpen(true);
    } catch {
      /* */
    }
  }, [inTelegram, ready]);

  useEffect(() => {
    setSelectedExtraServices((prev) => {
      const next: SelectedExtraServiceMap = { ...prev };
      for (const s of customServices) {
        if (!next[s.id]) next[s.id] = { checked: false, qty: "1" };
      }
      const allowed = new Set(customServices.map((s) => s.id));
      for (const k of Object.keys(next)) {
        if (!allowed.has(k)) delete next[k];
      }
      return next;
    });
  }, [customServices]);

  const result = useMemo(() => {
    return computeCalculatorEstimate(prices, {
      capacity,
      mountType,
      routeMeters,
      baseWallType,
      extraHolesNormal,
      extraHolesArm,
      carryToolFloors,
      carryBlockCount,
      manualDismantlingCost,
      strobaType,
      strobaMeters,
      cable40Meters,
      cable16Meters,
      buyAcAndRouteFromUs,
      includeBrackets,
      includeGlass,
      includeTile,
      includeDrain,
      includePump,
      includeLadderConnection,
      percentDiscount,
      giftRouteMeters,
      acModels: models,
      selectedAcModelIds,
      pricelistCustomServices: customServices,
      selectedExtraServices,
      quickCalculationExtras,
    });
  }, [
    prices,
    capacity,
    mountType,
    routeMeters,
    baseWallType,
    extraHolesNormal,
    extraHolesArm,
    carryToolFloors,
    carryBlockCount,
    manualDismantlingCost,
    strobaType,
    strobaMeters,
    cable40Meters,
    cable16Meters,
    buyAcAndRouteFromUs,
    includeBrackets,
    includeGlass,
    includeTile,
    includeDrain,
    includePump,
    includeLadderConnection,
    percentDiscount,
    giftRouteMeters,
    models,
    selectedAcModelIds,
    customServices,
    selectedExtraServices,
    quickCalculationExtras,
  ]);

  const quoteText = useMemo(
    () =>
      buildClientQuoteText({
        clientName,
        clientContact,
        capacity,
        mountType,
        items: result.items.map((i) => ({
          title: i.title,
          amount: i.amount,
          note: i.note,
        })),
        total: result.total,
      }),
    [clientName, clientContact, capacity, mountType, result.items, result.total]
  );

  const showCalculatorForm =
    (inTelegram === true && ready) ||
    (inTelegram === false &&
      authUi === "profile" &&
      calcPhase === "ready" &&
      Boolean(profile));

  const canOperate = useMemo(() => {
    if (authUi !== "profile" || calcPhase !== "ready" || !profile) return false;
    return Boolean(getMiniAppSessionToken()?.trim());
  }, [authUi, calcPhase, profile]);

  useEffect(() => {
    if (calcPhase !== "ready" || authUi !== "profile") return;
    if (typeof window === "undefined") return;
    const hid = new URLSearchParams(window.location.search).get("historyId")?.trim();
    if (!hid || historyLoadedRef.current === hid) return;
    let cancelled = false;
    void (async () => {
      const r = await fetchMiniAppHistoryDocument(hid);
      if (cancelled || !r.ok) return;
      historyLoadedRef.current = hid;
      const doc = { ...r.doc };
      delete doc.id;
      const h = hydrateTgCalculatorFromHistoryDoc(doc);
      if (h.capacity != null) setCapacity(h.capacity);
      if (h.mountType) setMountType(h.mountType);
      if (h.routeMeters != null) setRouteMeters(h.routeMeters);
      if (h.baseWallType) setBaseWallType(h.baseWallType);
      if (h.extraHolesNormal != null) setExtraHolesNormal(h.extraHolesNormal);
      if (h.extraHolesArm != null) setExtraHolesArm(h.extraHolesArm);
      if (h.carryToolFloors != null) setCarryToolFloors(h.carryToolFloors);
      if (h.carryBlockCount != null) setCarryBlockCount(h.carryBlockCount);
      if (h.manualDismantlingCost != null) setManualDismantlingCost(h.manualDismantlingCost);
      if (h.strobaType) setStrobaType(h.strobaType);
      if (h.strobaMeters != null) setStrobaMeters(h.strobaMeters);
      if (h.cable40Meters != null) setCable40Meters(h.cable40Meters);
      if (h.cable16Meters != null) setCable16Meters(h.cable16Meters);
      if (h.buyAcAndRouteFromUs != null) setBuyAcAndRouteFromUs(h.buyAcAndRouteFromUs);
      if (h.includeBrackets != null) setIncludeBrackets(h.includeBrackets);
      if (h.includeGlass != null) setIncludeGlass(h.includeGlass);
      if (h.includeTile != null) setIncludeTile(h.includeTile);
      if (h.includeDrain != null) setIncludeDrain(h.includeDrain);
      if (h.includePump != null) setIncludePump(h.includePump);
      if (h.includeLadderConnection != null) setIncludeLadderConnection(h.includeLadderConnection);
      if (h.percentDiscount != null) setPercentDiscount(h.percentDiscount);
      if (h.selectedAcModelIds) setSelectedAcModelIds(h.selectedAcModelIds);
      if (h.selectedExtraServices) setSelectedExtraServices(h.selectedExtraServices);
      if (h.quickCalculationExtras) setQuickCalculationExtras(h.quickCalculationExtras);
      if (h.clientName != null) setClientName(h.clientName);
      if (h.clientContact != null) setClientContact(h.clientContact);
      tgHapticNotification("success");
    })();
    return () => {
      cancelled = true;
    };
  }, [calcPhase, authUi]);

  function addModel() {
    if (!modelPick || selectedAcModelIds.includes(modelPick)) return;
    setSelectedAcModelIds((x) => [...x, modelPick]);
    setModelPick("");
  }

  function removeModel(id: string) {
    setSelectedAcModelIds((x) => x.filter((y) => y !== id));
  }

  async function onSave() {
    if (saveBusy) return;
    tgHapticButtonTap();
    if (!canOperate) {
      tgHapticNotification("error");
      setSaveToast("Войдите в аккаунт Mini App, чтобы сохранять расчёты");
      window.setTimeout(() => setSaveToast(null), 4000);
      return;
    }
    setSaveBusy(true);
    setSaveToast(null);
    const payload: Record<string, unknown> = {
      capacity,
      mountType,
      routeMeters,
      baseWallType,
      extraHolesNormal,
      extraHolesArm,
      carryToolFloors,
      carryBlockCount,
      manualDismantlingCost,
      strobaType,
      strobaMeters,
      cable40Meters,
      cable16Meters,
      buyAcAndRouteFromUs,
      includeBrackets,
      includeGlass,
      includeTile,
      includeDrain,
      includePump,
      includeLadderConnection,
      percentDiscount,
      selectedAcModelIds,
      selectedExtraServices,
      quickCalculationExtras,
      clientName,
      clientContact,
    };
    const r = await saveMiniAppCalculation(payload);
    setSaveBusy(false);
    if (r.ok) {
      tgHapticNotification("success");
      setSaveToast(`Сохранено. Итого ${formatRubles(r.total)}`);
    } else {
      tgHapticNotification("error");
      setSaveToast(r.error);
    }
    window.setTimeout(() => setSaveToast(null), 4000);
  }

  function shareTelegramNative() {
    tgHapticButtonTap();
    const wa = window.Telegram?.WebApp;
    const shareUrl = buildTelegramShareUrl(quoteText);
    try {
      wa?.switchInlineQuery?.(quoteText.slice(0, 200), ["users", "groups", "channels"]);
    } catch {
      /* */
    }
    try {
      wa?.openTelegramLink?.(shareUrl);
    } catch {
      /* */
    }
    try {
      wa?.openLink?.(shareUrl);
    } catch {
      window.open(shareUrl, "_blank");
    }
  }

  async function downloadQuotePdf() {
    tgHapticButtonTap();
    if (!canOperate) {
      tgHapticNotification("error");
      setSaveToast("Нет сессии для PDF");
      return;
    }
    const token = getMiniAppSessionToken();
    if (!token?.trim()) {
      tgHapticNotification("error");
      setSaveToast("Нет сессии для PDF");
      return;
    }
    setPdfBusy(true);
    try {
      const res = await fetch("/api/telegram/miniapp-quote-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({
          clientName,
          clientContact,
          capacity,
          mountType,
          lines: result.items.map((i) => ({
            title: i.title,
            amount: i.amount,
          })),
          total: result.total,
        }),
      });
      if (!res.ok) {
        tgHapticNotification("error");
        setSaveToast("Не удалось сделать PDF");
        setPdfBusy(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hvac-saas-smeta.pdf";
      a.click();
      URL.revokeObjectURL(url);
      tgHapticNotification("success");
    } catch {
      tgHapticNotification("error");
      setSaveToast("Ошибка PDF");
    }
    setPdfBusy(false);
    window.setTimeout(() => setSaveToast(null), 3000);
  }

  async function sharePngCard() {
    tgHapticButtonTap();
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    const lines = result.items.map(
      (i) => `${i.title}: ${formatRubles(i.amount)}`
    );
    const blob = await quoteCardToPngBlob(canvas, {
      clientName,
      totalRub: formatRubles(result.total),
      subtitle: `Монтаж ${capacity} кВт`,
      lines,
    });
    if (!blob) {
      tgHapticNotification("error");
      return;
    }
    const file = new File([blob], "hvac-smeta.png", { type: "image/png" });
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({ files: [file], title: "Смета HVAC-SaaS" });
        tgHapticNotification("success");
        return;
      } catch {
        /* */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hvac-saas-smeta.png";
    a.click();
    URL.revokeObjectURL(url);
    tgHapticNotification("success");
  }

  function scrollToTotalBlock() {
    tgHapticButtonTap();
    document.getElementById("tg-calc-total-anchor")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function finishOnboarding() {
    tgHapticButtonTap();
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      /* */
    }
    setOnboardingOpen(false);
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null);
        }}
      />
      <div style={page}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h1 style={{ ...title, margin: 0, flex: 1, minWidth: 0 }}>Калькулятор монтажника</h1>
          {ready ? (
            <Link
              href="/tg/history"
              onClick={() => tgHapticButtonTap()}
              style={{
                flexShrink: 0,
                padding: "10px 14px",
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #e2e8f0",
                color: "#0f172a",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              История
            </Link>
          ) : null}
        </div>

        {!ready ? (
          <p style={text}>Проверка окружения…</p>
        ) : (
          <>
            {inTelegram === false ? (
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 8px" }}>Браузер</p>
            ) : null}

            {inTelegram === true &&
            (authUi === "checking" || calcPhase === "loading_context") ? (
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 10px" }}>
                Синхронизация с аккаунтом…
              </p>
            ) : null}

            {inTelegram === false &&
            (authUi === "checking" || calcPhase === "loading_context") ? (
              <div style={card}>
                <p style={{ margin: 0 }}>Загрузка…</p>
              </div>
            ) : null}

            {authUi === "profile" && calcPhase === "context_error" ? (
              <div style={{ ...card, marginBottom: 12 }}>
                <p style={{ margin: 0, color: "#b91c1c" }}>
                  {contextError ?? "Не удалось загрузить прайс"}
                </p>
              </div>
            ) : null}

            {inTelegram === false &&
            authUi === "profile" &&
            profile &&
            calcPhase === "ready" ? (
              <div style={card}>
                <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#0f172a" }}>
                  Вы вошли через Telegram
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 14,
                    color: "#475569",
                  }}
                >
                  {profile.email ? <li>Email: {profile.email}</li> : null}
                  <li>План: {profile.plan ?? "—"}</li>
                  <li>Оплата: {profile.hasPaid ? "да" : "нет"}</li>
                </ul>
              </div>
            ) : null}

            {inTelegram === true && authUi === "need_registration" ? (
              <div
                style={{
                  ...card,
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <p style={{ margin: 0, fontSize: 14 }}>
                  Подключите Telegram к профилю HVAC-SaaS — подтянем ваш прайс и сохранение расчётов.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href="/login" style={{ ...btn, flex: 1, padding: "12px", fontSize: 15 }}>
                    Войти
                  </Link>
                  <Link
                    href="/register"
                    style={{ ...btnSecondary, flex: 1, padding: "12px", fontSize: 15, marginTop: 0 }}
                  >
                    Регистрация
                  </Link>
                </div>
              </div>
            ) : null}

            {inTelegram === false && authUi === "need_registration" ? (
              <div style={card}>
                <p style={{ margin: "0 0 12px" }}>
                  Свяжите Telegram с профилем HVAC-SaaS, чтобы пользоваться калькулятором с вашим
                  прайсом.
                </p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Зарегистрироваться
                </Link>
              </div>
            ) : null}

            {authUi === "error" && authError ? (
              <div style={{ ...card, marginBottom: 12 }}>
                <p style={{ margin: 0, color: "#b91c1c" }}>{authError}</p>
              </div>
            ) : null}

            {authUi === "no_init" ? (
              <div style={{ ...card, marginBottom: 12 }}>
                <p style={{ margin: 0, color: "#64748b" }}>
                  Нет initData — откройте страницу из бота или войдите с сохранённой сессией.
                </p>
              </div>
            ) : null}

            {showCalculatorForm ? (
              <>
                <div style={card}>
                  <span style={label}>Мощность, кВт</span>
                  <select
                    style={input}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  >
                    <option value="7">7</option>
                    <option value="9">9</option>
                    <option value="12">12</option>
                    <option value="18">18</option>
                    <option value="24">24</option>
                    <option value="30">30</option>
                    <option value="36">36</option>
                  </select>

                  <span style={label}>Тип монтажа</span>
                  <select
                    style={input}
                    value={mountType}
                    onChange={(e) =>
                      setMountType(e.target.value as "standard" | "existing")
                    }
                  >
                    <option value="standard">На нашу трассу</option>
                    <option value="existing">На чужую трассу</option>
                  </select>

                  <span style={label}>
                    Трасса, м (в подарок {giftRouteMeters} м с сайта)
                  </span>
                  <input
                    style={input}
                    inputMode="decimal"
                    value={routeMeters}
                    onChange={(e) =>
                      setRouteMeters(
                        sanitizeDecimalMetersString(e.target.value, MAX_ROUTE_METERS)
                      )
                    }
                  />

                  <span style={label}>Основное отверстие</span>
                  <select
                    style={input}
                    value={baseWallType}
                    onChange={(e) =>
                      setBaseWallType(e.target.value as "normal" | "arm")
                    }
                  >
                    <option value="normal">Кирпич / газобетон / неарм. бетон</option>
                    <option value="arm">Армированный бетон</option>
                  </select>

                  <span style={label}>Доп. отверстия обычные</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={extraHolesNormal}
                    onChange={(e) =>
                      setExtraHolesNormal(
                        sanitizeNonNegativeIntString(e.target.value, MAX_HOLES)
                      )
                    }
                  />

                  <span style={label}>Доп. отверстия арм. бетон</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={extraHolesArm}
                    onChange={(e) =>
                      setExtraHolesArm(
                        sanitizeNonNegativeIntString(e.target.value, MAX_HOLES)
                      )
                    }
                  />

                  <span style={label}>Штроба</span>
                  <select
                    style={input}
                    value={strobaType}
                    onChange={(e) =>
                      setStrobaType(e.target.value as "none" | "brick" | "concrete")
                    }
                  >
                    <option value="none">Нет</option>
                    <option value="brick">Кирпич</option>
                    <option value="concrete">Бетон</option>
                  </select>
                  <input
                    style={input}
                    inputMode="decimal"
                    placeholder="Метры штробления"
                    value={strobaMeters}
                    onChange={(e) =>
                      setStrobaMeters(
                        sanitizeDecimalMetersString(e.target.value, MAX_STROBA_METERS)
                      )
                    }
                  />

                  <span style={label}>Кабель-канал 40×40, м</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={cable40Meters}
                    onChange={(e) =>
                      setCable40Meters(
                        sanitizeNonNegativeIntString(e.target.value, MAX_CABLE_METERS)
                      )
                    }
                  />

                  <span style={label}>Кабель-канал 16×16, м</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={cable16Meters}
                    onChange={(e) =>
                      setCable16Meters(
                        sanitizeNonNegativeIntString(e.target.value, MAX_CABLE_METERS)
                      )
                    }
                  />

                  <span style={label}>Подъём инструмента (этаж с)</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={carryToolFloors}
                    onChange={(e) =>
                      setCarryToolFloors(
                        sanitizeNonNegativeIntString(e.target.value, MAX_FLOORS)
                      )
                    }
                  />

                  <span style={label}>Подъём внешнего блока, шт</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={carryBlockCount}
                    onChange={(e) =>
                      setCarryBlockCount(
                        sanitizeNonNegativeIntString(e.target.value, MAX_BLOCKS)
                      )
                    }
                  />

                  <span style={label}>Демонтаж вручную, ₽</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={manualDismantlingCost}
                    onChange={(e) =>
                      setManualDismantlingCost(
                        sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY)
                      )
                    }
                  />

                  <span style={label}>Скидка на весь расчёт, %</span>
                  <input
                    style={input}
                    inputMode="numeric"
                    value={percentDiscount}
                    onChange={(e) =>
                      setPercentDiscount(
                        sanitizeNonNegativeIntString(e.target.value, 100)
                      )
                    }
                  />

                  {(
                    [
                      ["Кронштейны", includeBrackets, setIncludeBrackets],
                      ["Стеклопакет", includeGlass, setIncludeGlass],
                      ["Плитка фасад", includeTile, setIncludeTile],
                      ["Дренаж в водосток", includeDrain, setIncludeDrain],
                      ["Дренажная помпа", includePump, setIncludePump],
                      [
                        "Лестница, внешний блок",
                        includeLadderConnection,
                        setIncludeLadderConnection,
                      ],
                    ] as const
                  ).map(([t, v, set]) => (
                    <label key={t} style={row}>
                      <input
                        type="checkbox"
                        style={chk}
                        checked={v}
                        onChange={(e) => set(e.target.checked)}
                      />
                      <span>{t}</span>
                    </label>
                  ))}

                  <label style={row}>
                    <input
                      type="checkbox"
                      style={chk}
                      checked={buyAcAndRouteFromUs}
                      onChange={(e) => setBuyAcAndRouteFromUs(e.target.checked)}
                    />
                    <span>Скидка при покупке кондиционера и трассы у нас (−1000 ₽)</span>
                  </label>
                </div>

                {models.length > 0 ? (
                  <div style={card}>
                    <span style={label}>Модели из прайса</span>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <select
                        style={{ ...input, flex: 1, marginBottom: 0 }}
                        value={modelPick}
                        onChange={(e) => setModelPick(e.target.value)}
                      >
                        <option value="">Выберите</option>
                        {models.map((m) => (
                          <option
                            key={m.id}
                            value={m.id}
                            disabled={selectedAcModelIds.includes(m.id)}
                          >
                            {m.name} — {formatRubles(m.price)}
                          </option>
                        ))}
                      </select>
                      <button type="button" style={{ ...btn, width: "auto", padding: "12px 16px" }} onClick={addModel}>
                        +
                      </button>
                    </div>
                    {selectedAcModelIds.map((id) => {
                      const m = models.find((x) => x.id === id);
                      if (!m) return null;
                      return (
                        <div
                          key={id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{m.name}</span>
                          <button
                            type="button"
                            onClick={() => removeModel(id)}
                            style={{
                              background: "#fee2e2",
                              color: "#991b1b",
                              border: "none",
                              borderRadius: 8,
                              padding: "8px 12px",
                              fontWeight: 600,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {customServices.length > 0 ? (
                  <div style={{ ...card, maxHeight: 220, overflowY: "auto" }}>
                    <span style={label}>Услуги из прайса</span>
                    {customServices.map((s) => {
                      const st = selectedExtraServices[s.id] ?? {
                        checked: false,
                        qty: "1",
                      };
                      return (
                        <div key={s.id} style={{ marginBottom: 10 }}>
                          <label style={row}>
                            <input
                              type="checkbox"
                              style={chk}
                              checked={st.checked}
                              onChange={(e) =>
                                setSelectedExtraServices((prev) => ({
                                  ...prev,
                                  [s.id]: {
                                    ...st,
                                    checked: e.target.checked,
                                  },
                                }))
                              }
                            />
                            <span>
                              {s.name} ({formatRubles(s.price)})
                            </span>
                          </label>
                          {st.checked ? (
                            <input
                              style={{ ...input, marginBottom: 0 }}
                              inputMode="numeric"
                              placeholder="Кол-во"
                              value={st.qty}
                              onChange={(e) =>
                                setSelectedExtraServices((prev) => ({
                                  ...prev,
                                  [s.id]: {
                                    ...st,
                                    qty: sanitizeNonNegativeIntString(e.target.value, 999),
                                  },
                                }))
                              }
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div style={card}>
                  <span style={label}>Клиент (для сохранения)</span>
                  <input
                    style={input}
                    placeholder="Имя"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                  <input
                    style={input}
                    placeholder="Телефон / контакт"
                    value={clientContact}
                    onChange={(e) => setClientContact(e.target.value)}
                  />
                </div>

                <div
                  id="tg-calc-total-anchor"
                  style={{ ...card, background: "#0f172a", color: "#fff" }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    Итого: {formatRubles(result.total)}
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
                    Те же цены и формула, что в полном калькуляторе. Подарок по трассе: {giftRouteMeters}{" "}
                    м.
                  </p>
                </div>

                <div style={card}>
                  <p style={{ margin: "0 0 12px", fontWeight: 700 }}>Поделиться в Telegram</p>
                  <button
                    type="button"
                    style={btn}
                    onClick={() => shareTelegramNative()}
                  >
                    Поделиться в Telegram
                  </button>
                </div>

                <div style={card}>
                  <p style={{ margin: "0 0 12px", fontWeight: 700 }}>Отправить клиенту</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button
                      type="button"
                      style={{ ...btn, padding: "14px", fontSize: 15 }}
                      onClick={() => {
                        tgHapticButtonTap();
                        const u = buildWhatsAppShareUrl(clientContact, quoteText);
                        if (u) window.open(u, "_blank");
                        else {
                          tgHapticNotification("warning");
                          setSaveToast("Укажите телефон клиента");
                        }
                      }}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      style={{ ...btn, padding: "14px", fontSize: 15 }}
                      onClick={() => shareTelegramNative()}
                    >
                      Telegram
                    </button>
                    <button
                      type="button"
                      style={{ ...btn, padding: "14px", fontSize: 15 }}
                      onClick={() => {
                        tgHapticButtonTap();
                        window.location.href = buildSmsShareUrl(quoteText);
                      }}
                    >
                      SMS
                    </button>
                    <button
                      type="button"
                      style={{ ...btnSecondary, padding: "14px", fontSize: 15, marginTop: 0 }}
                      onClick={async () => {
                        tgHapticButtonTap();
                        try {
                          await navigator.clipboard.writeText(quoteText);
                          tgHapticNotification("success");
                          setSaveToast("Текст скопирован");
                        } catch {
                          tgHapticNotification("error");
                        }
                        window.setTimeout(() => setSaveToast(null), 2500);
                      }}
                    >
                      Копировать
                    </button>
                  </div>
                </div>

                <div style={card}>
                  <p style={{ margin: "0 0 12px", fontWeight: 700 }}>Карточка (PNG)</p>
                  <button type="button" style={btnSecondary} onClick={() => void sharePngCard()}>
                    Сохранить / поделиться PNG
                  </button>
                </div>

                <canvas ref={cardCanvasRef} width={720} height={480} style={{ display: "none" }} />

                {saveToast ? (
                  <p style={{ ...text, textAlign: "center", marginTop: 8 }}>{saveToast}</p>
                ) : null}

                <Link href="/calculator" style={{ ...btnSecondary, marginBottom: 24 }}>
                  Открыть полный калькулятор
                </Link>
              </>
            ) : null}

            {inTelegram !== true &&
            (authUi !== "profile" || calcPhase !== "ready") ? (
              <>
                {(authUi === "no_tg" || authUi === "no_init" || authUi === "error") && (
                  <Link href="/calculator" style={btn}>
                    Открыть калькулятор на сайте
                  </Link>
                )}
              </>
            ) : null}
          </>
        )}

        {showCalculatorForm ? (
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
              paddingTop: 10,
              background: "rgba(248,250,252,0.97)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderTop: "1px solid #e2e8f0",
              boxShadow: "0 -8px 24px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ maxWidth: 440, margin: "0 auto", padding: "0 12px 4px" }}>
              <div
                style={{
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: 17,
                  color: "#0f172a",
                  marginBottom: 8,
                }}
              >
                {formatRubles(result.total)}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  style={{
                    ...btn,
                    padding: "12px 8px",
                    fontSize: 14,
                    opacity: canOperate ? 1 : 0.45,
                  }}
                  disabled={saveBusy || !canOperate}
                  onClick={() => void onSave()}
                >
                  {saveBusy ? "…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  style={{ ...btnSecondary, padding: "12px 8px", fontSize: 14, marginTop: 0 }}
                  onClick={() => {
                    tgHapticButtonTap();
                    setSendMenuOpen((v) => !v);
                  }}
                >
                  Отправить
                </button>
                <button
                  type="button"
                  style={{
                    ...btn,
                    padding: "12px 8px",
                    fontSize: 14,
                    opacity: canOperate ? 1 : 0.45,
                  }}
                  disabled={pdfBusy || !canOperate}
                  onClick={() => void downloadQuotePdf()}
                >
                  {pdfBusy ? "…" : "PDF"}
                </button>
                <button
                  type="button"
                  style={{ ...btnSecondary, padding: "12px 8px", fontSize: 14, marginTop: 0 }}
                  onClick={scrollToTotalBlock}
                >
                  Итог
                </button>
              </div>
              {sendMenuOpen ? (
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    style={{ ...btnSecondary, marginTop: 0, padding: "12px", fontSize: 14 }}
                    onClick={() => shareTelegramNative()}
                  >
                    Telegram
                  </button>
                  <button
                    type="button"
                    style={{ ...btnSecondary, marginTop: 0, padding: "12px", fontSize: 14 }}
                    onClick={async () => {
                      tgHapticButtonTap();
                      try {
                        await navigator.clipboard.writeText(quoteText);
                        tgHapticNotification("success");
                      } catch {
                        tgHapticNotification("error");
                      }
                    }}
                  >
                    Копировать
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {onboardingOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(15,23,42,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding:
              "max(20px, env(safe-area-inset-top)) 20px max(28px, env(safe-area-inset-bottom))",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: "#fff",
              borderRadius: 20,
              padding: "28px 22px 22px",
              boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 22,
                fontWeight: 800,
                lineHeight: 1.25,
                color: "#0f172a",
              }}
            >
              {ONBOARDING_SLIDES[onboardingStep]}
            </p>
            <p style={{ margin: "0 0 22px", fontSize: 14, color: "#64748b" }}>
              {onboardingStep + 1} / {ONBOARDING_SLIDES.length}
            </p>
            {onboardingStep < ONBOARDING_SLIDES.length - 1 ? (
              <button
                type="button"
                style={btn}
                onClick={() => {
                  tgHapticButtonTap();
                  setOnboardingStep((s) => s + 1);
                }}
              >
                Далее
              </button>
            ) : (
              <button type="button" style={btn} onClick={finishOnboarding}>
                Начать
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
