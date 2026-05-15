import { buildMultiRoomClientQuoteMessage, type ClientQuoteRoomBlock } from "@/lib/clientQuoteStandard";
import { computeCalculatorLineItems } from "@/lib/calculator/compute";
import { formatRubles } from "@/lib/calculator/format";
import { clientQuoteItemsWithRoughInHeader } from "@/lib/calculator/roughInMode";
import { sanitizeNonNegativeIntString } from "@/lib/calculator/parse";
import type {
  CalculatorLineItem,
  CalculatorPriceList,
  CalculatorRoomInput,
  MultiRoomComputeResult,
} from "@/lib/calculator/types";

function sumItems(items: CalculatorLineItem[]): number {
  return items.reduce((s, it) => s + it.amount, 0);
}

/**
 * Несколько комнат: каждая считается отдельно (без скидки % внутри комнаты),
 * затем одна глобальная скидка % от суммы всех комнат (берётся из первой комнаты или 0).
 */
export function computeMultiRoomEstimate(
  prices: CalculatorPriceList,
  rooms: CalculatorRoomInput[],
  globalPercentDiscount: string,
  fmt: (n: number) => string = formatRubles
): MultiRoomComputeResult {
  const safeRooms = rooms.length > 0 ? rooms : [];

  const roomResults = safeRooms.map((r) => {
    const roomInput = {
      ...r.input,
      percentDiscount: "0",
    };
    const items = computeCalculatorLineItems(prices, roomInput, fmt, {
      applyPercentDiscount: false,
    });
    const subtotal = sumItems(items);
    return {
      id: r.id,
      roomName: r.roomName.trim() || "Комната",
      items,
      subtotal,
    };
  });

  const flatItems: CalculatorLineItem[] = [];
  for (const rr of roomResults) {
    for (const it of rr.items) {
      flatItems.push({
        ...it,
        title: `${rr.roomName}: ${it.title}`,
      });
    }
  }

  const totalBeforeGlobalDiscount = roomResults.reduce((s, r) => s + r.subtotal, 0);

  const percentDiscountNum = Number(
    sanitizeNonNegativeIntString(globalPercentDiscount, 100) || 0
  );

  const discountByPercent =
    percentDiscountNum > 0
      ? Math.round((totalBeforeGlobalDiscount * percentDiscountNum) / 100)
      : 0;

  const total = Math.max(0, totalBeforeGlobalDiscount - discountByPercent);

  const flatItemsForExport: CalculatorLineItem[] = [...flatItems];
  if (discountByPercent > 0) {
    flatItemsForExport.push({
      title: `Скидка ${percentDiscountNum}% на весь расчёт`,
      amount: -discountByPercent,
      note: `Скидка от суммы ${fmt(totalBeforeGlobalDiscount)}`,
    });
  }

  const quoteRooms: ClientQuoteRoomBlock[] = roomResults.map((r, idx) => {
    const cap = safeRooms[idx]?.input.capacity ?? "";
    const lineItems = r.items.map((it) => ({ title: it.title, amount: it.amount }));
    return {
      roomName: r.roomName,
      items: clientQuoteItemsWithRoughInHeader(cap, lineItems),
      subtotal: r.subtotal,
    };
  });

  const discountLine =
    discountByPercent > 0
      ? {
          title: `Скидка ${percentDiscountNum}% на весь расчёт`,
          amount: -discountByPercent,
        }
      : null;

  const autoClientText = buildMultiRoomClientQuoteMessage({
    rooms: quoteRooms,
    total,
    discountLine,
  });

  return {
    rooms: roomResults,
    totalBeforeGlobalDiscount,
    discountByPercent,
    percentDiscountNum,
    total,
    flatItems: flatItemsForExport,
    autoClientText,
  };
}
