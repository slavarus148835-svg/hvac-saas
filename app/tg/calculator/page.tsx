"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import {
  computeCalculatorEstimate,
  DEFAULT_CALCULATOR_PRICES,
  formatAmountRu,
  formatCapacityBtu,
  formatRubles,
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
import {
  newQuickExtraId,
  type QuickCalculationExtra,
  type UserCustomService,
} from "@/lib/customServices";
import type { CalculatorPriceList, SelectedExtraServiceMap } from "@/lib/calculator";
import { quoteCardToPngBlob } from "@/lib/quoteCardCanvas";
import { buildSmsShareUrl, buildTelegramShareUrl, buildWhatsAppShareUrl } from "@/lib/shareQuote";
import {
  buildTelegramMiniAppClientQuoteText,
  mapMiniAppQuoteItemTitle,
} from "@/lib/telegramMiniAppQuoteText";
import { hydrateTgCalculatorFromHistoryDoc } from "@/lib/tgCalculatorHistoryHydrate";
import { useScrollInputIntoView } from "@/lib/useScrollInputIntoView";
import { tgHapticButtonTap, tgHapticNotification } from "@/lib/telegramHaptic";
import {
  createMiniAppModel,
  fetchMiniAppCalculatorContext,
  fetchMiniAppHistoryDocument,
  saveMiniAppCalculation,
} from "@/lib/telegramMiniAppCalculatorApi";
import { ensureTelegramMiniAppProfile, getMiniAppSessionToken } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";
import type { MiniAppCalculatorTextSettings } from "@/lib/telegramMiniAppCalculatorApi";

const ONBOARDING_STORAGE_KEY = "hvac_tg_onboarding_seen";
const CALC_HELP_DISMISSED_KEY = "hvac_tg_calc_help_dismissed";

const ONBOARDING_STEPS = [
  {
    title: "Сначала проверьте личный прайс",
    body: "Цены монтажа, трассы и допработ можно изменить под себя.",
  },
  {
    title: "Добавьте модели кондиционеров",
    body: "Модели из вашего прайса будут доступны прямо в расчёте.",
  },
  {
    title: "Считайте и отправляйте смету клиенту",
    body: "Сохраните расчёт, отправьте текст, PDF или сообщение в Telegram или WhatsApp.",
  },
] as const;

const BTU_MODEL_OPTIONS = ["7", "9", "12", "18", "24", "30", "36"] as const;

const page: React.CSSProperties = {
  minHeight: "100dvh",
  maxHeight: "100dvh",
  overflowY: "auto",
  scrollPaddingBottom: "calc(200px + env(safe-area-inset-bottom, 0px))",
  padding:
    "max(12px, env(safe-area-inset-top)) 16px calc(200px + env(safe-area-inset-bottom))",
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
  const [quickSvcName, setQuickSvcName] = useState("");
  const [quickSvcPrice, setQuickSvcPrice] = useState("");
  const [modelFormOpen, setModelFormOpen] = useState(false);
  const [newMdlName, setNewMdlName] = useState("");
  const [newMdlBtu, setNewMdlBtu] = useState<string>("12");
  const [newMdlPrice, setNewMdlPrice] = useState("");
  const [newMdlComment, setNewMdlComment] = useState("");
  const [modelAddBusy, setModelAddBusy] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [clientQuoteUserEdited, setClientQuoteUserEdited] = useState(false);
  const [clientQuoteDraft, setClientQuoteDraft] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [calcHelpVisible, setCalcHelpVisible] = useState(false);
  const [textSettings, setTextSettings] = useState<MiniAppCalculatorTextSettings>({
    quoteFooterTemplate: "",
    guaranteeText: "",
    masterContact: "",
  });
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
            setTextSettings(ctx.textSettings);
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
            setTextSettings(ctx.textSettings);
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
    if (inTelegram !== true || !ready) return;
    try {
      if (typeof localStorage === "undefined") return;
      if (localStorage.getItem(CALC_HELP_DISMISSED_KEY) === "1") return;
      setCalcHelpVisible(true);
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

  const autoClientQuoteText = useMemo(() => {
    let t = buildTelegramMiniAppClientQuoteText({
      clientName,
      clientContact,
      capacity,
      mountType,
      items: result.items.map((i) => ({
        title: i.title,
        amount: i.amount,
      })),
      total: result.total,
    });
    const tail: string[] = [];
    if (textSettings.guaranteeText.trim()) tail.push(textSettings.guaranteeText.trim());
    if (textSettings.masterContact.trim()) {
      tail.push(`Мастер: ${textSettings.masterContact.trim()}`);
    }
    if (textSettings.quoteFooterTemplate.trim()) {
      tail.push(textSettings.quoteFooterTemplate.trim());
    }
    if (tail.length) t = `${t}\n\n${tail.join("\n\n")}`;
    return t;
  }, [
    clientName,
    clientContact,
    capacity,
    mountType,
    result.items,
    result.total,
    textSettings.guaranteeText,
    textSettings.masterContact,
    textSettings.quoteFooterTemplate,
  ]);

  const effectiveClientQuoteText = useMemo(() => {
    if (!clientQuoteUserEdited) return autoClientQuoteText;
    return clientQuoteDraft.trim() || autoClientQuoteText;
  }, [clientQuoteUserEdited, clientQuoteDraft, autoClientQuoteText]);

  const showCalculatorForm =
    (inTelegram === true && ready) ||
    (inTelegram === false &&
      authUi === "profile" &&
      calcPhase === "ready" &&
      Boolean(profile));

  useScrollInputIntoView(showCalculatorForm);

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
      const docRaw = doc as Record<string, unknown>;
      const isMulti =
        docRaw.multiRoom === true &&
        Array.isArray(docRaw.rooms) &&
        docRaw.rooms.length > 1;
      const savedClientText =
        typeof docRaw.clientText === "string" ? docRaw.clientText.trim() : "";

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
      if (isMulti && savedClientText) {
        setClientQuoteUserEdited(true);
        setClientQuoteDraft(savedClientText);
        setSaveToast("Несколько комнат: таблица — по первой комнате; полный текст в блоке ниже.");
        window.setTimeout(() => setSaveToast(null), 5000);
      } else {
        setClientQuoteUserEdited(false);
        setClientQuoteDraft("");
      }
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

  function addQuickServiceToCalc() {
    tgHapticButtonTap();
    const name = quickSvcName.trim();
    const price = Math.max(0, Math.floor(Number(quickSvcPrice.replace(/\D/g, "") || 0)));
    if (!name) {
      tgHapticNotification("warning");
      setSaveToast("Укажите название услуги");
      window.setTimeout(() => setSaveToast(null), 2500);
      return;
    }
    if (!price) {
      tgHapticNotification("warning");
      setSaveToast("Укажите цену больше 0");
      window.setTimeout(() => setSaveToast(null), 2500);
      return;
    }
    const capped = Math.min(MAX_MONEY, price);
    setQuickCalculationExtras((prev) => [
      ...prev,
      { id: newQuickExtraId(), name, price: capped },
    ]);
    setQuickSvcName("");
    setQuickSvcPrice("");
    tgHapticNotification("success");
  }

  function removeQuickExtraLine(id: string) {
    tgHapticButtonTap();
    setQuickCalculationExtras((prev) => prev.filter((x) => x.id !== id));
  }

  function cancelInlineModelForm() {
    tgHapticButtonTap();
    setModelFormOpen(false);
    setNewMdlName("");
    setNewMdlPrice("");
    setNewMdlComment("");
    setNewMdlBtu("12");
  }

  async function saveInlineModel() {
    tgHapticButtonTap();
    if (!canOperate) {
      tgHapticNotification("error");
      setSaveToast("Войдите в аккаунт Mini App");
      window.setTimeout(() => setSaveToast(null), 3000);
      return;
    }
    const name = newMdlName.trim();
    const price = Math.max(0, Math.floor(Number(newMdlPrice.replace(/\D/g, "") || 0)));
    if (!name) {
      tgHapticNotification("warning");
      setSaveToast("Введите название модели");
      window.setTimeout(() => setSaveToast(null), 2500);
      return;
    }
    if (!price) {
      tgHapticNotification("warning");
      setSaveToast("Введите цену больше 0");
      window.setTimeout(() => setSaveToast(null), 2500);
      return;
    }
    setModelAddBusy(true);
    const r = await createMiniAppModel({
      name,
      price,
      capacityKw: newMdlBtu,
      comment: newMdlComment.trim() || undefined,
    });
    setModelAddBusy(false);
    if (!r.ok) {
      tgHapticNotification("error");
      setSaveToast(r.error);
      window.setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    const id = r.id.trim();
    if (!id) {
      tgHapticNotification("error");
      setSaveToast("Не получили id модели");
      window.setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    setModels((prev) =>
      [...prev.filter((m) => m.id !== id), { id, name, price }].sort((a, b) =>
        a.name.localeCompare(b.name, "ru")
      )
    );
    setSelectedAcModelIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setModelPick("");
    setNewMdlName("");
    setNewMdlPrice("");
    setNewMdlComment("");
    setNewMdlBtu("12");
    setModelFormOpen(false);
    tgHapticNotification("success");
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
    const body = effectiveClientQuoteText;
    const shareUrl = buildTelegramShareUrl(body);
    try {
      wa?.switchInlineQuery?.(body.slice(0, 200), ["users", "groups", "channels"]);
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
            title: mapMiniAppQuoteItemTitle(i.title),
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
      (i) => `${mapMiniAppQuoteItemTitle(i.title)} — ${formatRubles(i.amount)}`
    );
    const blob = await quoteCardToPngBlob(canvas, {
      clientName,
      totalRub: formatRubles(result.total),
      subtitle: `Монтаж ${formatCapacityBtu(capacity)}`,
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

  function scrollToClientTextBlock() {
    document.getElementById("tg-calc-client-text")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
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
        <h1 style={{ ...title, margin: "0 0 10px" }}>Калькулятор монтажника</h1>
        {ready ? <TgMiniAppNav /> : null}

        {ready && inTelegram === true && showCalculatorForm ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a" }}>
                Быстрый расчёт на объекте
              </div>
            </div>

            {calcHelpVisible ? (
              <div
                style={{
                  ...card,
                  marginBottom: 12,
                  background: "#eff6ff",
                  borderColor: "#bfdbfe",
                  position: "relative",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    tgHapticButtonTap();
                    try {
                      localStorage.setItem(CALC_HELP_DISMISSED_KEY, "1");
                    } catch {
                      /* */
                    }
                    setCalcHelpVisible(false);
                  }}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 10,
                    border: "none",
                    background: "transparent",
                    color: "#64748b",
                    fontSize: 20,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: 4,
                  }}
                  aria-label="Закрыть подсказку"
                >
                  ×
                </button>
                <p style={{ margin: "0 28px 0 0", fontSize: 14, color: "#1e3a5f", lineHeight: 1.5 }}>
                  Проверьте личный прайс и модели во вкладках сверху перед первым расчётом.
                </p>
              </div>
            ) : null}
          </>
        ) : null}

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
                  <span style={label}>Модели кондиционеров из прайса</span>
                  {models.length === 0 ? (
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
                      Пока нет моделей — добавьте кнопкой ниже.
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <select
                      style={{ ...input, flex: 1, marginBottom: 0 }}
                      value={modelPick}
                      onChange={(e) => setModelPick(e.target.value)}
                      disabled={models.length === 0}
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
                    <button
                      type="button"
                      style={{ ...btn, width: "auto", padding: "12px 16px" }}
                      onClick={addModel}
                      disabled={!modelPick}
                    >
                      +
                    </button>
                  </div>
                  {!modelFormOpen ? (
                    <button
                      type="button"
                      style={{ ...btnSecondary, marginTop: 0 }}
                      onClick={() => {
                        tgHapticButtonTap();
                        setModelFormOpen(true);
                      }}
                    >
                      + Добавить модель
                    </button>
                  ) : (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <span style={{ ...label, marginTop: 0 }}>Новая модель</span>
                      <input
                        style={input}
                        placeholder="Название модели"
                        value={newMdlName}
                        onChange={(e) => setNewMdlName(e.target.value)}
                      />
                      <span style={label}>Мощность BTU</span>
                      <select
                        style={input}
                        value={newMdlBtu}
                        onChange={(e) => setNewMdlBtu(e.target.value)}
                      >
                        {BTU_MODEL_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {formatCapacityBtu(c)}
                          </option>
                        ))}
                      </select>
                      <input
                        style={input}
                        placeholder="Цена, ₽"
                        inputMode="numeric"
                        value={newMdlPrice}
                        onChange={(e) =>
                          setNewMdlPrice(sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY))
                        }
                      />
                      <input
                        style={input}
                        placeholder="Комментарий (необязательно)"
                        value={newMdlComment}
                        onChange={(e) => setNewMdlComment(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          style={{ ...btn, flex: 1, marginTop: 0 }}
                          disabled={modelAddBusy || !canOperate}
                          onClick={() => void saveInlineModel()}
                        >
                          {modelAddBusy ? "…" : "Сохранить"}
                        </button>
                        <button
                          type="button"
                          style={{ ...btnSecondary, flex: 1, marginTop: 0 }}
                          disabled={modelAddBusy}
                          onClick={cancelInlineModelForm}
                        >
                          Отмена
                        </button>
                      </div>
                      {!canOperate ? (
                        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309" }}>
                          Войдите в аккаунт Mini App, чтобы сохранять модели в профиль.
                        </p>
                      ) : null}
                    </div>
                  )}
                  {selectedAcModelIds.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
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
                            <span style={{ fontSize: 14 }}>
                              {m.name} — {formatRubles(m.price)}
                            </span>
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
                </div>

                <div style={card}>
                  <span style={label}>Мощность BTU</span>
                  <select
                    style={input}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    aria-label="Выберите мощность BTU"
                  >
                    {BTU_MODEL_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {formatCapacityBtu(v)}
                      </option>
                    ))}
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
                    inputMode="decimal"
                    value={cable40Meters}
                    onChange={(e) =>
                      setCable40Meters(
                        sanitizeDecimalMetersString(e.target.value, MAX_CABLE_METERS)
                      )
                    }
                  />

                  <span style={label}>Кабель-канал 16×16, м</span>
                  <input
                    style={input}
                    inputMode="decimal"
                    value={cable16Meters}
                    onChange={(e) =>
                      setCable16Meters(
                        sanitizeDecimalMetersString(e.target.value, MAX_CABLE_METERS)
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

                  <label style={row}>
                    <input
                      type="checkbox"
                      style={chk}
                      checked={Number(carryBlockCount || 0) > 0}
                      onChange={(e) => setCarryBlockCount(e.target.checked ? "1" : "0")}
                    />
                    <span>Подъём внешнего блока на плече по лестнице</span>
                  </label>

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

                  {(
                    [
                      ["Кронштейны", includeBrackets, setIncludeBrackets],
                      ["Демонтаж и монтаж стеклопакета", includeGlass, setIncludeGlass],
                      ["Демонтаж, резка и монтаж фасадной плитки", includeTile, setIncludeTile],
                      ["Монтаж дренажа в водосток", includeDrain, setIncludeDrain],
                      ["Установка и подключение дренажной помпы", includePump, setIncludePump],
                      [
                        "Подключение внешнего блока на лестнице",
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

                <div style={card}>
                  <span style={label}>Быстрая услуга</span>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
                    В расчёт сразу, без сохранения в прайс (как на сайте).
                  </p>
                  <input
                    style={input}
                    placeholder="Название услуги"
                    value={quickSvcName}
                    onChange={(e) => setQuickSvcName(e.target.value)}
                  />
                  <input
                    style={input}
                    placeholder="Цена, ₽"
                    inputMode="numeric"
                    value={quickSvcPrice}
                    onChange={(e) =>
                      setQuickSvcPrice(sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY))
                    }
                  />
                  <button type="button" style={btnSecondary} onClick={addQuickServiceToCalc}>
                    Добавить услугу
                  </button>
                  {quickCalculationExtras.length > 0 ? (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      {quickCalculationExtras.map((line) => (
                        <div
                          key={line.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            background: "#f8fafc",
                            borderRadius: 10,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{line.name}</div>
                            <div style={{ fontSize: 13, color: "#64748b" }}>
                              {formatRubles(line.price)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQuickExtraLine(line.id)}
                            style={{
                              flexShrink: 0,
                              background: "#fee2e2",
                              color: "#991b1b",
                              border: "none",
                              borderRadius: 8,
                              padding: "8px 12px",
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            Убрать
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

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
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, opacity: 0.95 }}>
                    Состав сметы
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {result.items.map((i, idx) => {
                      const title = mapMiniAppQuoteItemTitle(i.title);
                      const sign = i.amount < 0 ? "−" : "";
                      return (
                        <div
                          key={`line-${idx}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            fontSize: 14,
                            lineHeight: 1.35,
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
                          <span style={{ flexShrink: 0, fontWeight: 700 }}>
                            {sign}
                            {formatAmountRu(Math.abs(i.amount))} ₽
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.2)",
                      paddingTop: 14,
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 800 }}>
                      Итого: {formatRubles(result.total)}
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 12 }}>
                    <span style={{ ...label, color: "#e2e8f0", marginBottom: 8 }}>
                      Скидка на весь расчёт, %
                    </span>
                    <input
                      style={{
                        ...input,
                        marginBottom: 0,
                        background: "#fff",
                        color: "#0f172a",
                      }}
                      inputMode="numeric"
                      value={percentDiscount}
                      onChange={(e) =>
                        setPercentDiscount(
                          sanitizeNonNegativeIntString(e.target.value, 100)
                        )
                      }
                    />
                  </div>
                </div>

                <div id="tg-calc-client-text" style={card}>
                  <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#0f172a" }}>
                    Текст для клиента
                  </p>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
                    Отредактируйте текст перед отправкой. Кнопки ниже используют именно этот текст.
                  </p>
                  <textarea
                    value={clientQuoteUserEdited ? clientQuoteDraft : autoClientQuoteText}
                    onChange={(e) => {
                      setClientQuoteUserEdited(true);
                      setClientQuoteDraft(e.target.value);
                    }}
                    rows={14}
                    style={{
                      ...input,
                      marginBottom: 12,
                      minHeight: 220,
                      resize: "vertical",
                      fontFamily: "inherit",
                      lineHeight: 1.45,
                    }}
                  />
                  <p style={{ margin: "0 0 12px", fontWeight: 700 }}>Отправить клиенту</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button
                      type="button"
                      style={{ ...btn, padding: "14px", fontSize: 15 }}
                      onClick={() => {
                        tgHapticButtonTap();
                        const u = buildWhatsAppShareUrl(clientContact, effectiveClientQuoteText);
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
                      Отправить в Telegram
                    </button>
                    <button
                      type="button"
                      style={{ ...btn, padding: "14px", fontSize: 15 }}
                      onClick={() => {
                        tgHapticButtonTap();
                        window.location.href = buildSmsShareUrl(effectiveClientQuoteText);
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
                          await navigator.clipboard.writeText(effectiveClientQuoteText);
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
                    scrollToClientTextBlock();
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
                    Отправить в Telegram
                  </button>
                  <button
                    type="button"
                    style={{ ...btnSecondary, marginTop: 0, padding: "12px", fontSize: 14 }}
                    onClick={async () => {
                      tgHapticButtonTap();
                      try {
                        await navigator.clipboard.writeText(effectiveClientQuoteText);
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
              {ONBOARDING_STEPS[onboardingStep].title}
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 15, color: "#475569", lineHeight: 1.5 }}>
              {ONBOARDING_STEPS[onboardingStep].body}
            </p>
            <p style={{ margin: "0 0 22px", fontSize: 13, color: "#94a3b8" }}>
              {onboardingStep + 1} / {ONBOARDING_STEPS.length}
            </p>
            {onboardingStep < ONBOARDING_STEPS.length - 1 ? (
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
                Начать работу
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
