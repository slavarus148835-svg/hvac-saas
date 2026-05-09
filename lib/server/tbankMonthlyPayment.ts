/** Единый контракт месячной подписки T‑Bank Init / webhook / GetState. */
export const TBANK_MONTHLY_AMOUNT_KOPECKS = 1190 * 100;
export const TBANK_MONTHLY_MONTHS = 1;

export type LastPaymentIntentLike = {
  orderId?: string;
  paymentId?: string;
  plan?: string;
  months?: unknown;
  amount?: unknown;
  email?: string;
};

/**
 * Проверяет lastPaymentIntent.orderId и сумму/период.
 * Если в intent потеряны months/amount (частый баг: merge в Firestore затёр вложенный объект),
 * но сумма в ответе банка совпадает с тарифом — всё равно разрешаем выдачу доступа.
 */
export function resolveMonthlySubscriptionIntent(
  intent: LastPaymentIntentLike | undefined,
  orderId: string,
  opts?: { bankAmountKopecks?: number }
):
  | { ok: true; months: number; amount: number; email: string }
  | { ok: false; code: "intent_order_mismatch" | "invalid_amount_months" } {
  const expectedOrder = String(orderId || "").trim();
  if (!intent || String(intent.orderId || "").trim() !== expectedOrder) {
    return { ok: false, code: "intent_order_mismatch" };
  }

  let months = Number(intent.months);
  let amount = Number(intent.amount);

  const bankRaw = opts?.bankAmountKopecks;
  const bankOk =
    bankRaw !== undefined &&
    Number.isFinite(Number(bankRaw)) &&
    Number(bankRaw) === TBANK_MONTHLY_AMOUNT_KOPECKS;

  const intentOk =
    months === TBANK_MONTHLY_MONTHS && amount === TBANK_MONTHLY_AMOUNT_KOPECKS;

  if (!intentOk && bankOk) {
    months = TBANK_MONTHLY_MONTHS;
    amount = TBANK_MONTHLY_AMOUNT_KOPECKS;
  }

  if (months !== TBANK_MONTHLY_MONTHS || amount !== TBANK_MONTHLY_AMOUNT_KOPECKS) {
    return { ok: false, code: "invalid_amount_months" };
  }

  return { ok: true, months, amount, email: String(intent.email || "").trim() };
}
