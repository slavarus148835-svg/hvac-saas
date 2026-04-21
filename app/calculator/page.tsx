"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  newQuickExtraId,
  parseCustomServicesFromPriceDoc,
  type QuickCalculationExtra,
  type UserCustomService,
} from "@/lib/customServices";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import { ensureTrialStartedOnFirstCalculation } from "@/lib/trialSubscription";
import { withFeatureGuard } from "@/lib/withFeatureGuard";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";
import { mergeNumericPriceDocument } from "@/lib/mergeNumericPriceDocument";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

type PriceList = {
  standard_7: number;
  standard_9: number;
  standard_12: number;
  standard_18: number;
  standard_24: number;
  standard_30: number;
  standard_36: number;

  existing_7: number;
  existing_9: number;
  existing_12: number;
  existing_18: number;
  existing_24: number;
  existing_30: number;
  existing_36: number;

  route_7: number;
  route_9: number;
  route_12: number;
  route_18: number;
  route_24: number;
  route_30: number;
  route_36: number;

  baseArmConcreteSurcharge: number;
  extraHoleNormal: number;
  extraHoleArm: number;

  stroba_brick_small: number;
  stroba_brick_big: number;
  stroba_concrete_small: number;
  stroba_concrete_big: number;

  cable40: number;
  cable16: number;

  bracketsAndFasteners: number;
  dismantlingOldUnit: number;
  glassUnitWork: number;
  facadeTileCut: number;
  drainageToGutter: number;
  drainPumpInstall: number;
  outdoorConnectionLadder: number;
  floorCarryTools: number;
  outdoorBlockCarry: number;
};

type SelectedExtraServiceMap = Record<
  string,
  {
    checked: boolean;
    qty: string;
  }
>;

type HistoryCalcDoc = {
  id?: string;
  uid: string;
  createdAt: string;
  updatedAt?: string;
  capacity: string;
  total: number;
  clientName?: string;
  clientContact?: string;
  clientText: string;
  editableTailText?: string;

  mountType?: "standard" | "existing";
  routeMeters?: string;
  baseWallType?: "normal" | "arm";
  extraHolesNormal?: string;
  extraHolesArm?: string;
  carryToolFloors?: string;
  carryBlockCount?: string;
  manualDismantlingCost?: string;

  strobaType?: "none" | "brick" | "concrete";
  strobaMeters?: string;
  cable40Meters?: string;
  cable16Meters?: string;

  buyAcAndRouteFromUs?: boolean;
  includeBrackets?: boolean;
  includeGlass?: boolean;
  includeTile?: boolean;
  includeDrain?: boolean;
  includePump?: boolean;
  includeLadderConnection?: boolean;

  percentDiscount?: string;
  selectedExtraServices?: SelectedExtraServiceMap;
  /** Быстрые строки только в этом расчёте (не из прайса). */
  quickCalculationExtras?: QuickCalculationExtra[];
  giftRouteMeters?: number;
  selectedAcModelIds?: string[];
  /** legacy */
  selectedAcModelId?: string;
};

const defaultPrices: PriceList = {
  standard_7: 5900,
  standard_9: 5900,
  standard_12: 6900,
  standard_18: 7900,
  standard_24: 9500,
  standard_30: 10500,
  standard_36: 11500,

  existing_7: 6900,
  existing_9: 6900,
  existing_12: 7900,
  existing_18: 8900,
  existing_24: 10500,
  existing_30: 11500,
  existing_36: 12500,

  route_7: 2000,
  route_9: 2000,
  route_12: 2200,
  route_18: 2200,
  route_24: 2700,
  route_30: 2700,
  route_36: 2900,

  baseArmConcreteSurcharge: 4000,
  extraHoleNormal: 1000,
  extraHoleArm: 5000,

  stroba_brick_small: 1000,
  stroba_brick_big: 1200,
  stroba_concrete_small: 1500,
  stroba_concrete_big: 1600,

  cable40: 600,
  cable16: 200,

  bracketsAndFasteners: 1000,
  dismantlingOldUnit: 3500,
  glassUnitWork: 1000,
  facadeTileCut: 1300,
  drainageToGutter: 200,
  drainPumpInstall: 3000,
  outdoorConnectionLadder: 500,
  floorCarryTools: 500,
  outdoorBlockCarry: 1000,
};

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Number(n || 0)) + " ₽";
}

const MAX_ROUTE_METERS = 200;
const MAX_HOLES = 50;
const MAX_FLOORS = 60;
const MAX_BLOCKS = 20;
const MAX_MONEY = 5_000_000;
const MAX_STROBA_METERS = 200;
const MAX_CABLE_METERS = 500;
const WARN_ROUTE_METERS = 80;
const WARN_HOLES = 20;
const WARN_FLOORS = 25;
const WARN_BLOCKS = 8;
const WARN_MONEY = 1_000_000;
const WARN_STROBA_METERS = 80;
const WARN_CABLE_METERS = 200;

function normalizePhone(value: string) {
  return (value || "").replace(/[^\d]/g, "");
}

function normalizeWhatsAppPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }
  return digits;
}

function normalizeUsername(value: string) {
  return (value || "").replace(/^@/, "").trim();
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
}

function minOneMeter(value: number) {
  return value > 0 ? Math.max(1, value) : 0;
}

function chargedFloorsFromSecond(value: number) {
  return value >= 2 ? value - 1 : 0;
}

function capacityKey(value: string) {
  if (value === "7-9") return "7";
  return value;
}

function normalizePriceDocForSplitCapacity(data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  if (out.standard_7 == null && out.standard_7_9 != null) out.standard_7 = out.standard_7_9;
  if (out.standard_9 == null && out.standard_7_9 != null) out.standard_9 = out.standard_7_9;
  if (out.existing_7 == null && out.existing_7_9 != null) out.existing_7 = out.existing_7_9;
  if (out.existing_9 == null && out.existing_7_9 != null) out.existing_9 = out.existing_7_9;
  if (out.route_7 == null && out.route_7_9 != null) out.route_7 = out.route_7_9;
  if (out.route_9 == null && out.route_7_9 != null) out.route_9 = out.route_7_9;
  return out;
}

function buildClosingText(name: string) {
  const clientLine = name.trim() ? `Клиент: ${name.trim()}` : "";
  return [
    clientLine,
    "При необходимости возможно составление договора с гарантией на монтаж.",
    "Оплата возможна через расчётный счёт.",
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeNonNegativeIntString(raw: string, max: number) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(Math.max(0, Math.trunc(n)), max));
}

function sanitizeNonNegativeMoneyString(raw: string, max: number) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(Math.max(0, Math.trunc(n)), max));
}

function CalculatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [prices, setPrices] = useState<PriceList>(defaultPrices);
  const [pricelistCustomServices, setPricelistCustomServices] = useState<UserCustomService[]>([]);

  const [capacity, setCapacity] = useState("12");
  const [mountType, setMountType] = useState<"standard" | "existing">("standard");
  const [routeMeters, setRouteMeters] = useState("0");
  const [baseWallType, setBaseWallType] = useState<"normal" | "arm">("normal");
  const [extraHolesNormal, setExtraHolesNormal] = useState("0");
  const [extraHolesArm, setExtraHolesArm] = useState("0");
  const [carryToolFloors, setCarryToolFloors] = useState("0");
  const [carryBlockCount, setCarryBlockCount] = useState("0");
  const [manualDismantlingCost, setManualDismantlingCost] = useState("0");

  const [strobaType, setStrobaType] = useState<"none" | "brick" | "concrete">(
    "none"
  );
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
  const [giftRouteMeters, setGiftRouteMeters] = useState(1);
  const [acModels, setAcModels] = useState<{ id: string; name: string; price: number }[]>([]);
  const [selectedAcModelPick, setSelectedAcModelPick] = useState("");
  const [selectedAcModelIds, setSelectedAcModelIds] = useState<string[]>([]);
  const [newAcModelName, setNewAcModelName] = useState("");
  const [newAcModelPrice, setNewAcModelPrice] = useState("");
  const [modelBusy, setModelBusy] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [editableTailText, setEditableTailText] = useState(buildClosingText(""));

  const [selectedExtraServices, setSelectedExtraServices] =
    useState<SelectedExtraServiceMap>({});
  const [quickCalculationExtras, setQuickCalculationExtras] = useState<QuickCalculationExtra[]>([]);
  const [quickServiceName, setQuickServiceName] = useState("");
  const [quickServicePrice, setQuickServicePrice] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldWarnings, setFieldWarnings] = useState<Record<string, string>>({});
  const [actionToast, setActionToast] = useState("");
  const shareBusyRef = useRef(false);

  const autoSavedDocIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedFromHistoryRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
      const currentUser = await resolveAuthUser(userFromObserver);
      if (!currentUser) {
        router.replace(buildLoginRedirectUrl("/calculator"));
        return;
      }

      setUid(currentUser.uid);

      const uid = currentUser.uid;

      try {
        try {
          await currentUser.getIdToken(true);
        } catch (tok) {
          console.warn("[calculator] token refresh before load", tok);
        }

        const userRef = doc(db, PRICING_FS.users, uid);
        let userExists = false;
        let userData: Record<string, unknown> = {};
        try {
        const userSnap = await getDocFromServer(userRef);
          userExists = userSnap.exists();
          userData = userExists ? (userSnap.data() as Record<string, unknown>) : {};
        } catch (e) {
          console.error("[calculator] users/{uid} read failed", e);
        }

        if (userExists) {
          const gm = Number(userData.giftRouteMeters);
          setGiftRouteMeters(Number.isFinite(gm) && gm >= 0 ? Math.floor(gm) : 1);
        } else {
          console.warn("[calculator] users doc missing, giftRouteMeters default", uid);
          setGiftRouteMeters(1);
        }

        try {
          const modelsSnap = await getDocs(
            collection(db, PRICING_FS.users, uid, PRICING_FS.modelsSubcollection)
          );
          const mlist = modelsSnap.docs.map((d) => {
            const x = d.data() as { name?: unknown; price?: unknown };
            const pr = x.price;
            const priceNum =
              typeof pr === "number"
                ? pr
                : typeof pr === "string"
                  ? Number(String(pr).replace(/\D/g, ""))
                  : NaN;
            return {
              id: d.id,
              name: String(x.name ?? ""),
              price: Number.isFinite(priceNum) ? Math.max(0, Math.floor(priceNum)) : 0,
            };
          });
          mlist.sort((a, b) => a.name.localeCompare(b.name, "ru"));
          setAcModels(mlist);
        } catch (e) {
          console.error("[calculator] users/{uid}/models read failed", e);
          setAcModels([]);
        }

        try {
          const priceSnap = await getDocFromServer(doc(db, PRICING_FS.priceLists, uid));
          if (priceSnap.exists()) {
            const pdata = priceSnap.data() as Record<string, unknown>;
            setPrices(mergeNumericPriceDocument(normalizePriceDocForSplitCapacity(pdata), defaultPrices));
            const parsed = parseCustomServicesFromPriceDoc(pdata.customServices);
            setPricelistCustomServices(parsed);
            const initialMap: SelectedExtraServiceMap = {};
            parsed.forEach((service) => {
              initialMap[service.id] = { checked: false, qty: "1" };
            });
            setSelectedExtraServices(initialMap);
          } else {
            setPrices({ ...defaultPrices });
            setPricelistCustomServices([]);
            setSelectedExtraServices({});
          }
        } catch (e) {
          console.error("[calculator] priceLists read failed", e);
          setPrices({ ...defaultPrices });
          setPricelistCustomServices([]);
          setSelectedExtraServices({});
        }

        const historyId = searchParams.get("historyId");
        if (historyId) {
          try {
          const historyRef = doc(db, "calculationHistory", historyId);
          const historySnap = await getDoc(historyRef);

          if (historySnap.exists()) {
            const data = historySnap.data() as HistoryCalcDoc;
              if (String(data.uid || "") !== uid) {
                console.warn("[calculator] history uid mismatch, skip hydrate", historyId);
              } else {
            autoSavedDocIdRef.current = historyId;
            openedFromHistoryRef.current = true;

            if (data.capacity === "7-9") {
              setCapacity("7");
            } else {
              setCapacity(data.capacity || "12");
            }
            setMountType(data.mountType || "standard");
            setRouteMeters(data.routeMeters || "0");
            setBaseWallType(data.baseWallType || "normal");
            setExtraHolesNormal(data.extraHolesNormal || "0");
            setExtraHolesArm(data.extraHolesArm || "0");
            setCarryToolFloors(data.carryToolFloors || "0");
            setCarryBlockCount(data.carryBlockCount || "0");
            setManualDismantlingCost(data.manualDismantlingCost || "0");

            setStrobaType(data.strobaType || "none");
            setStrobaMeters(data.strobaMeters || "0");
            setCable40Meters(data.cable40Meters || "0");
            setCable16Meters(data.cable16Meters || "0");

            setBuyAcAndRouteFromUs(Boolean(data.buyAcAndRouteFromUs));
            setIncludeBrackets(Boolean(data.includeBrackets));
            setIncludeGlass(Boolean(data.includeGlass));
            setIncludeTile(Boolean(data.includeTile));
            setIncludeDrain(Boolean(data.includeDrain));
            setIncludePump(Boolean(data.includePump));
            setIncludeLadderConnection(Boolean(data.includeLadderConnection));

            setPercentDiscount(data.percentDiscount || "0");
                const hg = Number(data.giftRouteMeters);
                if (Number.isFinite(hg) && hg >= 0) setGiftRouteMeters(Math.floor(hg));
                const fromList = Array.isArray(data.selectedAcModelIds)
                  ? data.selectedAcModelIds
                      .filter((x) => typeof x === "string")
                      .map((x) => String(x))
                  : [];
                const fromLegacy = data.selectedAcModelId ? [String(data.selectedAcModelId)] : [];
                setSelectedAcModelIds(Array.from(new Set([...fromList, ...fromLegacy])));
            setClientName(data.clientName || "");
            setClientContact(data.clientContact || "");
            setEditableTailText(
              data.editableTailText || buildClosingText(data.clientName || "")
            );

            if (data.selectedExtraServices) {
              setSelectedExtraServices(data.selectedExtraServices);
            }
            if (Array.isArray(data.quickCalculationExtras) && data.quickCalculationExtras.length > 0) {
              setQuickCalculationExtras(
                data.quickCalculationExtras.filter(
                  (x) =>
                    x &&
                    typeof x === "object" &&
                    typeof (x as QuickCalculationExtra).id === "string" &&
                    typeof (x as QuickCalculationExtra).name === "string" &&
                    typeof (x as QuickCalculationExtra).price === "number"
                ) as QuickCalculationExtra[]
              );
            } else {
              setQuickCalculationExtras([]);
            }
          }
        }
          } catch (e) {
            console.error("[calculator] calculationHistory read failed", e);
          }
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, searchParams]);

  function setError(key: string, message: string) {
    setFieldErrors((prev) => ({ ...prev, [key]: message }));
  }

  function clearError(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setWarn(key: string, message: string) {
    setFieldWarnings((prev) => ({ ...prev, [key]: message }));
  }

  function clearWarn(key: string) {
    setFieldWarnings((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function onIntFieldChange(
    key: string,
    raw: string,
    max: number,
    warnAt: number,
    setter: (value: string) => void
  ) {
    const hadNonDigits = /\D/.test(String(raw || ""));
    const next = sanitizeNonNegativeIntString(raw, max);
    setter(next);

    if (String(raw || "").trim() !== "" && next === "") {
      setError(key, "Введите целое число от 0");
    } else if (hadNonDigits && next !== "") {
      setError(key, "Допустимы только цифры");
    } else {
      clearError(key);
    }

    const n = Number(next || 0);
    if (next !== "" && Number.isFinite(n) && n >= warnAt) {
      setWarn(key, "Значение выглядит необычно большим — проверьте, что ввели верно");
    } else {
      clearWarn(key);
    }
  }

  function onMoneyFieldChange(
    key: string,
    raw: string,
    max: number,
    warnAt: number,
    setter: (value: string) => void
  ) {
    const hadNonDigits = /\D/.test(String(raw || ""));
    const next = sanitizeNonNegativeMoneyString(raw, max);
    setter(next);

    if (String(raw || "").trim() !== "" && next === "") {
      setError(key, "Введите сумму цифрами от 0");
    } else if (hadNonDigits && next !== "") {
      setError(key, "Допустимы только цифры");
    } else {
      clearError(key);
    }

    const n = Number(next || 0);
    if (next !== "" && Number.isFinite(n) && n >= warnAt) {
      setWarn(key, "Сумма выглядит очень большой — проверьте, что ввели верно");
    } else {
      clearWarn(key);
    }
  }

  const result = useMemo(() => {
    const routeMetersNum = Number(sanitizeNonNegativeIntString(routeMeters, MAX_ROUTE_METERS) || 0);
    const extraHolesNormalNum = Number(
      sanitizeNonNegativeIntString(extraHolesNormal, MAX_HOLES) || 0
    );
    const extraHolesArmNum = Number(sanitizeNonNegativeIntString(extraHolesArm, MAX_HOLES) || 0);
    const carryToolFloorsNum = Number(
      sanitizeNonNegativeIntString(carryToolFloors, MAX_FLOORS) || 0
    );
    const carryBlockCountNum = Number(
      sanitizeNonNegativeIntString(carryBlockCount, MAX_BLOCKS) || 0
    );
    const manualDismantlingCostNum = Number(
      sanitizeNonNegativeMoneyString(manualDismantlingCost, MAX_MONEY) || 0
    );
    const strobaMetersNum = Number(
      sanitizeNonNegativeIntString(strobaMeters, MAX_STROBA_METERS) || 0
    );
    const cable40MetersNum = Number(
      sanitizeNonNegativeIntString(cable40Meters, MAX_CABLE_METERS) || 0
    );
    const cable16MetersNum = Number(
      sanitizeNonNegativeIntString(cable16Meters, MAX_CABLE_METERS) || 0
    );
    const percentDiscountNum = Number(sanitizeNonNegativeIntString(percentDiscount, 100) || 0);

    const giftM = Math.max(0, Math.floor(Number(giftRouteMeters) || 0));
    const routePaidMeters = Math.max(0, routeMetersNum - giftM);

    const chargedToolFloors = chargedFloorsFromSecond(carryToolFloorsNum);
    const chargedStrobaMeters = minOneMeter(strobaMetersNum);
    const chargedCable40Meters = minOneMeter(cable40MetersNum);
    const chargedCable16Meters = minOneMeter(cable16MetersNum);

    const capKey = capacityKey(capacity);

    const basePrice =
      mountType === "standard"
        ? Number(prices[`standard_${capKey}` as keyof PriceList] || 0)
        : Number(prices[`existing_${capKey}` as keyof PriceList] || 0);

    const routePricePerMeter = Number(
      prices[`route_${capKey}` as keyof PriceList] || 0
    );

    const isBigCapacity = capacity === "30" || capacity === "36";

    let strobaPricePerMeter = 0;
    if (strobaType === "brick") {
      strobaPricePerMeter = isBigCapacity
        ? prices.stroba_brick_big
        : prices.stroba_brick_small;
    }
    if (strobaType === "concrete") {
      strobaPricePerMeter = isBigCapacity
        ? prices.stroba_concrete_big
        : prices.stroba_concrete_small;
    }

    const items: { title: string; amount: number; note?: string }[] = [];

    items.push({
      title:
        mountType === "standard"
          ? `Монтаж на нашу трассу ${capacity}`
          : `Монтаж на чужую трассу ${capacity}`,
      amount: basePrice,
      note: `Цена за 1 монтаж: ${fmt(basePrice)}`,
    });

    for (const modelId of selectedAcModelIds) {
      const m = acModels.find((x) => x.id === modelId);
      if (m && m.name && Number(m.price) > 0) {
        items.push({
          title: `Кондиционер: ${m.name}`,
          amount: Number(m.price),
          note: "Модель из личного прайса",
        });
      }
    }

    if (baseWallType === "arm") {
      items.push({
        title: "Доплата за основное отверстие в армированном бетоне",
        amount: prices.baseArmConcreteSurcharge,
        note: `Цена за 1 отверстие: ${fmt(prices.baseArmConcreteSurcharge)}`,
      });
    }

    if (routeMetersNum > 0) {
      items.push({
        title: `Трасса × ${routeMetersNum} м`,
        amount: routePaidMeters * routePricePerMeter,
        note: `Цена за 1 м: ${fmt(routePricePerMeter)}. В подарок ${giftM} м, к оплате ${routePaidMeters} м`,
      });
    }

    if (extraHolesNormalNum > 0) {
      items.push({
        title: `Доп. отверстия обычные × ${extraHolesNormalNum}`,
        amount: extraHolesNormalNum * prices.extraHoleNormal,
        note: `Цена за 1 отверстие: ${fmt(prices.extraHoleNormal)}`,
      });
    }

    if (extraHolesArmNum > 0) {
      items.push({
        title: `Доп. отверстия армированный бетон × ${extraHolesArmNum}`,
        amount: extraHolesArmNum * prices.extraHoleArm,
        note: `Цена за 1 отверстие: ${fmt(prices.extraHoleArm)}`,
      });
    }

    if (strobaType !== "none" && chargedStrobaMeters > 0) {
      items.push({
        title: `Штробление × ${chargedStrobaMeters} м`,
        amount: chargedStrobaMeters * strobaPricePerMeter,
        note: `Цена за 1 м: ${fmt(strobaPricePerMeter)}. Штроба считается минимум от 1 м`,
      });
    }

    if (chargedCable40Meters > 0) {
      items.push({
        title: `Кабель-канал 40×40 × ${chargedCable40Meters} м`,
        amount: chargedCable40Meters * prices.cable40,
        note: `Цена за 1 м: ${fmt(prices.cable40)}. Кабель-канал считается минимум от 1 м`,
      });
    }

    if (chargedCable16Meters > 0) {
      items.push({
        title: `Кабель-канал 16×16 × ${chargedCable16Meters} м`,
        amount: chargedCable16Meters * prices.cable16,
        note: `Цена за 1 м: ${fmt(prices.cable16)}. Кабель-канал считается минимум от 1 м`,
      });
    }

    if (includeBrackets) {
      items.push({
        title: "Кронштейны и крепежи",
        amount: prices.bracketsAndFasteners,
        note: `Цена за 1 комплект: ${fmt(prices.bracketsAndFasteners)}`,
      });
    }

    if (includeGlass) {
      items.push({
        title: "Демонтаж / монтаж стеклопакета",
        amount: prices.glassUnitWork,
        note: `Цена за 1 услугу: ${fmt(prices.glassUnitWork)}`,
      });
    }

    if (includeTile) {
      items.push({
        title: "Резка фасадной плитки",
        amount: prices.facadeTileCut,
        note: `Цена за 1 услугу: ${fmt(prices.facadeTileCut)}`,
      });
    }

    if (includeDrain) {
      items.push({
        title: "Монтаж дренажа в водосток",
        amount: prices.drainageToGutter,
        note: `Цена за 1 услугу: ${fmt(prices.drainageToGutter)}`,
      });
    }

    if (includePump) {
      items.push({
        title: "Монтаж дренажной помпы",
        amount: prices.drainPumpInstall,
        note: `Цена за 1 услугу: ${fmt(prices.drainPumpInstall)}`,
      });
    }

    if (includeLadderConnection) {
      items.push({
        title: "Подключение внешнего блока на лестнице",
        amount: prices.outdoorConnectionLadder,
        note: `Цена за 1 услугу: ${fmt(prices.outdoorConnectionLadder)}`,
      });
    }

    if (chargedToolFloors > 0) {
      items.push({
        title: `Подъём инструмента пешком × ${chargedToolFloors} эт.`,
        amount: chargedToolFloors * prices.floorCarryTools,
        note: `Цена за 1 этаж: ${fmt(prices.floorCarryTools)}. Считается начиная со 2 этажа`,
      });
    }

    if (carryBlockCountNum > 0) {
      items.push({
        title: `Подъём внешнего блока × ${carryBlockCountNum}`,
        amount: carryBlockCountNum * prices.outdoorBlockCarry,
        note: `Цена за 1 блок: ${fmt(prices.outdoorBlockCarry)}`,
      });
    }

    if (manualDismantlingCostNum > 0) {
      items.push({
        title: "Демонтаж (ручной ввод)",
        amount: manualDismantlingCostNum,
        note: "Ручная сумма демонтажа",
      });
    }

    if (buyAcAndRouteFromUs) {
      items.push({
        title: "Скидка при покупке кондиционера и трассы у нас",
        amount: -1000,
        note: "Фиксированная скидка: 1000 ₽",
      });
    }

    pricelistCustomServices.forEach((service) => {
      const state = selectedExtraServices[service.id];
      if (!state?.checked) return;

      const qty = Number(sanitizeNonNegativeIntString(state.qty, 999) || 0);
      if (qty <= 0) return;

      items.push({
        title: `${service.name} × ${qty}`,
        amount: qty * Number(service.price || 0),
        note: `Цена за 1 ед.: ${fmt(service.price)}`,
      });
    });

    quickCalculationExtras.forEach((line) => {
      if (!line.name.trim() || line.price <= 0) return;
      items.push({
        title: line.name.trim(),
        amount: line.price,
        note: "Добавлено в расчёт вручную",
      });
    });

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

    const discountByPercent =
      percentDiscountNum > 0
        ? Math.round((subtotal * percentDiscountNum) / 100)
        : 0;

    if (discountByPercent > 0) {
      items.push({
        title: `Скидка ${percentDiscountNum}% на весь расчёт`,
        amount: -discountByPercent,
        note: `Скидка от суммы ${fmt(subtotal)}`,
      });
    }

    const totalRaw = items.reduce((sum, item) => sum + item.amount, 0);
    const total = Number.isFinite(totalRaw) ? Math.max(0, totalRaw) : 0;

    const autoClientText = [
      "Здравствуйте. Подготовили расчёт по вашему объекту.",
      "",
      `Расчёт монтажа кондиционера ${capacity}:`,
      ...items.map((item) => {
        const amountText = `${item.amount < 0 ? "-" : ""}${fmt(
          Math.abs(item.amount)
        )}`;
        return item.note
          ? `— ${item.title}: ${amountText}\n  ${item.note}`
          : `— ${item.title}: ${amountText}`;
      }),
      "",
      `Итого: ${fmt(total)}`,
    ].join("\n");

    return {
      items,
      total,
      autoClientText,
    };
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
    pricelistCustomServices,
    quickCalculationExtras,
    selectedExtraServices,
    giftRouteMeters,
    acModels,
    selectedAcModelIds,
  ]);

  const finalClientText = `${result.autoClientText}\n${editableTailText}`.trim();

  useEffect(() => {
    if (!openedFromHistoryRef.current && !editableTailText.trim()) {
      setEditableTailText(buildClosingText(clientName));
    }
  }, [clientName, editableTailText]);

  useEffect(() => {
    if (!uid) return;

    const hasClientData = clientName.trim() || clientContact.trim();
    if (!hasClientData) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const payload: Omit<HistoryCalcDoc, "id"> = {
          uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          capacity,
          total: result.total,
          clientName: clientName.trim(),
          clientContact: clientContact.trim(),
          clientText: finalClientText,
          editableTailText,

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
          selectedExtraServices,
          quickCalculationExtras,
          giftRouteMeters,
          selectedAcModelIds,
          selectedAcModelId: selectedAcModelIds[0] || "",
        };

        let createdNewHistoryDoc = false;
        if (autoSavedDocIdRef.current) {
          const existingRef = doc(db, "calculationHistory", autoSavedDocIdRef.current);
          const existingSnap = await getDoc(existingRef);
          if (existingSnap.exists()) {
            await updateDoc(existingRef, payload);
          } else {
            const ref = await addDoc(collection(db, "calculationHistory"), payload);
            autoSavedDocIdRef.current = ref.id;
            createdNewHistoryDoc = true;
          }
        } else {
          const ref = await addDoc(collection(db, "calculationHistory"), payload);
          autoSavedDocIdRef.current = ref.id;
          createdNewHistoryDoc = true;
        }
        if (uid && createdNewHistoryDoc) {
          void ensureTrialStartedOnFirstCalculation(uid);
        }
      } catch (error) {
        console.error(error);
      }
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    uid,
    clientName,
    clientContact,
    finalClientText,
    editableTailText,
    result.total,
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
    selectedExtraServices,
    quickCalculationExtras,
    giftRouteMeters,
    selectedAcModelIds,
  ]);

  const MAX_SHARE_URL_CHARS = 3800;

  function shortenForMessenger(text: string) {
    if (text.length <= MAX_SHARE_URL_CHARS) return text;
    return (
      text.slice(0, MAX_SHARE_URL_CHARS) +
      "\n\n[…текст обрезан из‑за лимита мессенджера — полный расчёт скопируйте кнопкой «Скопировать текст»]"
    );
  }

  function showToast(msg: string) {
    setActionToast(msg);
    window.setTimeout(() => setActionToast(""), 3500);
  }

  async function copyFinalText() {
    if (shareBusyRef.current) return;
    shareBusyRef.current = true;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(finalClientText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = finalClientText;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      }
      showToast("Текст скопирован");
    } catch {
      alert("Не удалось скопировать автоматически. Выделите текст в поле «Итоговый текст клиенту» и скопируйте вручную.");
    } finally {
      shareBusyRef.current = false;
    }
  }

  function sendToWhatsApp() {
    const raw = clientContact.trim();
    const phone = normalizeWhatsAppPhone(raw);

    if (!phone) {
      alert("Для WhatsApp укажите номер телефона клиента в поле «Телефон / username»");
      return;
    }

    const body = shortenForMessenger(finalClientText);
    const encoded = encodeURIComponent(body);
    let url = `https://wa.me/${phone}?text=${encoded}`;
    if (url.length > 8190) {
      const shortBody = encodeURIComponent(
        finalClientText.slice(0, 1500) +
          "\n\n[полный текст — скопируйте кнопкой «Скопировать текст»]"
      );
      url = `https://wa.me/${phone}?text=${shortBody}`;
    }
    if (isMobileDevice()) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function sendToTelegram() {
    const raw = clientContact.trim();

    if (!raw) {
      alert("Укажите номер телефона или username клиента");
      return;
    }

    const body = shortenForMessenger(finalClientText);
    const encoded = encodeURIComponent(body);
    const phone = normalizeWhatsAppPhone(raw);
    const username = normalizeUsername(raw);
    const safeUser = username.replace(/[^a-zA-Z0-9_]/g, "");
    const mobile = isMobileDevice();
    const looksUsername =
      raw.trim().startsWith("@") || (safeUser.length >= 3 && /[a-zA-Z_]/.test(safeUser));

    if (looksUsername && safeUser.length >= 3) {
      const appUrl = `tg://resolve?domain=${safeUser}&text=${encoded}`;
      const webUrl = `https://t.me/${safeUser}?text=${encoded}`;
      if (mobile) {
        window.location.href = appUrl;
      } else {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (phone.length >= 10) {
      // Для номера без username Telegram не всегда позволяет адресно открыть чат,
      // поэтому на мобильных открываем compose в приложении с текстом.
      const appUrl = `tg://msg?text=${encoded}`;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const webFallback = `https://t.me/share/url?url=${encodeURIComponent(origin || " ")}&text=${encoded}`;
      if (mobile) {
        window.location.href = appUrl;
      } else {
        window.open(webFallback, "_blank", "noopener,noreferrer");
      }
      return;
    }

    alert("Для Telegram укажите username вида @name или номер телефона (цифры, с кодом страны)");
  }

  function addSelectedModelToCalculation() {
    if (!selectedAcModelPick) return;
    if (selectedAcModelIds.includes(selectedAcModelPick)) return;
    setSelectedAcModelIds((prev) => [...prev, selectedAcModelPick]);
    setSelectedAcModelPick("");
  }

  function removeSelectedModelFromCalculation(id: string) {
    setSelectedAcModelIds((prev) => prev.filter((x) => x !== id));
  }

  async function addModelQuicklyFromCalculator() {
    const owner = auth.currentUser;
    if (!owner?.uid) {
      alert("Войдите в аккаунт заново.");
      return;
    }
    const name = newAcModelName.trim();
    if (!name) {
      setError("newAcModelName", "Введите название модели");
      return;
    }
    clearError("newAcModelName");
    const price = Number(sanitizeNonNegativeMoneyString(newAcModelPrice, MAX_MONEY) || 0);
    if (!Number.isFinite(price) || price <= 0) {
      setError("newAcModelPrice", "Введите цену цифрами больше 0");
      return;
    }
    clearError("newAcModelPrice");

    setModelBusy(true);
    try {
      await setDoc(
        doc(db, PRICING_FS.users, owner.uid),
        {
          uid: owner.uid,
          email: owner.email || "",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      const colRef = collection(db, PRICING_FS.users, owner.uid, PRICING_FS.modelsSubcollection);
      const ref = await addDoc(colRef, {
        name,
        price,
        createdAt: new Date().toISOString(),
      });
      const row = { id: ref.id, name, price };
      setAcModels((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name, "ru")));
      setSelectedAcModelIds((prev) => (prev.includes(row.id) ? prev : [...prev, row.id]));
      setNewAcModelName("");
      setNewAcModelPrice("");
      showToast("Модель добавлена в прайс и расчёт");
    } catch (e) {
      console.error("[calculator] add model quick failed", e);
      alert("Не удалось добавить модель. Попробуйте ещё раз.");
    } finally {
      setModelBusy(false);
    }
  }

  function handleQuickAddToCalculation() {
    if (!quickServiceName.trim()) {
      setError("quickServiceName", "Введите название услуги");
      return;
    }
    clearError("quickServiceName");

    const price = Number(sanitizeNonNegativeMoneyString(quickServicePrice, MAX_MONEY) || 0);
    if (price <= 0) {
      setError("quickServicePrice", "Введите цену цифрами больше 0");
      return;
    }
    clearError("quickServicePrice");

    setQuickCalculationExtras((prev) => [
      ...prev,
      {
        id: newQuickExtraId(),
        name: quickServiceName.trim(),
        price,
      },
    ]);
    setQuickServiceName("");
    setQuickServicePrice("");
  }

  function removeQuickExtra(id: string) {
    setQuickCalculationExtras((prev) => prev.filter((x) => x.id !== id));
  }

  if (loading) {
    return <div style={loadingStyle}>Загрузка калькулятора...</div>;
  }

  return (
    <div style={pageStyle}>
      <div
        data-hvac-report-calc
        aria-hidden
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {[
          `мощность=${capacity}`,
          `монтаж=${mountType}`,
          `модель_ids=${selectedAcModelIds.length ? selectedAcModelIds.join(",") : "—"}`,
          `трасса_м=${routeMeters}`,
          `подарок_м=${giftRouteMeters}`,
          `стена=${baseWallType}`,
          `итого_руб=${result.total}`,
          `клиент=${clientName.trim() || "—"}`,
          `контакт=${clientContact.trim() || "—"}`,
        ].join("; ")}
      </div>
      <div id="calc-top" style={heroCard}>
        <div style={heroLabel}>Расчёт монтажа</div>
        <h1 style={heroTitle}>Калькулятор</h1>
        <p style={heroText}>
          Выберите параметры и прокрутите вниз к итогу. Цены берутся из вашего личного прайса (раздел
          отдельно). При заполнении имени или контакта расчёт сохраняется автоматически.
        </p>
      </div>

      <div style={actionRowTop}>
        <button type="button" onClick={() => router.push("/dashboard")} style={ghostButtonStyle}>
          Назад в кабинет
        </button>
        <button type="button" onClick={() => router.push("/pricing")} style={ghostButtonStyle}>
          Личный прайс
        </button>
        <button type="button" onClick={() => router.push("/history")} style={ghostButtonStyle}>
          История расчётов
        </button>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>Быстро добавить модель кондиционера</h2>
        <p style={{ ...smallTextStyle, marginTop: 0, marginBottom: 10 }}>
          Модель сразу сохраняется в личный прайс и добавляется в текущий расчёт.
        </p>
        <div style={quickAddGridStyle}>
          <input
            value={newAcModelName}
            onChange={(e) => {
              setNewAcModelName(e.target.value);
              clearError("newAcModelName");
            }}
            placeholder="Модель кондиционера"
            style={inputStyle}
          />
          <FieldMessage error={fieldErrors.newAcModelName} warning={fieldWarnings.newAcModelName} />
          <input
            value={newAcModelPrice}
            onChange={(e) => {
              setNewAcModelPrice(sanitizeNonNegativeMoneyString(e.target.value, MAX_MONEY));
              clearError("newAcModelPrice");
            }}
            placeholder="Цена"
            style={inputStyle}
            inputMode="numeric"
          />
          <FieldMessage error={fieldErrors.newAcModelPrice} warning={fieldWarnings.newAcModelPrice} />
          <button
            type="button"
            onClick={() => void addModelQuicklyFromCalculator()}
            disabled={modelBusy}
            style={{ ...primaryButtonStyle, opacity: modelBusy ? 0.6 : 1 }}
          >
            {modelBusy ? "Добавление…" : "Добавить модель"}
          </button>
        </div>
      </div>

        <div style={cardStyle}>
        <h2 style={sectionTitle}>1. Основные параметры</h2>

        <Label text="Мощность" note="кВт (модель ряда)">
            <select
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              style={inputStyle}
            >
              <option value="7">7</option>
              <option value="9">9</option>
              <option value="12">12</option>
              <option value="18">18</option>
              <option value="24">24</option>
              <option value="30">30</option>
              <option value="36">36</option>
            </select>
          </Label>

        {acModels.length > 0 ? (
          <div style={selectedModelsBlockStyle}>
            <Label text="Модели кондиционеров" note="Можно добавить несколько моделей в текущую смету">
              <div style={modelPickerRowStyle}>
                <select
                  value={selectedAcModelPick}
                  onChange={(e) => setSelectedAcModelPick(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 0 }}
                >
                  <option value="">Выберите модель</option>
                  {acModels.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={selectedAcModelIds.includes(m.id)}
                    >
                      {m.name} — {fmt(m.price)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addSelectedModelToCalculation}
                  disabled={!selectedAcModelPick}
                  style={{ ...secondaryButtonStyle, minWidth: 140, opacity: selectedAcModelPick ? 1 : 0.6 }}
                >
                  Добавить в смету
                </button>
              </div>
            </Label>

            {selectedAcModelIds.length > 0 ? (
              <div style={selectedModelsListStyle}>
                {selectedAcModelIds.map((id) => {
                  const model = acModels.find((m) => m.id === id);
                  if (!model) return null;
                  return (
                    <div key={id} style={selectedModelRowStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={selectedModelNameStyle}>{model.name}</div>
                        <div style={smallTextStyle}>{fmt(model.price)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelectedModelFromCalculation(id)}
                        style={{ ...deleteButtonStyle, width: "auto", minWidth: 110 }}
                      >
                        Удалить
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

          <Label text="Тип монтажа" note="На нашу трассу или на чужую трассу">
            <select
              value={mountType}
              onChange={(e) =>
                setMountType(e.target.value as "standard" | "existing")
              }
              style={inputStyle}
            >
              <option value="standard">На нашу трассу</option>
              <option value="existing">На чужую трассу</option>
            </select>
          </Label>

          <Label
            text="Трасса, м"
          note={`К оплате считается: введённые метры минус «в подарок» (${giftRouteMeters} м из личного прайса)`}
          >
            <input
              value={routeMeters}
            onChange={(e) =>
              onIntFieldChange(
                "routeMeters",
                e.target.value,
                MAX_ROUTE_METERS,
                WARN_ROUTE_METERS,
                setRouteMeters
              )
            }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
        <FieldMessage error={fieldErrors.routeMeters} warning={fieldWarnings.routeMeters} />

      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>2. Дополнительные работы</h2>

        <Label text="Материал основного отверстия" note="Влияет на доплату за армированный бетон в итоге">
            <select
              value={baseWallType}
              onChange={(e) => setBaseWallType(e.target.value as "normal" | "arm")}
              style={inputStyle}
            >
              <option value="normal">
                Кирпич / газобетон / неармированный бетон
              </option>
              <option value="arm">Армированный бетон</option>
            </select>
          </Label>

        <Label text="Доп. отверстия обычные, шт." note="Количество дополнительных отверстий">
            <input
              value={extraHolesNormal}
                onChange={(e) =>
                  onIntFieldChange(
                    "extraHolesNormal",
                    e.target.value,
                    MAX_HOLES,
                    WARN_HOLES,
                    setExtraHolesNormal
                  )
                }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
            <FieldMessage error={fieldErrors.extraHolesNormal} warning={fieldWarnings.extraHolesNormal} />

            <Label text="Доп. отверстия армированные, шт." note="Количество отверстий в армированном бетоне">
            <input
              value={extraHolesArm}
                onChange={(e) =>
                  onIntFieldChange(
                    "extraHolesArm",
                    e.target.value,
                    MAX_HOLES,
                    WARN_HOLES,
                    setExtraHolesArm
                  )
                }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
            <FieldMessage error={fieldErrors.extraHolesArm} warning={fieldWarnings.extraHolesArm} />

            <div style={{ ...quickOptionsTitleStyle, marginTop: 16 }}>Штроба и кабель-каналы</div>

            <Label text="Штробление" note="Выбери тип материала">
              <select
                value={strobaType}
                onChange={(e) =>
                  setStrobaType(e.target.value as "none" | "brick" | "concrete")
                }
                style={inputStyle}
              >
                <option value="none">Без штробы</option>
                <option value="brick">Кирпич / газоблок / газобетон</option>
                <option value="concrete">Бетон</option>
              </select>
            </Label>

            <Label text="Штроба, м" note="Штроба считается минимум от 1 м">
            <input
                value={strobaMeters}
                onChange={(e) =>
                  onIntFieldChange(
                    "strobaMeters",
                    e.target.value,
                    MAX_STROBA_METERS,
                    WARN_STROBA_METERS,
                    setStrobaMeters
                  )
                }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
            <FieldMessage error={fieldErrors.strobaMeters} warning={fieldWarnings.strobaMeters} />

            <Label text="Кабель-канал 40×40, м" note="При ненулевом значении минимум 1 м к расчёту">
            <input
                value={cable40Meters}
                onChange={(e) =>
                  onIntFieldChange(
                    "cable40Meters",
                    e.target.value,
                    MAX_CABLE_METERS,
                    WARN_CABLE_METERS,
                    setCable40Meters
                  )
                }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
            <FieldMessage error={fieldErrors.cable40Meters} warning={fieldWarnings.cable40Meters} />

            <Label text="Кабель-канал 16×16, м" note="При ненулевом значении минимум 1 м к расчёту">
            <input
                value={cable16Meters}
                onChange={(e) =>
                  onIntFieldChange(
                    "cable16Meters",
                    e.target.value,
                    MAX_CABLE_METERS,
                    WARN_CABLE_METERS,
                    setCable16Meters
                  )
                }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
            <FieldMessage error={fieldErrors.cable16Meters} warning={fieldWarnings.cable16Meters} />

            <Check label="Резка фасадной плитки" checked={includeTile} onChange={setIncludeTile} />
            <Check label="Дренаж в водосток" checked={includeDrain} onChange={setIncludeDrain} />
            <Check label="Монтаж дренажной помпы" checked={includePump} onChange={setIncludePump} />
            <Check
              label="Подключение внешнего блока на лестнице"
              checked={includeLadderConnection}
              onChange={setIncludeLadderConnection}
            />
            <Check label="Кронштейны и крепежи" checked={includeBrackets} onChange={setIncludeBrackets} />
            <Check label="Стеклопакет (работы)" checked={includeGlass} onChange={setIncludeGlass} />
        </div>

        <div style={cardStyle}>
        <h2 style={sectionTitle}>3. Дополнительные условия</h2>

        <Label text="Подъём инструмента пешком, этажей" note="Тарификация со 2-го этажа">
          <input
            value={carryToolFloors}
              onChange={(e) =>
              onIntFieldChange(
                "carryToolFloors",
                e.target.value,
                MAX_FLOORS,
                WARN_FLOORS,
                setCarryToolFloors
              )
              }
              style={inputStyle}
            inputMode="numeric"
          />
          </Label>
        <FieldMessage error={fieldErrors.carryToolFloors} warning={fieldWarnings.carryToolFloors} />

        <Label text="Подъём внешнего блока, шт." note="Количество подъёмов блока">
            <input
            value={carryBlockCount}
            onChange={(e) =>
              onIntFieldChange(
                "carryBlockCount",
                e.target.value,
                MAX_BLOCKS,
                WARN_BLOCKS,
                setCarryBlockCount
              )
            }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
        <FieldMessage error={fieldErrors.carryBlockCount} warning={fieldWarnings.carryBlockCount} />

        <Label text="Демонтаж, ₽" note="Фиксированная сумма вручную">
            <input
            value={manualDismantlingCost}
            onChange={(e) =>
              onMoneyFieldChange(
                "manualDismantlingCost",
                e.target.value,
                MAX_MONEY,
                WARN_MONEY,
                setManualDismantlingCost
              )
            }
              style={inputStyle}
              inputMode="numeric"
            />
          </Label>
        <FieldMessage error={fieldErrors.manualDismantlingCost} warning={fieldWarnings.manualDismantlingCost} />
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>4. Свои услуги из прайса</h2>
        <p style={{ ...smallTextStyle, marginTop: 0, marginBottom: 12 }}>
          Список задаётся в разделе «Личный прайс». Отметьте позиции и количество — они попадут в смету.
        </p>

        {pricelistCustomServices.length === 0 ? (
          <p style={{ margin: 0 }}>В прайсе пока нет своих услуг. Добавьте их на странице «Личный прайс».</p>
        ) : (
          pricelistCustomServices.map((service) => {
            const state = selectedExtraServices[service.id] || {
              checked: false,
              qty: "1",
            };

            return (
              <div key={service.id} style={serviceRowStyle}>
                <div style={serviceHeaderStyle}>
                  <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{service.name}</div>
                  <div style={smallTextStyle}>{fmt(service.price)} за ед.</div>
                </div>

                <div style={serviceControlsStyle}>
                  <label style={checkboxWrapStyle}>
                    <input
                      type="checkbox"
                      checked={state.checked}
                      onChange={(e) =>
                        setSelectedExtraServices((prev) => ({
                          ...prev,
                          [service.id]: {
                            ...prev[service.id],
                            checked: e.target.checked,
                            qty: prev[service.id]?.qty || "1",
                          },
                        }))
                      }
                    />
                    <span>В расчёт</span>
                  </label>

                  <div>
                    <input
                      value={state.qty}
                      onChange={(e) => {
                        const next = sanitizeNonNegativeIntString(e.target.value, 999);
                        setSelectedExtraServices((prev) => ({
                          ...prev,
                          [service.id]: {
                            ...prev[service.id],
                            checked: prev[service.id]?.checked || false,
                            qty: next === "" ? "" : next,
                          },
                        }));

                        const key = `extraServiceQty:${service.id}`;
                        if (String(e.target.value || "").trim() !== "" && next === "") {
                          setError(key, "Введите количество цифрами от 0");
                        } else if (/\D/.test(String(e.target.value || "")) && next !== "") {
                          setError(key, "Допустимы только цифры");
                        } else {
                          clearError(key);
                        }

                        const n = Number(next || 0);
                        if (next !== "" && Number.isFinite(n) && n >= 50) {
                          setWarn(key, "Количество выглядит очень большим — проверьте ввод");
                        } else {
                          clearWarn(key);
                        }
                      }}
                      style={qtyInputStyle}
                      inputMode="numeric"
                    />
                    <FieldMessage
                      error={fieldErrors[`extraServiceQty:${service.id}`]}
                      warning={fieldWarnings[`extraServiceQty:${service.id}`]}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>5. Добавить услугу в расчёт</h2>
        <p style={{ ...smallTextStyle, marginTop: 0, marginBottom: 12 }}>
          Быстрая строка только в этом расчёте (не сохраняется в прайс). Можно добавить несколько позиций.
        </p>

        <div style={quickAddWrapStyle}>
          <div style={quickAddGridStyle}>
            <input
              value={quickServiceName}
              onChange={(e) => {
                setQuickServiceName(e.target.value);
                clearError("quickServiceName");
              }}
              placeholder="Название услуги"
              style={inputStyle}
            />
            <input
              value={quickServicePrice}
              onChange={(e) =>
                onMoneyFieldChange(
                  "quickServicePrice",
                  e.target.value,
                  MAX_MONEY,
                  WARN_MONEY,
                  setQuickServicePrice
                )
              }
              placeholder="Цена, ₽"
              style={inputStyle}
              inputMode="numeric"
            />
            <button type="button" onClick={handleQuickAddToCalculation} style={secondaryButtonStyle}>
              Добавить в расчёт
            </button>
          </div>
          <FieldMessage error={fieldErrors.quickServiceName} />
          <FieldMessage error={fieldErrors.quickServicePrice} warning={fieldWarnings.quickServicePrice} />
        </div>

        {quickCalculationExtras.length > 0 ? (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {quickCalculationExtras.map((line) => (
              <div
                key={line.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fafbfc",
                }}
              >
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{line.name}</div>
                  <div style={smallTextStyle}>{fmt(line.price)}</div>
                </div>
                <button type="button" onClick={() => removeQuickExtra(line.id)} style={deleteButtonStyle}>
                  Убрать
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>6. Расчётная часть</h2>

        <div style={calcBreakdownLight}>
        {result.items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 6,
                lineHeight: 1.35,
                fontSize: 13,
                color: "#111827",
              }}
            >
              <span style={{ flex: 1 }}>{item.title}</span>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {item.amount < 0 ? "−" : ""}
              {fmt(Math.abs(item.amount))}
              </span>
          </div>
        ))}
        </div>

        <Label text="Текст расчёта для клиента" note="Формируется автоматически, не редактируется">
          <textarea value={result.autoClientText} readOnly style={textareaStyle} />
        </Label>

        <div style={calcTotalPlaque}>
          ИТОГО: {fmt(result.total)}
        </div>

        <div style={{ marginTop: 18 }}>
          <h3 style={{ ...sectionTitle, fontSize: 16, marginTop: 0, marginBottom: 12 }}>
            Скидка / корректировки
          </h3>
          <Label text="Скидка на весь расчёт" note="Процент от суммы до скидки">
            <select
              value={percentDiscount}
              onChange={(e) => setPercentDiscount(e.target.value)}
              style={inputStyle}
            >
              <option value="0">Без скидки</option>
              <option value="5">5%</option>
              <option value="10">10%</option>
              <option value="15">15%</option>
            </select>
          </Label>

          <Check
            label="Клиент покупает кондиционер и трассу у вас (учёт фиксированной скидки в итоге)"
            checked={buyAcAndRouteFromUs}
            onChange={setBuyAcAndRouteFromUs}
          />
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>Клиент и отправка</h2>

        <Label text="Имя клиента">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Например: Иван"
            style={inputStyle}
          />
        </Label>

        <Label text="Телефон / username клиента">
          <input
            value={clientContact}
            onChange={(e) => setClientContact(e.target.value)}
            placeholder="+79991234567 или @username"
            style={inputStyle}
          />
        </Label>

        <Label
          text="Текст после суммы"
          note="Редактируется только часть после расчёта. Слова Итого здесь нет"
        >
          <textarea
            value={editableTailText}
            onChange={(e) => setEditableTailText(e.target.value)}
            style={textareaStyle}
          />
        </Label>

        <Label text="Итоговый текст клиенту">
          <textarea value={finalClientText} readOnly style={textareaStyle} />
        </Label>

        {actionToast ? (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              color: "#166534",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {actionToast}
          </div>
        ) : null}

        <div style={buttonGridStyle}>
          <button
            type="button"
            onClick={() => void copyFinalText()}
            style={secondaryButtonStyle}
          >
            Скопировать текст
          </button>

          <button type="button" onClick={sendToWhatsApp} style={primaryButtonStyle}>
            Отправить в WhatsApp
          </button>

          <button type="button" onClick={sendToTelegram} style={primaryButtonStyle}>
            Отправить в Telegram
          </button>
        </div>
      </div>
    </div>
  );
}

export default withFeatureGuard(CalculatorPage, "calculator");

function FieldMessage({ error, warning }: { error?: string; warning?: string }) {
  if (!error && !warning) return null;
  return (
    <div style={{ marginTop: 6 }}>
      {error ? <div style={errorTextStyle}>{error}</div> : null}
      {!error && warning ? <div style={warnTextStyle}>{warning}</div> : null}
    </div>
  );
}

function Label({
  text,
  note,
  children,
}: {
  text: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={fieldLabelStyle}>{text}</div>
      {children}
      {note ? <div style={smallTextStyle}>{note}</div> : null}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={checkboxRowStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
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
  position: "relative",
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: "12px",
  paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))",
  maxWidth: "980px",
  margin: "0 auto",
  overflowX: "hidden",
};

const calcBreakdownLight: React.CSSProperties = {
  maxHeight: 160,
  overflowY: "auto",
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
};

const calcTotalPlaque: React.CSSProperties = {
  marginTop: 4,
  padding: "16px 14px",
  borderRadius: 14,
  background: "#111827",
  color: "#fff",
  fontSize: 20,
  fontWeight: 900,
  textAlign: "center",
  letterSpacing: "0.04em",
};

const heroCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "18px",
  marginBottom: "16px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
};

const heroLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "6px",
};

const heroTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "28px",
  lineHeight: 1.1,
  marginBottom: "8px",
};

const heroText: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: "14px",
};

const hintCardStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: "10px",
  padding: "12px 12px",
  borderRadius: "14px",
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
};

const hintTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: "14px",
  color: "#111827",
  marginBottom: "8px",
};

const hintListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "18px",
  color: "#111827",
  fontSize: "14px",
  lineHeight: 1.45,
};

const hintNoteStyle: React.CSSProperties = {
  marginTop: "10px",
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: 1.45,
};

const actionRowTop: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
  marginBottom: "16px",
};

const detailsStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "12px 14px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
  marginBottom: "16px",
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  fontSize: "18px",
  padding: "6px 2px",
};

const nestedDetailsStyle: React.CSSProperties = {
  marginTop: "12px",
  borderTop: "1px solid #eef1f4",
  paddingTop: "12px",
};

const nestedSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 800,
  fontSize: "16px",
  padding: "6px 2px",
};

const quickOptionsTitleStyle: React.CSSProperties = {
  marginTop: "6px",
  marginBottom: "8px",
  fontWeight: 800,
  fontSize: "15px",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "16px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
  marginBottom: "16px",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "14px",
  fontSize: "20px",
};

const fieldLabelStyle: React.CSSProperties = {
  marginBottom: "6px",
  fontWeight: 700,
  fontSize: "15px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "46px",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "17px",
  background: "#fff",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "180px",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  fontSize: "15px",
};

const lineItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "12px 0",
  borderTop: "1px solid #eef1f4",
  alignItems: "flex-start",
};

const serviceRowStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  alignItems: "stretch",
  padding: "12px 0",
  borderTop: "1px solid #eef1f4",
  background: "#f9fafb",
  borderRadius: "12px",
  paddingInline: "10px",
  marginBottom: "8px",
};

const serviceHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
};

const serviceControlsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "10px",
};

const checkboxWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  whiteSpace: "normal",
  fontSize: "16px",
};

const quickAddWrapStyle: React.CSSProperties = {
  marginBottom: "10px",
};

const quickAddGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  alignItems: "stretch",
};

const selectedModelsBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  marginBottom: "8px",
};

const modelPickerRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const selectedModelsListStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const selectedModelRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  justifyContent: "space-between",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "10px",
  background: "#fff",
};

const selectedModelNameStyle: React.CSSProperties = {
  fontWeight: 700,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  marginBottom: "10px",
};

const smallTextStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: "12px",
  color: "#6b7280",
  lineHeight: 1.4,
};

const errorTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#b91c1c",
  fontWeight: 700,
  lineHeight: 1.35,
};

const warnTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#92400e",
  fontWeight: 700,
  lineHeight: 1.35,
};

const buttonGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
};

const primaryButtonStyle: React.CSSProperties = {
  minHeight: "46px",
  padding: "12px 16px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "16px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: "46px",
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "16px",
  fontWeight: 600,
  cursor: "pointer",
};

const ghostButtonStyle: React.CSSProperties = {
  minHeight: "42px",
  padding: "10px 12px",
  borderRadius: "14px",
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#6b7280",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const deleteButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#b91c1c",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: 700,
  width: "100%",
};

const qtyInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
};