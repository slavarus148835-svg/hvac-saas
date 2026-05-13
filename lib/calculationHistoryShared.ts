import { deleteDoc, doc, type Firestore } from "firebase/firestore";

/** Единый текст подтверждения: веб и Mini App. */
export const CONFIRM_DELETE_CALCULATION_MESSAGE = "Удалить расчёт?";

export type DeleteCalculationHistoryResult =
  | { ok: true }
  | { ok: false; error: string };

/** Удаление записи истории через клиентский Firebase (веб / кабинет). */
export async function deleteCalculationHistoryDocument(
  db: Firestore,
  id: string
): Promise<DeleteCalculationHistoryResult> {
  try {
    await deleteDoc(doc(db, "calculationHistory", id));
    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}
