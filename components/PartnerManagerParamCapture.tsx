"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  PARTNER_MANAGER_FIRST_TOUCH_MS_KEY,
  PARTNER_MANAGER_STORAGE_KEY,
} from "@/lib/partner/b2bConstants";
import {
  isValidPartnerManagerCode,
  normalizePartnerManagerCode,
} from "@/lib/partner/partnerManagerCode";

/**
 * Сохраняет `?partner=` для B2B-менеджеров (отдельно от пользовательской ?ref=).
 */
export function PartnerManagerParamCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("partner");
    if (!raw || typeof window === "undefined") return;
    const code = normalizePartnerManagerCode(raw);
    if (!isValidPartnerManagerCode(code)) return;
    try {
      localStorage.setItem(PARTNER_MANAGER_STORAGE_KEY, code);
      if (!localStorage.getItem(PARTNER_MANAGER_FIRST_TOUCH_MS_KEY)) {
        localStorage.setItem(PARTNER_MANAGER_FIRST_TOUCH_MS_KEY, String(Date.now()));
      }
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  return null;
}
