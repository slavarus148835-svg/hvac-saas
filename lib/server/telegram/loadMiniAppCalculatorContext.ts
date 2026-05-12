import type { Firestore } from "firebase-admin/firestore";
import { parseCustomServicesFromPriceDoc, type UserCustomService } from "@/lib/customServices";
import {
  DEFAULT_CALCULATOR_PRICES,
  normalizePriceDocForSplitCapacity,
  type CalculatorPriceList,
} from "@/lib/calculator";
import { mergeNumericPriceDocument } from "@/lib/mergeNumericPriceDocument";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export type MiniAppCalculatorModel = { id: string; name: string; price: number };

export type MiniAppCalculatorContext = {
  prices: CalculatorPriceList;
  giftRouteMeters: number;
  models: MiniAppCalculatorModel[];
  customServices: UserCustomService[];
};

export async function loadMiniAppCalculatorContext(
  db: Firestore,
  uid: string
): Promise<MiniAppCalculatorContext> {
  const userRef = db.collection(PRICING_FS.users).doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const gm = Number(userData.giftRouteMeters);
  const giftRouteMeters =
    Number.isFinite(gm) && gm >= 0 ? Math.floor(gm) : 1;

  let prices: CalculatorPriceList = { ...DEFAULT_CALCULATOR_PRICES };
  let customServices: UserCustomService[] = [];

  const priceSnap = await db.collection(PRICING_FS.priceLists).doc(uid).get();
  if (priceSnap.exists) {
    const pdata = priceSnap.data() as Record<string, unknown>;
    prices = mergeNumericPriceDocument(
      normalizePriceDocForSplitCapacity(pdata),
      DEFAULT_CALCULATOR_PRICES
    );
    customServices = parseCustomServicesFromPriceDoc(pdata.customServices);
  }

  const modelsSnap = await userRef.collection(PRICING_FS.modelsSubcollection).get();
  const models: MiniAppCalculatorModel[] = modelsSnap.docs
    .map((d) => {
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
    })
    .filter((m) => m.name && m.price > 0);
  models.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return { prices, giftRouteMeters, models, customServices };
}
