import type { QuickCalculationExtra, UserCustomService } from "@/lib/customServices";
import {
  MAX_BLOCKS,
  MAX_CABLE_METERS,
  MAX_FLOORS,
  MAX_HOLES,
  MAX_MONEY,
  MAX_ROUTE_METERS,
  MAX_STROBA_METERS,
} from "./constants";
import { buildStructuredClientQuoteMessage } from "@/lib/clientQuoteStandard";
import { formatCapacityBtu } from "./capacityDisplay";
import { formatRubles } from "./format";
import {
  calculatorCapacityTierKeyForPricelist,
  chargedFloorsFromSecond,
  chargedMetersForBilling,
  parseDecimalMetersInput,
  sanitizeNonNegativeIntString,
  sanitizeNonNegativeMoneyString,
} from "./parse";
import { appendStrobaLineItems } from "./strobaBilling";
import {
  clientQuoteItemsWithRoughInHeader,
  effectiveGiftRouteMeters,
  isCalculatorRoughInCapacity,
  ROUGH_IN_HOLE_ARM_CONCRETE_LABEL,
  ROUGH_IN_HOLE_ARM_CONCRETE_PRICE_RUB,
  ROUGH_IN_HOLE_BRICK_LABEL,
  ROUGH_IN_HOLE_BRICK_PRICE_RUB,
  routeCapacityTierKeyForPricelist,
} from "./roughInMode";
import type {
  CalculatorComputeInput,
  CalculatorComputeResult,
  CalculatorLineItem,
  CalculatorPriceList,
  SelectedExtraServiceMap,
} from "./types";

/** Метраж для заголовка строки сметы (1,5 м). */
export function formatMetersQtyRu(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0";
  const x = Math.round(meters * 10) / 10;
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return String(x).replace(".", ",");
}

export type ComputeLineItemsOptions = {
  /** По умолчанию true: добавить строку скидки % на весь расчёт. Для multi-room — false. */
  applyPercentDiscount?: boolean;
};

/**
 * Позиции сметы (до итоговой суммы). Экспорт для multi-room и тестов.
 */
export function computeCalculatorLineItems(
  prices: CalculatorPriceList,
  input: CalculatorComputeInput,
  fmt: (n: number) => string,
  opts?: ComputeLineItemsOptions
): CalculatorLineItem[] {
  const routeMetersRaw = parseDecimalMetersInput(input.routeMeters, MAX_ROUTE_METERS);
  const chargedRouteMeters = chargedMetersForBilling(routeMetersRaw);
  const extraHolesNormalNum = Number(
    sanitizeNonNegativeIntString(input.extraHolesNormal, MAX_HOLES) || 0
  );
  const extraHolesArmNum = Number(
    sanitizeNonNegativeIntString(input.extraHolesArm, MAX_HOLES) || 0
  );
  const roughInHolesBrickNum = Number(
    sanitizeNonNegativeIntString(input.roughInHolesBrick, MAX_HOLES) || 0
  );
  const roughInHolesArmConcreteNum = Number(
    sanitizeNonNegativeIntString(input.roughInHolesArmConcrete, MAX_HOLES) || 0
  );
  const carryToolFloorsNum = Number(
    sanitizeNonNegativeIntString(input.carryToolFloors, MAX_FLOORS) || 0
  );
  const carryBlockCountNum = Number(
    sanitizeNonNegativeIntString(input.carryBlockCount, MAX_BLOCKS) || 0
  );
  const manualDismantlingCostNum = Number(
    sanitizeNonNegativeMoneyString(input.manualDismantlingCost, MAX_MONEY) || 0
  );
  const cable40Raw = parseDecimalMetersInput(input.cable40Meters, MAX_CABLE_METERS);
  const cable16Raw = parseDecimalMetersInput(input.cable16Meters, MAX_CABLE_METERS);
  const chargedCable40Meters = chargedMetersForBilling(cable40Raw);
  const chargedCable16Meters = chargedMetersForBilling(cable16Raw);
  const percentDiscountNum = Number(
    sanitizeNonNegativeIntString(input.percentDiscount, 100) || 0
  );

  const giftM = effectiveGiftRouteMeters(input.capacity, input.giftRouteMeters);
  const routePaidMeters = Math.max(0, chargedRouteMeters - giftM);

  const chargedToolFloors = chargedFloorsFromSecond(carryToolFloorsNum);
  const roughIn = isCalculatorRoughInCapacity(input.capacity);
  const mountTierKey = calculatorCapacityTierKeyForPricelist(input.capacity);
  const routeTierKey = routeCapacityTierKeyForPricelist(input);

  const basePrice = roughIn
    ? 0
    : input.mountType === "standard"
      ? Number(prices[`standard_${mountTierKey}` as keyof CalculatorPriceList] || 0)
      : Number(prices[`existing_${mountTierKey}` as keyof CalculatorPriceList] || 0);

  const routePricePerMeter = Number(
    prices[`route_${routeTierKey}` as keyof CalculatorPriceList] || 0
  );

  const isBigCapacity = routeTierKey === "30" || routeTierKey === "36";

  const items: CalculatorLineItem[] = [];

  if (!roughIn) {
    for (const modelId of input.selectedAcModelIds) {
      const m = input.acModels.find((x) => x.id === modelId);
      const priceVal =
        m && typeof m.price === "number"
          ? m.price
          : m
            ? Number(m.price)
            : NaN;
      if (m && m.name && Number.isFinite(priceVal) && priceVal > 0) {
        items.push({
          title: `Кондиционер: ${m.name}`,
          amount: Math.floor(priceVal),
          note: "Модель из личного прайса",
        });
      }
    }

    const capBtu = formatCapacityBtu(input.capacity);
    items.push({
      title:
        input.mountType === "standard"
          ? `Монтаж на нашу трассу, ${capBtu}`
          : `Монтаж на чужую трассу, ${capBtu}`,
      amount: basePrice,
      note: `Цена за 1 монтаж: ${fmt(basePrice)}`,
    });
  }

  if (!roughIn) {
    if (input.baseWallType === "arm") {
      items.push({
        title: "Доплата за основное отверстие в армированном бетоне",
        amount: prices.baseArmConcreteSurcharge,
        note: `Цена за 1 отверстие: ${fmt(prices.baseArmConcreteSurcharge)}`,
      });
    }
  }

  if (chargedRouteMeters > 0) {
    const routeNote =
      giftM > 0
        ? `Цена за 1 м: ${fmt(routePricePerMeter)}. В подарок ${giftM} м, к оплате ${routePaidMeters} м`
        : `Цена за 1 м: ${fmt(routePricePerMeter)}. К оплате ${routePaidMeters} м`;
    const routeTitle = roughIn
      ? `Трасса под ${formatCapacityBtu(routeTierKey)} × ${formatMetersQtyRu(chargedRouteMeters)} м`
      : `Трасса × ${chargedRouteMeters} м`;
    items.push({
      title: routeTitle,
      amount: routePaidMeters * routePricePerMeter,
      note: routeNote,
    });
  }

  if (!roughIn) {
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
  } else {
    if (roughInHolesBrickNum > 0) {
      items.push({
        title: `${ROUGH_IN_HOLE_BRICK_LABEL} × ${roughInHolesBrickNum} шт`,
        amount: roughInHolesBrickNum * ROUGH_IN_HOLE_BRICK_PRICE_RUB,
        note: `Цена за 1 отверстие: ${fmt(ROUGH_IN_HOLE_BRICK_PRICE_RUB)}`,
      });
    }
    if (roughInHolesArmConcreteNum > 0) {
      items.push({
        title: `${ROUGH_IN_HOLE_ARM_CONCRETE_LABEL} × ${roughInHolesArmConcreteNum} шт`,
        amount: roughInHolesArmConcreteNum * ROUGH_IN_HOLE_ARM_CONCRETE_PRICE_RUB,
        note: `Цена за 1 отверстие: ${fmt(ROUGH_IN_HOLE_ARM_CONCRETE_PRICE_RUB)}`,
      });
    }
  }

  appendStrobaLineItems(items, prices, input, isBigCapacity, fmt);

  if (chargedCable40Meters > 0) {
    const mLabel = formatMetersQtyRu(chargedCable40Meters);
    items.push({
      title: `Кабель-канал 40×40 × ${mLabel} м`,
      amount: chargedCable40Meters * prices.cable40,
      note: `Цена за 1 м: ${fmt(prices.cable40)}. Кабель-канал считается минимум от 1 м`,
    });
  }

  if (chargedCable16Meters > 0) {
    const mLabel = formatMetersQtyRu(chargedCable16Meters);
    items.push({
      title: `Кабель-канал 16×16 × ${mLabel} м`,
      amount: chargedCable16Meters * prices.cable16,
      note: `Цена за 1 м: ${fmt(prices.cable16)}. Кабель-канал считается минимум от 1 м`,
    });
  }

  if (input.includeBrackets) {
    items.push({
      title: "Кронштейны и крепежи",
      amount: prices.bracketsAndFasteners,
      note: `Цена за 1 комплект: ${fmt(prices.bracketsAndFasteners)}`,
    });
  }

  if (input.includeGlass) {
    items.push({
      title: "Демонтаж / монтаж стеклопакета",
      amount: prices.glassUnitWork,
      note: `Цена за 1 услугу: ${fmt(prices.glassUnitWork)}`,
    });
  }

  if (input.includeTile) {
    items.push({
      title: "Резка фасадной плитки",
      amount: prices.facadeTileCut,
      note: `Цена за 1 услугу: ${fmt(prices.facadeTileCut)}`,
    });
  }

  if (input.includeDrain) {
    items.push({
      title: "Монтаж дренажа в водосток",
      amount: prices.drainageToGutter,
      note: `Цена за 1 услугу: ${fmt(prices.drainageToGutter)}`,
    });
  }

  if (input.includePump) {
    items.push({
      title: "Монтаж дренажной помпы",
      amount: prices.drainPumpInstall,
      note: `Цена за 1 услугу: ${fmt(prices.drainPumpInstall)}`,
    });
  }

  if (input.includeLadderConnection) {
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
    const carryTitle =
      carryBlockCountNum === 1
        ? "Подъём кондиционера на плече по лестнице"
        : `Подъём кондиционера на плече по лестнице × ${carryBlockCountNum}`;
    items.push({
      title: carryTitle,
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

  if (input.buyAcAndRouteFromUs) {
    items.push({
      title: "Скидка при покупке кондиционера и трассы у нас",
      amount: -1000,
      note: "Фиксированная скидка: 1000 ₽",
    });
  }

  const selectedExtraServices: SelectedExtraServiceMap = input.selectedExtraServices;
  input.pricelistCustomServices.forEach((service: UserCustomService) => {
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

  input.quickCalculationExtras.forEach((line: QuickCalculationExtra) => {
    if (!line.name.trim() || line.price <= 0) return;
    items.push({
      title: line.name.trim(),
      amount: line.price,
      note: "Добавлено в расчёт вручную",
    });
  });

  const applyPct = opts?.applyPercentDiscount !== false;
  if (!applyPct) {
    return items;
  }

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

  return items;
}

/**
 * Чистый расчёт сметы монтажа (та же логика, что на странице /calculator).
 */
export function computeCalculatorEstimate(
  prices: CalculatorPriceList,
  input: CalculatorComputeInput,
  fmt: (n: number) => string = formatRubles
): CalculatorComputeResult {
  const items = computeCalculatorLineItems(prices, input, fmt);

  const totalRaw = items.reduce((sum, item) => sum + item.amount, 0);
  const total = Number.isFinite(totalRaw) ? Math.max(0, totalRaw) : 0;

  const autoClientText = buildStructuredClientQuoteMessage({
    items: clientQuoteItemsWithRoughInHeader(
      input.capacity,
      items.map((item) => ({ title: item.title, amount: item.amount }))
    ),
    total,
  });

  return {
    items,
    total,
    autoClientText,
  };
}
