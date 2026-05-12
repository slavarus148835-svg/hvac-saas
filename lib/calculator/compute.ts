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
  capacityKey,
  chargedFloorsFromSecond,
  chargedMetersForBilling,
  minOneMeter,
  parseDecimalMetersInput,
  sanitizeNonNegativeIntString,
  sanitizeNonNegativeMoneyString,
} from "./parse";
import type {
  CalculatorComputeInput,
  CalculatorComputeResult,
  CalculatorLineItem,
  CalculatorPriceList,
  SelectedExtraServiceMap,
} from "./types";

function computeLineItems(
  prices: CalculatorPriceList,
  input: CalculatorComputeInput,
  fmt: (n: number) => string
): CalculatorLineItem[] {
  const routeMetersRaw = parseDecimalMetersInput(input.routeMeters, MAX_ROUTE_METERS);
  const chargedRouteMeters = chargedMetersForBilling(routeMetersRaw);
  const extraHolesNormalNum = Number(
    sanitizeNonNegativeIntString(input.extraHolesNormal, MAX_HOLES) || 0
  );
  const extraHolesArmNum = Number(
    sanitizeNonNegativeIntString(input.extraHolesArm, MAX_HOLES) || 0
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
  const strobaMetersNum = parseDecimalMetersInput(input.strobaMeters, MAX_STROBA_METERS);
  const cable40MetersNum = Number(
    sanitizeNonNegativeIntString(input.cable40Meters, MAX_CABLE_METERS) || 0
  );
  const cable16MetersNum = Number(
    sanitizeNonNegativeIntString(input.cable16Meters, MAX_CABLE_METERS) || 0
  );
  const percentDiscountNum = Number(
    sanitizeNonNegativeIntString(input.percentDiscount, 100) || 0
  );

  const giftM = Math.max(0, Math.floor(Number(input.giftRouteMeters) || 0));
  const routePaidMeters = Math.max(0, chargedRouteMeters - giftM);

  const chargedToolFloors = chargedFloorsFromSecond(carryToolFloorsNum);
  const chargedStrobaMeters = chargedMetersForBilling(strobaMetersNum);
  const chargedCable40Meters = minOneMeter(cable40MetersNum);
  const chargedCable16Meters = minOneMeter(cable16MetersNum);

  const capKey = capacityKey(input.capacity);

  const basePrice =
    input.mountType === "standard"
      ? Number(prices[`standard_${capKey}` as keyof CalculatorPriceList] || 0)
      : Number(prices[`existing_${capKey}` as keyof CalculatorPriceList] || 0);

  const routePricePerMeter = Number(
    prices[`route_${capKey}` as keyof CalculatorPriceList] || 0
  );

  const isBigCapacity = input.capacity === "30" || input.capacity === "36";

  let strobaPricePerMeter = 0;
  if (input.strobaType === "brick") {
    strobaPricePerMeter = isBigCapacity
      ? prices.stroba_brick_big
      : prices.stroba_brick_small;
  }
  if (input.strobaType === "concrete") {
    strobaPricePerMeter = isBigCapacity
      ? prices.stroba_concrete_big
      : prices.stroba_concrete_small;
  }

  const items: CalculatorLineItem[] = [];

  const capBtu = formatCapacityBtu(input.capacity);
  items.push({
    title:
      input.mountType === "standard"
        ? `Монтаж на нашу трассу, ${capBtu}`
        : `Монтаж на чужую трассу, ${capBtu}`,
    amount: basePrice,
    note: `Цена за 1 монтаж: ${fmt(basePrice)}`,
  });

  for (const modelId of input.selectedAcModelIds) {
    const m = input.acModels.find((x) => x.id === modelId);
    if (m && m.name && Number(m.price) > 0) {
      items.push({
        title: `Кондиционер: ${m.name}`,
        amount: Number(m.price),
        note: "Модель из личного прайса",
      });
    }
  }

  if (input.baseWallType === "arm") {
    items.push({
      title: "Доплата за основное отверстие в армированном бетоне",
      amount: prices.baseArmConcreteSurcharge,
      note: `Цена за 1 отверстие: ${fmt(prices.baseArmConcreteSurcharge)}`,
    });
  }

  if (chargedRouteMeters > 0) {
    items.push({
      title: `Трасса × ${chargedRouteMeters} м`,
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

  if (input.strobaType !== "none" && chargedStrobaMeters > 0) {
    items.push({
      title: `Штробление × ${chargedStrobaMeters} м`,
      amount: chargedStrobaMeters * strobaPricePerMeter,
      note: `Цена за 1 м: ${fmt(strobaPricePerMeter)}. От 0 до 1 м (не включая 1) — в расчёт 1 м; от 1 м — по введённым метрам`,
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
  const items = computeLineItems(prices, input, fmt);

  const totalRaw = items.reduce((sum, item) => sum + item.amount, 0);
  const total = Number.isFinite(totalRaw) ? Math.max(0, totalRaw) : 0;

  const autoClientText = buildStructuredClientQuoteMessage({
    items: items.map((item) => ({ title: item.title, amount: item.amount })),
    total,
    formatMoney: fmt,
  });

  return {
    items,
    total,
    autoClientText,
  };
}
