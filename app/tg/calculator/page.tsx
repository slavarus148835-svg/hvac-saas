"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { auth } from "@/lib/firebase";
import { tryAttachPartnerManagerFromStorage } from "@/lib/partner/clientAttachPartnerManager";
import {
  computeCalculatorEstimate,
  computeMultiRoomEstimate,
  createDefaultRoomDraft,
  CALCULATOR_BTU_ONLY_OPTIONS,
  CALCULATOR_CAPACITY_SELECT_OPTIONS,
  CALCULATOR_ROUGH_IN_CAPACITY,
  calculatorRouteMetersFieldLabel,
  DEFAULT_CALCULATOR_PRICES,
  flatCalculatorStateToRoomDraft,
  formatAmountRu,
  formatCapacityBtu,
  formatRubles,
  effectiveSelectedAcModelIds,
  filterAcModelLineItems,
  filterAcModelLinesFromClientQuoteText,
  isCalculatorRoughInCapacity,
  normalizeLegacyStrobaLabelsInQuoteText,
  shouldHideCalculatorAcModelsUi,
  MAX_CABLE_METERS,
  MAX_FLOORS,
  MAX_HOLES,
  MAX_MONEY,
  MAX_ROUTE_METERS,
  MAX_STROBA_METERS,
  newRoomId,
  normalizeCalculatorComputeInput,
  normalizeRoughInRouteCapacity,
  roomDraftFromFirestoreEntry,
  roomDraftToComputeInput,
  roomDraftToFlatState,
  sanitizeDecimalMetersString,
  sanitizeNonNegativeIntString,
  sanitizeNonNegativeMoneyString,
} from "@/lib/calculator";
import type { CalculatorRoomDraft } from "@/lib/calculator";
import {
  newQuickExtraId,
  type QuickCalculationExtra,
  type UserCustomService,
} from "@/lib/customServices";
import type { CalculatorPriceList, SelectedExtraServiceMap } from "@/lib/calculator";
import { CalculatorHoleFieldsSection } from "@/components/CalculatorHoleFieldsSection";
import { CalculatorRoughInRouteCapacitySelect } from "@/components/CalculatorRoughInRouteCapacitySelect";
import { CalculatorTraceOnlyModeCard } from "@/components/CalculatorTraceOnlyModeCard";
import { TgCalculatorRoomCardBound } from "@/app/tg/calculator/TgCalculatorRoomCard";
import { CALCULATOR_ROUGH_IN_LABEL_RU } from "@/lib/calculator/roughInMode";
import { buildWhatsAppShareUrl } from "@/lib/shareQuote";
import { copyQuoteThenOpenTelegramClient } from "@/lib/telegramClientContact";
import {
  buildTelegramMiniAppClientQuoteText,
  mapMiniAppQuoteItemTitle,
} from "@/lib/telegramMiniAppQuoteText";
import { stripClientIdentityLinesFromPublicQuote } from "@/lib/clientQuotePublicSanitize";
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
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import { TgMiniAppLegalFooter } from "@/components/tg/TgMiniAppLegalFooter";
import { TgProtectedMiniApp } from "@/components/tg/TgProtectedMiniApp";
import { TgChannelPromoCard } from "@/components/tg/TgChannelPromoCard";
import { isTgChannelPromoDismissed } from "@/lib/tgChannelPromo";
import type { MiniAppCalculatorTextSettings } from "@/lib/telegramMiniAppCalculatorApi";
const CALC_HELP_DISMISSED_KEY = "hvac_tg_calc_help_dismissed";

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
  lineHeight: 1.35,
  wordBreak: "break-word",
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
  | "need_email_linking"
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
  const [emailLinkInitData, setEmailLinkInitData] = useState("");

  const [calcPhase, setCalcPhase] = useState<CalcPhase>("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [prices, setPrices] = useState<CalculatorPriceList>(DEFAULT_CALCULATOR_PRICES);
  const [giftRouteMeters, setGiftRouteMeters] = useState(1);
  const [models, setModels] = useState<{ id: string; name: string; price: number }[]>([]);
  const [customServices, setCustomServices] = useState<UserCustomService[]>([]);

  const [capacity, setCapacity] = useState("12");
  const [roughInRouteCapacity, setRoughInRouteCapacity] = useState("12");
  const [mountType, setMountType] = useState<"standard" | "existing">("standard");
  const [routeMeters, setRouteMeters] = useState("0");
  const [baseWallType, setBaseWallType] = useState<"normal" | "arm">("normal");
  const [extraHolesNormal, setExtraHolesNormal] = useState("0");
  const [extraHolesArm, setExtraHolesArm] = useState("0");
  const [roughInHolesBrick, setRoughInHolesBrick] = useState("0");
  const [roughInHolesArmConcrete, setRoughInHolesArmConcrete] = useState("0");
  const [carryToolFloors, setCarryToolFloors] = useState("0");
  const [carryBlockCount, setCarryBlockCount] = useState("0");
  const [manualDismantlingCost, setManualDismantlingCost] = useState("0");
  const [strobaType, setStrobaType] = useState<"none" | "brick" | "concrete">("none");
  const [strobaMeters, setStrobaMeters] = useState("0");
  const [strobaDrainType, setStrobaDrainType] = useState<"none" | "brick" | "concrete">(
    "none"
  );
  const [strobaDrainMeters, setStrobaDrainMeters] = useState("0");
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
  const [showChannelPromoAfterSave, setShowChannelPromoAfterSave] = useState(false);
  const [quickCalculationExtras, setQuickCalculationExtras] = useState<
    QuickCalculationExtra[]
  >([]);
  const [multiRoomEnabled, setMultiRoomEnabled] = useState(false);
  const lastBtuCapacityRef = useRef("12");
  const traceOnlyMode = isCalculatorRoughInCapacity(capacity);

  useEffect(() => {
    if (traceOnlyMode) {
      setSelectedAcModelIds([]);
      setModelPick("");
    }
  }, [traceOnlyMode]);

  const [roomDrafts, setRoomDrafts] = useState<CalculatorRoomDraft[]>(() => [
    createDefaultRoomDraft("Комната 1"),
  ]);

  const hideAcModelsUi = useMemo(
    () =>
      shouldHideCalculatorAcModelsUi({
        singleRoomTraceOnly: traceOnlyMode,
        multiRoomEnabled,
        roomCapacities: roomDrafts.map((r) => r.capacity),
      }),
    [traceOnlyMode, multiRoomEnabled, roomDrafts]
  );
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [modelPickByRoom, setModelPickByRoom] = useState<Record<string, string>>({});
  const [quickSvcName, setQuickSvcName] = useState("");
  const [quickSvcPrice, setQuickSvcPrice] = useState("");
  const [modelFormOpen, setModelFormOpen] = useState(false);
  const [newMdlName, setNewMdlName] = useState("");
  const [newMdlBtu, setNewMdlBtu] = useState<string>("12");
  const [newMdlPrice, setNewMdlPrice] = useState("");
  const [newMdlComment, setNewMdlComment] = useState("");
  const [modelAddBusy, setModelAddBusy] = useState(false);
  const [clientQuoteUserEdited, setClientQuoteUserEdited] = useState(false);
  const [clientQuoteDraft, setClientQuoteDraft] = useState("");
  const [calcHelpVisible, setCalcHelpVisible] = useState(false);
  const [textSettings, setTextSettings] = useState<MiniAppCalculatorTextSettings>({
    quoteFooterTemplate: "",
    guaranteeText: "",
    masterContact: "",
  });
  const modelPickRef = useRef("");
  const modelPickByRoomRef = useRef<Record<string, string>>({});
  const expandedRoomIdRef = useRef<string | null>(null);
  const historyLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    modelPickRef.current = modelPick;
    modelPickByRoomRef.current = modelPickByRoom;
    expandedRoomIdRef.current = expandedRoomId;
  }, [modelPick, modelPickByRoom, expandedRoomId]);

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
        } else if (resolved.status === "pending_email_registration") {
          window.location.assign("/tg/register");
          return;
        } else if (resolved.status === "need_email_linking") {
          if (resolved.initData) {
            setAuthUi("need_email_linking");
            setEmailLinkInitData(resolved.initData);
          } else {
            setAuthUi("need_registration");
            setEmailLinkInitData("");
          }
          setAuthError(null);
          setCalcPhase("ready");
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
        } else if (resolved.status === "pending_email_registration") {
          window.location.assign("/tg/register");
          return;
        } else if (resolved.status === "need_email_linking") {
          if (resolved.initData) {
            setAuthUi("need_email_linking");
            setEmailLinkInitData(resolved.initData);
          } else {
            setAuthUi("need_registration");
            setEmailLinkInitData("");
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
    if (authUi !== "profile" || !profile?.uid) return;
    const uid = profile.uid;
    void tryAttachPartnerManagerFromStorage(
      uid,
      async () => {
        const m = getMiniAppSessionToken();
        if (m?.trim()) return m.trim();
        const u = auth.currentUser;
        if (!u) return "";
        return u.getIdToken();
      },
      "telegram_miniapp"
    );
  }, [authUi, profile?.uid]);

  useEffect(() => {
    if (inTelegram !== true || !ready) return;
    try {
      if (typeof localStorage === "undefined") return;
      if (localStorage.getItem(CALC_HELP_DISMISSED_KEY) === "1") return;
      queueMicrotask(() => {
        setCalcHelpVisible(true);
      });
    } catch {
      /* */
    }
  }, [inTelegram, ready]);

  useEffect(() => {
    queueMicrotask(() => {
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
    });
  }, [customServices]);

  useEffect(() => {
    if (!multiRoomEnabled) return;
    queueMicrotask(() => {
      setRoomDrafts((prev) =>
        prev.map((r) => {
          const next: SelectedExtraServiceMap = { ...r.selectedExtraServices };
          for (const s of customServices) {
            if (!next[s.id]) next[s.id] = { checked: false, qty: "1" };
          }
          const allowed = new Set(customServices.map((s) => s.id));
          for (const k of Object.keys(next)) {
            if (!allowed.has(k)) delete next[k];
          }
          return { ...r, selectedExtraServices: next };
        })
      );
    });
  }, [customServices, multiRoomEnabled]);

  useEffect(() => {
    if (!multiRoomEnabled) return;
    if (!roomDrafts.length) return;
    if (!expandedRoomId || !roomDrafts.some((r) => r.id === expandedRoomId)) {
      queueMicrotask(() => {
        setExpandedRoomId(roomDrafts[0]!.id);
      });
    }
  }, [multiRoomEnabled, roomDrafts, expandedRoomId]);

  const singleResult = useMemo(() => {
    return computeCalculatorEstimate(
      prices,
      normalizeCalculatorComputeInput({
        capacity,
        roughInRouteCapacity,
        mountType,
        routeMeters,
        baseWallType,
        extraHolesNormal,
        extraHolesArm,
        roughInHolesBrick,
        roughInHolesArmConcrete,
        carryToolFloors,
        carryBlockCount,
        manualDismantlingCost,
        strobaType,
        strobaMeters,
        strobaDrainType,
        strobaDrainMeters,
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
      })
    );
  }, [
    prices,
    capacity,
    roughInRouteCapacity,
    mountType,
    routeMeters,
    baseWallType,
    extraHolesNormal,
    extraHolesArm,
    roughInHolesBrick,
    roughInHolesArmConcrete,
    carryToolFloors,
    carryBlockCount,
    manualDismantlingCost,
    strobaType,
    strobaMeters,
    strobaDrainType,
    strobaDrainMeters,
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

  const multiEstimate = useMemo(() => {
    if (!multiRoomEnabled || roomDrafts.length === 0) return null;
    const rooms = roomDrafts.map((d) => ({
      id: d.id,
      roomName: d.roomName,
      input: normalizeCalculatorComputeInput(
        roomDraftToComputeInput(d, {
          giftRouteMeters,
          acModels: models,
          pricelistCustomServices: customServices,
        })
      ),
    }));
    return computeMultiRoomEstimate(prices, rooms, percentDiscount, formatRubles);
  }, [
    multiRoomEnabled,
    roomDrafts,
    prices,
    percentDiscount,
    giftRouteMeters,
    models,
    customServices,
  ]);

  const displayResult = useMemo(() => {
    if (multiRoomEnabled && multiEstimate) {
      return { items: multiEstimate.flatItems, total: multiEstimate.total };
    }
    return {
      ...singleResult,
      items: filterAcModelLineItems(singleResult.items, capacity),
    };
  }, [multiRoomEnabled, multiEstimate, singleResult, capacity]);

  const roomSubtotalById = useMemo(() => {
    const m = new Map<string, number>();
    if (multiEstimate) {
      for (const rr of multiEstimate.rooms) {
        m.set(rr.id, rr.subtotal);
      }
    }
    return m;
  }, [multiEstimate]);

  const autoClientQuoteText = useMemo(() => {
    let t: string;
    if (multiRoomEnabled && multiEstimate) {
      t = multiEstimate.autoClientText;
    } else {
      t = buildTelegramMiniAppClientQuoteText({
        capacity,
        mountType,
        items: filterAcModelLineItems(singleResult.items, capacity).map((i) => ({
          title: i.title,
          amount: i.amount,
        })),
        total: singleResult.total,
      });
    }
    const tail: string[] = [];
    if (textSettings.guaranteeText.trim()) tail.push(textSettings.guaranteeText.trim());
    if (textSettings.masterContact.trim()) {
      tail.push(`Мастер: ${textSettings.masterContact.trim()}`);
    }
    if (textSettings.quoteFooterTemplate.trim()) {
      tail.push(textSettings.quoteFooterTemplate.trim());
    }
    if (tail.length) t = `${t}\n\n${tail.join("\n\n")}`;
    return normalizeLegacyStrobaLabelsInQuoteText(t);
  }, [
    multiRoomEnabled,
    multiEstimate,
    capacity,
    mountType,
    singleResult.items,
    singleResult.total,
    textSettings.guaranteeText,
    textSettings.masterContact,
    textSettings.quoteFooterTemplate,
  ]);

  const effectiveClientQuoteText = useMemo(() => {
    if (!clientQuoteUserEdited) return autoClientQuoteText;
    return clientQuoteDraft.trim() || autoClientQuoteText;
  }, [clientQuoteUserEdited, clientQuoteDraft, autoClientQuoteText]);

  const publicClientQuoteText = useMemo(
    () => stripClientIdentityLinesFromPublicQuote(effectiveClientQuoteText),
    [effectiveClientQuoteText]
  );

  const showCalculatorForm =
    authUi === "profile" &&
    calcPhase === "ready" &&
    Boolean(profile) &&
    ((inTelegram === true && ready) ||
      (inTelegram === false && ready));

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
      const roomsRaw = docRaw.multiRoom === true && Array.isArray(docRaw.rooms) ? docRaw.rooms : null;
      const draftsFromHistory =
        roomsRaw?.map(roomDraftFromFirestoreEntry).filter((x): x is CalculatorRoomDraft => Boolean(x)) ??
        [];
      const isMultiDoc = Boolean(draftsFromHistory.length);
      const savedClientText =
        typeof docRaw.clientText === "string" ? docRaw.clientText.trim() : "";

      const h = hydrateTgCalculatorFromHistoryDoc(doc);
      if (h.capacity != null) setCapacity(h.capacity);
      if (h.roughInRouteCapacity != null) setRoughInRouteCapacity(h.roughInRouteCapacity);
      if (h.mountType) setMountType(h.mountType);
      if (h.routeMeters != null) setRouteMeters(h.routeMeters);
      if (h.baseWallType) setBaseWallType(h.baseWallType);
      if (h.extraHolesNormal != null) setExtraHolesNormal(h.extraHolesNormal);
      if (h.extraHolesArm != null) setExtraHolesArm(h.extraHolesArm);
      if (h.roughInHolesBrick != null) setRoughInHolesBrick(h.roughInHolesBrick);
      if (h.roughInHolesArmConcrete != null) setRoughInHolesArmConcrete(h.roughInHolesArmConcrete);
      if (h.carryToolFloors != null) setCarryToolFloors(h.carryToolFloors);
      if (h.carryBlockCount != null) setCarryBlockCount(h.carryBlockCount);
      if (h.manualDismantlingCost != null) setManualDismantlingCost(h.manualDismantlingCost);
      if (h.strobaType) setStrobaType(h.strobaType);
      if (h.strobaMeters != null) setStrobaMeters(h.strobaMeters);
      if (h.strobaDrainType) setStrobaDrainType(h.strobaDrainType);
      if (h.strobaDrainMeters != null) setStrobaDrainMeters(h.strobaDrainMeters);
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
      if (isMultiDoc) {
        setMultiRoomEnabled(true);
        setRoomDrafts(draftsFromHistory);
        setExpandedRoomId(draftsFromHistory[0]!.id);
        setModelPickByRoom({});
        if (savedClientText) {
          setClientQuoteUserEdited(true);
          setClientQuoteDraft(normalizeLegacyStrobaLabelsInQuoteText(savedClientText));
        } else {
          setClientQuoteUserEdited(false);
          setClientQuoteDraft("");
        }
      } else {
        setMultiRoomEnabled(false);
        if (savedClientText) {
          setClientQuoteUserEdited(true);
          const capForQuote =
            typeof h.capacity === "string" ? h.capacity : CALCULATOR_ROUGH_IN_CAPACITY;
          setClientQuoteDraft(
            normalizeLegacyStrobaLabelsInQuoteText(
              filterAcModelLinesFromClientQuoteText(savedClientText, capForQuote)
            )
          );
        } else {
          setClientQuoteUserEdited(false);
          setClientQuoteDraft("");
        }
      }
      tgHapticNotification("success");
    })();
    return () => {
      cancelled = true;
    };
  }, [calcPhase, authUi]);

  const setTraceOnlyMode = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        if (!isCalculatorRoughInCapacity(capacity)) {
          lastBtuCapacityRef.current = capacity;
        }
        setRoughInRouteCapacity(
          normalizeRoughInRouteCapacity(
            isCalculatorRoughInCapacity(capacity) ? roughInRouteCapacity : capacity
          )
        );
        setCapacity(CALCULATOR_ROUGH_IN_CAPACITY);
        setSelectedAcModelIds([]);
      } else {
        const restore = lastBtuCapacityRef.current;
        setCapacity(
          restore && !isCalculatorRoughInCapacity(restore) ? restore : "12"
        );
      }
    },
    [capacity, roughInRouteCapacity]
  );

  const patchRoom = useCallback((roomId: string, patch: Partial<CalculatorRoomDraft>) => {
    setRoomDrafts((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const merged = { ...r, ...patch };
        if (patch.capacity === CALCULATOR_ROUGH_IN_CAPACITY) {
          if (!isCalculatorRoughInCapacity(r.capacity)) {
            merged.roughInRouteCapacity = normalizeRoughInRouteCapacity(r.capacity);
          }
        }
        merged.selectedAcModelIds = effectiveSelectedAcModelIds(
          merged.capacity,
          merged.selectedAcModelIds
        );
        return merged;
      })
    );
  }, []);

  function applyFirstRoomToFlatForm(d: CalculatorRoomDraft) {
    const f = roomDraftToFlatState(d);
    setCapacity(f.capacity);
    setRoughInRouteCapacity(f.roughInRouteCapacity);
    setMountType(f.mountType);
    setRouteMeters(f.routeMeters);
    setBaseWallType(f.baseWallType);
    setExtraHolesNormal(f.extraHolesNormal);
    setExtraHolesArm(f.extraHolesArm);
    setRoughInHolesBrick(f.roughInHolesBrick);
    setRoughInHolesArmConcrete(f.roughInHolesArmConcrete);
    setCarryToolFloors(f.carryToolFloors);
    setCarryBlockCount(f.carryBlockCount);
    setManualDismantlingCost(f.manualDismantlingCost);
    setStrobaType(f.strobaType);
    setStrobaMeters(f.strobaMeters);
    setStrobaDrainType(f.strobaDrainType);
    setStrobaDrainMeters(f.strobaDrainMeters);
    setCable40Meters(f.cable40Meters);
    setCable16Meters(f.cable16Meters);
    setBuyAcAndRouteFromUs(f.buyAcAndRouteFromUs);
    setIncludeBrackets(f.includeBrackets);
    setIncludeGlass(f.includeGlass);
    setIncludeTile(f.includeTile);
    setIncludeDrain(f.includeDrain);
    setIncludePump(f.includePump);
    setIncludeLadderConnection(f.includeLadderConnection);
    setSelectedAcModelIds([...f.selectedAcModelIds]);
    setSelectedExtraServices(
      JSON.parse(JSON.stringify(f.selectedExtraServices)) as SelectedExtraServiceMap
    );
    setQuickCalculationExtras(f.quickCalculationExtras.map((x) => ({ ...x })));
  }

  function setMultiRoomMode(next: boolean) {
    tgHapticButtonTap();
    if (next) {
      const seed = flatCalculatorStateToRoomDraft({
        roomName: "Комната 1",
        capacity,
        roughInRouteCapacity,
        mountType,
        routeMeters,
        baseWallType,
        extraHolesNormal,
        extraHolesArm,
        roughInHolesBrick,
        roughInHolesArmConcrete,
        carryToolFloors,
        carryBlockCount,
        manualDismantlingCost,
        strobaType,
        strobaMeters,
        strobaDrainType,
        strobaDrainMeters,
        cable40Meters,
        cable16Meters,
        buyAcAndRouteFromUs,
        includeBrackets,
        includeGlass,
        includeTile,
        includeDrain,
        includePump,
        includeLadderConnection,
        selectedAcModelIds,
        selectedExtraServices,
        quickCalculationExtras,
      });
      setRoomDrafts([seed]);
      setExpandedRoomId(seed.id);
      setModelPickByRoom({});
      setMultiRoomEnabled(true);
    } else {
      const first = roomDrafts[0];
      if (first) applyFirstRoomToFlatForm(first);
      setMultiRoomEnabled(false);
    }
  }

  function addEmptyRoom() {
    tgHapticButtonTap();
    setRoomDrafts((prev) => {
      const next = [...prev, createDefaultRoomDraft(`Комната ${prev.length + 1}`)];
      setExpandedRoomId(next[next.length - 1]!.id);
      return next;
    });
  }

  function duplicateRoom(roomId: string) {
    setRoomDrafts((prev) => {
      const idx = prev.findIndex((r) => r.id === roomId);
      const src = prev[idx];
      if (!src) return prev;
      const baseName = (src.roomName || "Комната").trim() || "Комната";
      const copy: CalculatorRoomDraft = {
        ...src,
        id: newRoomId(),
        roomName: `Копия ${baseName}`,
        selectedAcModelIds: [...src.selectedAcModelIds],
        selectedExtraServices: JSON.parse(JSON.stringify(src.selectedExtraServices)) as SelectedExtraServiceMap,
        quickCalculationExtras: src.quickCalculationExtras.map((x) => ({
          ...x,
          id: newQuickExtraId(),
        })),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      setExpandedRoomId(copy.id);
      return next;
    });
  }

  function removeRoom(roomId: string) {
    setRoomDrafts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== roomId);
    });
  }

  function removeModelFromRoom(roomId: string, modelId: string) {
    tgHapticButtonTap();
    setRoomDrafts((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? { ...r, selectedAcModelIds: r.selectedAcModelIds.filter((x) => x !== modelId) }
          : r
      )
    );
  }

  function collapsedModelSummary(draft: CalculatorRoomDraft): string {
    if (isCalculatorRoughInCapacity(draft.capacity)) {
      return CALCULATOR_ROUGH_IN_LABEL_RU;
    }
    if (!draft.selectedAcModelIds.length) return "Модель не выбрана";
    const parts: string[] = [];
    for (const id of draft.selectedAcModelIds) {
      const m = models.find((x) => x.id === id);
      parts.push(m ? `${m.name} — ${formatRubles(m.price)}` : id);
    }
    return parts.join(" · ");
  }

  function addModel() {
    tgHapticButtonTap();
    if (multiRoomEnabled) return;
    const pick = modelPickRef.current;
    if (!pick || selectedAcModelIds.includes(pick)) return;
    setSelectedAcModelIds((x) => [...x, pick]);
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
    if (multiRoomEnabled) {
      const rid = expandedRoomIdRef.current ?? roomDrafts[0]?.id;
      if (rid) {
        setRoomDrafts((prev) =>
          prev.map((r) =>
            r.id === rid && !r.selectedAcModelIds.includes(id)
              ? { ...r, selectedAcModelIds: [...r.selectedAcModelIds, id] }
              : r
          )
        );
      }
    } else {
      setSelectedAcModelIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
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
      roughInRouteCapacity,
      mountType,
      routeMeters,
      baseWallType,
      extraHolesNormal,
      extraHolesArm,
      roughInHolesBrick,
      roughInHolesArmConcrete,
      carryToolFloors,
      carryBlockCount,
      manualDismantlingCost,
      strobaType,
      strobaMeters,
      strobaDrainType,
      strobaDrainMeters,
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
      selectedAcModelIds: multiRoomEnabled
        ? roomDrafts[0]?.selectedAcModelIds ?? []
        : selectedAcModelIds,
      selectedExtraServices: multiRoomEnabled
        ? roomDrafts[0]?.selectedExtraServices ?? {}
        : selectedExtraServices,
      quickCalculationExtras: multiRoomEnabled
        ? roomDrafts[0]?.quickCalculationExtras ?? []
        : quickCalculationExtras,
      clientName,
      clientContact,
    };
    if (multiRoomEnabled && roomDrafts.length > 0) {
      payload.rooms = roomDrafts.map((d) => ({
        id: d.id,
        roomName: d.roomName,
        input: roomDraftToComputeInput(d, {
          giftRouteMeters,
          acModels: models,
          pricelistCustomServices: customServices,
        }),
      }));
    }
    const r = await saveMiniAppCalculation(payload);
    setSaveBusy(false);
    if (r.ok) {
      tgHapticNotification("success");
      setSaveToast(`Сохранено. Итого ${formatRubles(r.total)}`);
      if (!isTgChannelPromoDismissed()) {
        setShowChannelPromoAfterSave(true);
      }
    } else {
      tgHapticNotification("error");
      setSaveToast(r.error);
    }
    window.setTimeout(() => setSaveToast(null), 4000);
  }

  async function shareTelegramNative() {
    tgHapticButtonTap();
    const wa = window.Telegram?.WebApp;
    const result = await copyQuoteThenOpenTelegramClient({
      clientContact: clientContact.trim(),
      quoteText: publicClientQuoteText,
      telegramWebApp: wa ?? null,
    });
    if (result.kind === "opened_username") {
      tgHapticNotification("success");
    } else if (result.kind === "phone_only") {
      tgHapticNotification("warning");
    } else {
      tgHapticNotification("error");
    }
    setSaveToast(result.userMessage);
    window.setTimeout(() => setSaveToast(null), 5000);
  }

  function scrollToTotalBlock() {
    tgHapticButtonTap();
    document.getElementById("tg-calc-total-anchor")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function scrollToSendBlock() {
    tgHapticButtonTap();
    document.getElementById("tg-calc-send-anchor")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  return (
    <TgProtectedMiniApp>
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
        {ready && authUi === "profile" && calcPhase === "ready" ? <TgMiniAppNav /> : null}

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

            {inTelegram === true && authUi === "need_email_linking" && emailLinkInitData ? (
              <div style={{ ...card, marginBottom: 12 }}>
                <TgMiniAppEmailLink
                  initData={emailLinkInitData}
                  onLinked={async (p) => {
                    setProfile(p);
                    setAuthUi("profile");
                    setAuthError(null);
                    setCalcPhase("loading_context");
                    const ctx = await fetchMiniAppCalculatorContext();
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
                  }}
                />
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
                  Нет аккаунта?{" "}
                  <Link href="/register" style={{ color: "#0f172a", fontWeight: 600 }}>
                    Регистрация на сайте
                  </Link>
                </p>
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

            {inTelegram === false &&
            (authUi === "need_registration" || authUi === "need_email_linking") ? (
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
                {!hideAcModelsUi ? (
                <div style={card}>
                  <span style={label}>Модели кондиционеров из прайса</span>
                  {models.length === 0 ? (
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
                      Пока нет моделей — добавьте кнопкой ниже.
                    </p>
                  ) : null}
                  {!multiRoomEnabled && !traceOnlyMode ? (
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <select
                        style={{ ...input, flex: 1, marginBottom: 0 }}
                        value={modelPick}
                        onChange={(e) => setModelPick(e.target.value)}
                        disabled={models.length === 0}
                      >
                        <option value="">Выберите</option>
                        {models.map((m) => (
                          <option key={m.id} value={m.id} disabled={selectedAcModelIds.includes(m.id)}>
                            {m.name} — {formatRubles(m.price)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={{ ...btn, width: "auto", padding: "12px 16px" }}
                        onClick={addModel}
                        disabled={models.length === 0 || !modelPick}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: "0 0 12px",
                        fontSize: 13,
                        color: "#64748b",
                        lineHeight: 1.45,
                      }}
                    >
                      Модель кондиционера для сметы выбирается только в карточке каждой комнаты ниже.
                    </p>
                  )}
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
                        {CALCULATOR_BTU_ONLY_OPTIONS.map((c) => (
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
                  {!multiRoomEnabled && !traceOnlyMode && selectedAcModelIds.length > 0 ? (
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
                ) : null}

                <label
                  style={{
                    ...card,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ ...chk, width: 24, height: 24, flexShrink: 0 }}
                    checked={multiRoomEnabled}
                    onChange={(e) => setMultiRoomMode(e.target.checked)}
                  />
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                    Расчёт по нескольким комнатам
                  </span>
                </label>

                {multiRoomEnabled ? (
                  <>
                    {roomDrafts.map((d) => (
                      <TgCalculatorRoomCardBound
                        key={d.id}
                        draft={d}
                        expanded={expandedRoomId === d.id}
                        roomSubtotal={roomSubtotalById.get(d.id) ?? 0}
                        collapsedModelLine={collapsedModelSummary(d)}
                        models={models}
                        customServices={customServices}
                        giftRouteMeters={giftRouteMeters}
                        canRemove={roomDrafts.length > 1}
                        modelPick={modelPickByRoom[d.id] ?? ""}
                        onModelPickChange={(v) =>
                          setModelPickByRoom((m) => ({ ...m, [d.id]: v }))
                        }
                        onAddPickedModel={() => {
                          const roomId = d.id;
                          tgHapticButtonTap();
                          setRoomDrafts((prev) => {
                            const pick = modelPickByRoomRef.current[roomId] ?? "";
                            if (!pick) return prev;
                            return prev.map((r) => {
                              if (r.id !== roomId) return r;
                              if (r.selectedAcModelIds.includes(pick)) return r;
                              return { ...r, selectedAcModelIds: [...r.selectedAcModelIds, pick] };
                            });
                          });
                          setModelPickByRoom((m) => ({ ...m, [roomId]: "" }));
                        }}
                        onRemoveModelFromRoom={(modelId) => removeModelFromRoom(d.id, modelId)}
                        onToggle={() => {
                          tgHapticButtonTap();
                          setExpandedRoomId(d.id);
                        }}
                        onPatchRoom={patchRoom}
                        onDuplicate={() => duplicateRoom(d.id)}
                        onRemoveRoom={() => removeRoom(d.id)}
                      />
                    ))}
                    <button
                      type="button"
                      style={{ ...btnSecondary, marginBottom: 16 }}
                      onClick={addEmptyRoom}
                    >
                      + Комната
                    </button>
                  </>
                ) : null}

                {!multiRoomEnabled ? (
                  <>
                <CalculatorTraceOnlyModeCard
                  variant="miniapp"
                  checked={traceOnlyMode}
                  onCheckedChange={setTraceOnlyMode}
                />
                {traceOnlyMode ? (
                  <CalculatorRoughInRouteCapacitySelect
                    variant="miniapp"
                    value={roughInRouteCapacity}
                    onChange={setRoughInRouteCapacity}
                  />
                ) : null}
                <div style={card}>
                  {!traceOnlyMode ? (
                    <>
                  <span style={label}>Мощность BTU</span>
                  <select
                    style={input}
                    value={
                      isCalculatorRoughInCapacity(capacity) ? "12" : capacity
                    }
                    onChange={(e) => setCapacity(e.target.value)}
                    aria-label="Выберите мощность BTU"
                  >
                    {CALCULATOR_CAPACITY_SELECT_OPTIONS.map((v) => (
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
                    </>
                  ) : null}

                  <span style={label}>
                    {calculatorRouteMetersFieldLabel(capacity, giftRouteMeters)}
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

                  <CalculatorHoleFieldsSection
                    roughIn={traceOnlyMode}
                    baseWallType={baseWallType}
                    extraHolesNormal={extraHolesNormal}
                    extraHolesArm={extraHolesArm}
                    roughInHolesBrick={roughInHolesBrick}
                    roughInHolesArmConcrete={roughInHolesArmConcrete}
                    onPatch={(patch) => {
                      if (patch.baseWallType != null) setBaseWallType(patch.baseWallType);
                      if (patch.extraHolesNormal != null)
                        setExtraHolesNormal(patch.extraHolesNormal);
                      if (patch.extraHolesArm != null) setExtraHolesArm(patch.extraHolesArm);
                      if (patch.roughInHolesBrick != null)
                        setRoughInHolesBrick(patch.roughInHolesBrick);
                      if (patch.roughInHolesArmConcrete != null)
                        setRoughInHolesArmConcrete(patch.roughInHolesArmConcrete);
                    }}
                    variant="miniapp"
                  />

                  <span style={label}>Основная штроба — материал</span>
                  <select
                    style={input}
                    value={strobaType}
                    onChange={(e) =>
                      setStrobaType(e.target.value as "none" | "brick" | "concrete")
                    }
                  >
                    <option value="none">Нет</option>
                    <option value="brick">Кирпич/газоблок</option>
                    <option value="concrete">Бетон</option>
                  </select>
                  <span style={label}>Основная штроба, м</span>
                  <input
                    style={input}
                    inputMode="decimal"
                    placeholder="Метры"
                    value={strobaMeters}
                    onChange={(e) =>
                      setStrobaMeters(
                        sanitizeDecimalMetersString(e.target.value, MAX_STROBA_METERS)
                      )
                    }
                  />
                  <span style={label}>Штроба под дренаж/кабель — материал</span>
                  <select
                    style={input}
                    value={strobaDrainType}
                    onChange={(e) =>
                      setStrobaDrainType(e.target.value as "none" | "brick" | "concrete")
                    }
                  >
                    <option value="none">Нет</option>
                    <option value="brick">Кирпич/газоблок</option>
                    <option value="concrete">Бетон</option>
                  </select>
                  <span style={label}>Штроба под дренаж/кабель, м</span>
                  <input
                    style={input}
                    inputMode="decimal"
                    placeholder="Метры"
                    value={strobaDrainMeters}
                    onChange={(e) =>
                      setStrobaDrainMeters(
                        sanitizeDecimalMetersString(e.target.value, MAX_STROBA_METERS)
                      )
                    }
                  />

                  <span style={label}>Кабель-канал 40×40, м, мин. 1 м</span>
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

                  <span style={label}>Кабель-канал 16×16, м, мин. 1 м</span>
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

                  <span style={label}>Подъём инструмента (начиная с 3 этажа)</span>
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
                      [
                        "Подъём кондиционера на плече по лестнице",
                        Number(carryBlockCount || 0) > 0,
                        (v: boolean) => setCarryBlockCount(v ? "1" : "0"),
                      ],
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
                    <span>Скидка при покупке кондиционера и трассы у нас (1000 ₽)</span>
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
                </>
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
                    {!multiRoomEnabled && traceOnlyMode ? (
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          lineHeight: 1.35,
                        }}
                      >
                        {CALCULATOR_ROUGH_IN_LABEL_RU}
                      </div>
                    ) : null}
                    {displayResult.items.map((i, idx) => {
                      const title = mapMiniAppQuoteItemTitle(i.title);
                      const hideAmount =
                        title === CALCULATOR_ROUGH_IN_LABEL_RU && i.amount === 0;
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
                          {hideAmount ? null : (
                            <span style={{ flexShrink: 0, fontWeight: 700 }}>
                              {formatAmountRu(Math.abs(i.amount))} ₽
                            </span>
                          )}
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
                      Итого: {formatRubles(displayResult.total)}
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
                  <div id="tg-calc-send-anchor">
                    <p style={{ margin: "0 0 12px", fontWeight: 700 }}>Отправить клиенту</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button
                      type="button"
                      style={{ ...btn, padding: "14px", fontSize: 15 }}
                      onClick={() => {
                        tgHapticButtonTap();
                        const u = buildWhatsAppShareUrl(clientContact, publicClientQuoteText);
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
                      style={{ ...btnSecondary, padding: "14px", fontSize: 15, marginTop: 0, gridColumn: "1 / -1" }}
                      onClick={async () => {
                        tgHapticButtonTap();
                        try {
                          await navigator.clipboard.writeText(publicClientQuoteText);
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
                </div>

                {showChannelPromoAfterSave && !isTgChannelPromoDismissed() ? (
                  <TgChannelPromoCard
                    style={{ marginTop: 16, marginBottom: 0 }}
                    onDismiss={() => setShowChannelPromoAfterSave(false)}
                  />
                ) : null}

                {saveToast ? (
                  <p style={{ ...text, textAlign: "center", marginTop: 8 }}>{saveToast}</p>
                ) : null}
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
                {multiRoomEnabled ? `Итого: ${formatRubles(displayResult.total)}` : formatRubles(displayResult.total)}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  style={{
                    ...btn,
                    padding: "12px 6px",
                    fontSize: 13,
                    opacity: canOperate ? 1 : 0.45,
                  }}
                  disabled={saveBusy || !canOperate}
                  onClick={() => void onSave()}
                >
                  {saveBusy ? "…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  style={{ ...btnSecondary, padding: "12px 6px", fontSize: 13, marginTop: 0 }}
                  onClick={scrollToSendBlock}
                >
                  Отправить
                </button>
                <button
                  type="button"
                  style={{ ...btnSecondary, padding: "12px 6px", fontSize: 13, marginTop: 0 }}
                  onClick={scrollToTotalBlock}
                >
                  Итог
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {ready && inTelegram === true && authUi === "profile" ? (
          <TgMiniAppLegalFooter />
        ) : null}
      </div>
    </>
    </TgProtectedMiniApp>
  );
}
