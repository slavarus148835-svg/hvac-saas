const RU_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function localNormalizePartnerCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Имя → база для partner code (латиница, нижний регистр, подчёркивания).
 * Fallback: m_<telegramUserId>
 */
export function nameToPartnerCodeBase(name: string, telegramUserId: number): string {
  const raw = String(name ?? "").trim();
  let slug = "";
  for (const ch of raw) {
    const lower = ch.toLowerCase();
    if (/[a-z0-9]/.test(lower)) {
      slug += lower;
    } else if (lower === "_" || lower === "-") {
      slug += "_";
    } else if (/\s/.test(ch)) {
      slug += "_";
    } else {
      const mapped = RU_TO_LAT[lower];
      if (mapped !== undefined) slug += mapped;
    }
  }
  slug = slug.replace(/_+/g, "_").replace(/^_|_$/g, "");
  let normalized = localNormalizePartnerCode(slug);
  if (!normalized || normalized.length < 2) {
    normalized =
      localNormalizePartnerCode(`m_${telegramUserId}`) || `m_${telegramUserId}`;
  }
  return normalized.slice(0, 48);
}
