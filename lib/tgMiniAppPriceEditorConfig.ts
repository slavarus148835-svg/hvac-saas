import type { CalculatorPriceList } from "@/lib/calculator";

/** Секции редактора прайса Mini App — те же поля, что и веб `priceLists/{uid}`. */
export const TG_MINI_APP_PRICE_SECTIONS: {
  title: string;
  subtitle?: string;
  keys: (keyof CalculatorPriceList)[];
}[] = [
  {
    title: "Монтаж на нашу трассу",
    subtitle: "Базовая стоимость стандартного монтажа",
    keys: [
      "standard_7",
      "standard_9",
      "standard_12",
      "standard_18",
      "standard_24",
      "standard_30",
      "standard_36",
    ],
  },
  {
    title: "Монтаж на чужую трассу",
    subtitle: "Монтаж на уже готовую трассу",
    keys: [
      "existing_7",
      "existing_9",
      "existing_12",
      "existing_18",
      "existing_24",
      "existing_30",
      "existing_36",
    ],
  },
  {
    title: "Трасса",
    subtitle: "Цена 1 м трассы по мощности; подарочные метры — в «Настройках расчёта»",
    keys: [
      "route_7",
      "route_9",
      "route_12",
      "route_18",
      "route_24",
      "route_30",
      "route_36",
    ],
  },
  {
    title: "Отверстия и бетон",
    subtitle: "Доплаты за отверстия",
    keys: ["baseArmConcreteSurcharge", "extraHoleNormal", "extraHoleArm"],
  },
  {
    title: "Штроба",
    subtitle: "Цена за 1 м",
    keys: [
      "stroba_brick_small",
      "stroba_brick_big",
      "stroba_concrete_small",
      "stroba_concrete_big",
    ],
  },
  {
    title: "Кабель-канал",
    subtitle: "Цена за 1 м",
    keys: ["cable40", "cable16"],
  },
  {
    title: "Доплаты и работы",
    subtitle: "Опции калькулятора",
    keys: [
      "bracketsAndFasteners",
      "dismantlingOldUnit",
      "glassUnitWork",
      "facadeTileCut",
      "drainageToGutter",
      "drainPumpInstall",
      "outdoorConnectionLadder",
      "floorCarryTools",
      "outdoorBlockCarry",
    ],
  },
];

const LABELS: Partial<Record<keyof CalculatorPriceList, { label: string; hint?: string; suffix?: string }>> =
  {
    standard_7: { label: "Монтаж, типоразмер 7 BTU", hint: "Цена за 1 монтаж" },
    standard_9: { label: "Монтаж, типоразмер 9 BTU", hint: "Цена за 1 монтаж" },
    standard_12: { label: "Монтаж, типоразмер 12 BTU", hint: "Цена за 1 монтаж" },
    standard_18: { label: "Монтаж, типоразмер 18 BTU", hint: "Цена за 1 монтаж" },
    standard_24: { label: "Монтаж, типоразмер 24 BTU", hint: "Цена за 1 монтаж" },
    standard_30: { label: "Монтаж, типоразмер 30 BTU", hint: "Цена за 1 монтаж" },
    standard_36: { label: "Монтаж, типоразмер 36 BTU", hint: "Цена за 1 монтаж" },
    existing_7: { label: "Монтаж на чужую трассу, 7 BTU", hint: "Цена за 1 монтаж" },
    existing_9: { label: "Монтаж на чужую трассу, 9 BTU", hint: "Цена за 1 монтаж" },
    existing_12: { label: "Монтаж на чужую трассу, 12 BTU", hint: "Цена за 1 монтаж" },
    existing_18: { label: "Монтаж на чужую трассу, 18 BTU", hint: "Цена за 1 монтаж" },
    existing_24: { label: "Монтаж на чужую трассу, 24 BTU", hint: "Цена за 1 монтаж" },
    existing_30: { label: "Монтаж на чужую трассу, 30 BTU", hint: "Цена за 1 монтаж" },
    existing_36: { label: "Монтаж на чужую трассу, 36 BTU", hint: "Цена за 1 монтаж" },
    route_7: { label: "Трасса, типоразмер 7 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    route_9: { label: "Трасса, типоразмер 9 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    route_12: { label: "Трасса, типоразмер 12 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    route_18: { label: "Трасса, типоразмер 18 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    route_24: { label: "Трасса, типоразмер 24 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    route_30: { label: "Трасса, типоразмер 30 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    route_36: { label: "Трасса, типоразмер 36 BTU", hint: "Цена за 1 м", suffix: "₽/м" },
    baseArmConcreteSurcharge: {
      label: "Основное отверстие в армированном бетоне",
      hint: "Цена за 1 отверстие",
    },
    extraHoleNormal: { label: "Доп. отверстие обычное", hint: "Цена за 1 отверстие" },
    extraHoleArm: { label: "Доп. отверстие арм. бетон", hint: "Цена за 1 отверстие" },
    stroba_brick_small: {
      label: "Штроба кирпич / газоблок до типоразмера 24 BTU",
      hint: "Цена за 1 м",
      suffix: "₽/м",
    },
    stroba_brick_big: {
      label: "Штроба кирпич / газоблок от типоразмера 30 BTU",
      hint: "Цена за 1 м",
      suffix: "₽/м",
    },
    stroba_concrete_small: {
      label: "Штроба бетон до типоразмера 24 BTU",
      hint: "Цена за 1 м",
      suffix: "₽/м",
    },
    stroba_concrete_big: {
      label: "Штроба бетон от типоразмера 30 BTU",
      hint: "Цена за 1 м",
      suffix: "₽/м",
    },
    cable40: { label: "Кабель-канал 40×40", hint: "Цена за 1 м", suffix: "₽/м" },
    cable16: { label: "Кабель-канал 16×16", hint: "Цена за 1 м", suffix: "₽/м" },
    bracketsAndFasteners: { label: "Кронштейны и крепёж", hint: "За комплект" },
    dismantlingOldUnit: { label: "Демонтаж старого блока", hint: "За работу" },
    glassUnitWork: { label: "Стеклопакет", hint: "За работу" },
    facadeTileCut: { label: "Плитка фасад", hint: "За работу" },
    drainageToGutter: { label: "Дренаж в водосток", hint: "За работу" },
    drainPumpInstall: { label: "Дренажная помпа", hint: "За работу" },
    outdoorConnectionLadder: { label: "Подключение с лестницы (внешний блок)", hint: "За работу" },
    floorCarryTools: { label: "Подъём инструмента (за этаж)", hint: "За этаж" },
    outdoorBlockCarry: { label: "Подъём внешнего блока", hint: "За блок" },
  };

export function tgMiniAppPriceFieldMeta(key: keyof CalculatorPriceList): {
  label: string;
  hint?: string;
  suffix?: string;
} {
  return (
    LABELS[key] ?? {
      label: String(key),
    }
  );
}
