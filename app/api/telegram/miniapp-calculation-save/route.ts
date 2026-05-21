import { NextResponse } from "next/server";
import type { QuickCalculationExtra } from "@/lib/customServices";
import {
  computeCalculatorEstimate,
  computeMultiRoomEstimate,
  isCalculatorRoughInCapacity,
  normalizeCalculatorComputeInput,
  type CalculatorRoomInput,
  type SelectedExtraServiceMap,
} from "@/lib/calculator";
import type { CalculatorComputeInput } from "@/lib/calculator/types";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadMiniAppCalculatorContext } from "@/lib/server/telegram/loadMiniAppCalculatorContext";
import { assertMiniAppServiceAccess } from "@/lib/server/telegram/assertMiniAppServiceAccess";
import { verifyTelegramMiniAppSession } from "@/lib/server/telegram/telegramMiniAppSession";
import { markFirstCalculationIfNeededAndRecordB2B } from "@/lib/server/partnerManager/partnerManagerB2b";

export const runtime = "nodejs";

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

function omitUndefinedForFirestore<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

function filterQuickExtras(raw: unknown): QuickCalculationExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickCalculationExtra[] = [];
  for (const x of raw.slice(0, 40)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id =
      typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 120) : `qx_${out.length}`;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 200) : "";
    const priceRaw = o.price;
    const price =
      typeof priceRaw === "number"
        ? priceRaw
        : typeof priceRaw === "string"
          ? Number(priceRaw.replace(/\s/g, "").replace(",", "."))
          : NaN;
    if (!name || !Number.isFinite(price) || price <= 0) continue;
    out.push({ id, name, price: Math.min(5_000_000, Math.floor(price)) });
  }
  return out;
}

function slimComputeInputForStorage(
  input: CalculatorComputeInput
): Omit<CalculatorComputeInput, "acModels" | "pricelistCustomServices"> {
  const { acModels: _a, pricelistCustomServices: _p, ...rest } = input;
  return rest;
}

function parseRoomsFromBody(
  body: Record<string, unknown>,
  ctx: Awaited<ReturnType<typeof loadMiniAppCalculatorContext>>,
  allowedServiceIds: Set<string>,
  fallbackSelectedAcModelIds: string[],
  fallbackSelectedExtraServices: SelectedExtraServiceMap,
  fallbackQuickExtras: QuickCalculationExtra[]
): CalculatorRoomInput[] | null {
  const raw = body.rooms;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CalculatorRoomInput[] = [];
  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const id =
      typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 80) : `room_${out.length}`;
    const roomName =
      typeof o.roomName === "string" && o.roomName.trim()
        ? o.roomName.trim().slice(0, 120)
        : `Комната ${out.length + 1}`;
    const inputRaw = o.input;
    if (!inputRaw || typeof inputRaw !== "object" || Array.isArray(inputRaw)) continue;
    const roomBody = inputRaw as Record<string, unknown>;

    const roomSelectedIds = Array.isArray(roomBody.selectedAcModelIds)
      ? roomBody.selectedAcModelIds.filter((x): x is string => typeof x === "string")
      : fallbackSelectedAcModelIds;

    const roomExtra =
      roomBody.selectedExtraServices != null
        ? filterSelectedExtraServices(allowedServiceIds, roomBody.selectedExtraServices)
        : fallbackSelectedExtraServices;

    const roomQuick =
      roomBody.quickCalculationExtras != null
        ? filterQuickExtras(roomBody.quickCalculationExtras)
        : fallbackQuickExtras;

    const computeInput = normalizeCalculatorComputeInput({
      ...roomBody,
      giftRouteMeters: ctx.giftRouteMeters,
      acModels: ctx.models,
      selectedAcModelIds: roomSelectedIds,
      pricelistCustomServices: ctx.customServices,
      selectedExtraServices: roomExtra,
      quickCalculationExtras: roomQuick,
    });

    out.push({ id, roomName, input: computeInput });
  }
  return out.length ? out : null;
}

function filterSelectedExtraServices(
  allowedIds: Set<string>,
  raw: unknown
): SelectedExtraServiceMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: SelectedExtraServiceMap = {};
  for (const id of allowedIds) {
    const v = src[id];
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const checked = o.checked === true;
    const qty = typeof o.qty === "string" ? o.qty : String(o.qty ?? "1");
    out[id] = { checked, qty };
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
    }

    const v = await verifyTelegramMiniAppSession(db, token);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const denied = await assertMiniAppServiceAccess(db, v.uid);
    if (denied) return denied;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const ctx = await loadMiniAppCalculatorContext(db, v.uid);
    const allowedServiceIds = new Set(ctx.customServices.map((s) => s.id));

    const selectedAcModelIds = Array.isArray(body.selectedAcModelIds)
      ? body.selectedAcModelIds.filter((x): x is string => typeof x === "string")
      : [];

    const selectedExtraServices = filterSelectedExtraServices(
      allowedServiceIds,
      body.selectedExtraServices
    );

    const quickCalculationExtras = filterQuickExtras(body.quickCalculationExtras);

    const roomsParsed = parseRoomsFromBody(
      body,
      ctx,
      allowedServiceIds,
      selectedAcModelIds,
      selectedExtraServices,
      quickCalculationExtras
    );

    const globalPercentDiscount =
      typeof body.percentDiscount === "string" ? body.percentDiscount : "0";

    let computeInput: ReturnType<typeof normalizeCalculatorComputeInput>;
    let estimateTotal: number;
    let estimateAutoClientText: string;
    let roomsForPayload: CalculatorRoomInput[] | null = null;

    if (roomsParsed && roomsParsed.length > 0) {
      roomsForPayload = roomsParsed;
      const multi = computeMultiRoomEstimate(
        ctx.prices,
        roomsParsed,
        globalPercentDiscount
      );
      estimateTotal = multi.total;
      estimateAutoClientText = multi.autoClientText;
      computeInput = roomsParsed[0]!.input;
    } else {
      computeInput = normalizeCalculatorComputeInput({
        ...body,
        giftRouteMeters: ctx.giftRouteMeters,
        acModels: ctx.models,
        selectedAcModelIds,
        pricelistCustomServices: ctx.customServices,
        selectedExtraServices,
        quickCalculationExtras,
      });
      const result = computeCalculatorEstimate(ctx.prices, computeInput);
      estimateTotal = result.total;
      estimateAutoClientText = result.autoClientText;
    }

    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim().slice(0, 200) : "";
    const clientContact =
      typeof body.clientContact === "string" ? body.clientContact.trim().slice(0, 200) : "";
    const clientText = estimateAutoClientText.trim();

    const iso = new Date().toISOString();
    const payload = omitUndefinedForFirestore({
      uid: v.uid,
      createdAt: iso,
      updatedAt: iso,
      capacity: computeInput.capacity,
      total: estimateTotal,
      clientName,
      clientContact,
      clientText,

      mountType: computeInput.mountType,
      routeMeters: computeInput.routeMeters,
      baseWallType: computeInput.baseWallType,
      extraHolesNormal: computeInput.extraHolesNormal,
      extraHolesArm: computeInput.extraHolesArm,
      roughInRouteCapacity: computeInput.roughInRouteCapacity,
      roughInHolesBrick: computeInput.roughInHolesBrick,
      roughInHolesArmConcrete: computeInput.roughInHolesArmConcrete,
      carryToolFloors: computeInput.carryToolFloors,
      carryBlockCount: computeInput.carryBlockCount,
      manualDismantlingCost: computeInput.manualDismantlingCost,

      strobaConcreteMeters: computeInput.strobaConcreteMeters,
      strobaBrickMeters: computeInput.strobaBrickMeters,
      strobaDrainConcreteMeters: computeInput.strobaDrainConcreteMeters,
      strobaDrainBrickMeters: computeInput.strobaDrainBrickMeters,
      cable40Meters: computeInput.cable40Meters,
      cable16Meters: computeInput.cable16Meters,

      buyAcAndRouteFromUs: computeInput.buyAcAndRouteFromUs,
      includeBrackets: computeInput.includeBrackets,
      includeGlass: computeInput.includeGlass,
      includeTile: computeInput.includeTile,
      includeDrain: computeInput.includeDrain,
      includePump: computeInput.includePump,
      includeLadderConnection: computeInput.includeLadderConnection,

      percentDiscount: roomsForPayload ? globalPercentDiscount : computeInput.percentDiscount,
      selectedExtraServices: computeInput.selectedExtraServices,
      quickCalculationExtras: computeInput.quickCalculationExtras,
      giftRouteMeters: ctx.giftRouteMeters,
      selectedAcModelIds: computeInput.selectedAcModelIds,
      selectedAcModelId:
        computeInput.selectedAcModelIds[0] && !isCalculatorRoughInCapacity(computeInput.capacity)
          ? computeInput.selectedAcModelIds[0]
          : "",
      ...(roomsForPayload
        ? {
            multiRoom: true,
            roomCount: roomsForPayload.length,
            rooms: roomsForPayload.map((r) => ({
              id: r.id,
              roomName: r.roomName,
              input: slimComputeInputForStorage(r.input),
            })),
          }
        : {}),
    });

    const ref = await db.collection("calculationHistory").add(payload);

    console.log("TELEGRAM_MINIAPP_CALC_SAVE_OK", { uid: v.uid, id: ref.id, total: estimateTotal });

    try {
      await markFirstCalculationIfNeededAndRecordB2B(db, v.uid);
    } catch (e) {
      console.warn("[miniapp-calculation-save] first-calc b2b hook failed", e);
    }

    return NextResponse.json({ ok: true, id: ref.id, total: estimateTotal });
  } catch (e) {
    console.log("TELEGRAM_MINIAPP_CALC_SAVE_FAILED", {
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
