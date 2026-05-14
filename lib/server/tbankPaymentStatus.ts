/**
 * Статусы T-Bank (Tinkoff Acquiring) в нотификациях / GetState.
 * В проекте доступ к сервису выдаётся только при CONFIRMED — то же для B2B-комиссии.
 */

/** Успешное списание: деньги у клиента, платёж завершён. */
export const TBANK_ACQUIRING_SUCCESS_STATUSES = new Set(["CONFIRMED"]);

/** После успешной оплаты — отмена/возврат (для сторно комиссии менеджера). */
export const TBANK_ACQUIRING_REFUND_LIKE_STATUSES = new Set([
  "REFUNDED",
  "PARTIAL_REFUNDED",
  "REVERSED",
]);

export function normalizeTbankPaymentStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

export function isTbankAcquiringPaymentSuccess(status: unknown): boolean {
  return TBANK_ACQUIRING_SUCCESS_STATUSES.has(normalizeTbankPaymentStatus(status));
}

export function isTbankAcquiringRefundLikeStatus(status: unknown): boolean {
  return TBANK_ACQUIRING_REFUND_LIKE_STATUSES.has(normalizeTbankPaymentStatus(status));
}
