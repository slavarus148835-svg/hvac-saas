"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  clearPartnerReferralStorage,
  savePartnerReferralCodeForSession,
} from "@/lib/partner/clientPartnerReferralStorage";
import {
  isValidPartnerManagerCode,
  normalizePartnerManagerCode,
} from "@/lib/partner/partnerManagerCode";

/**
 * Сохраняет `?partner=` для B2B-менеджеров только в sessionStorage текущей вкладки.
 */
export function PartnerManagerParamCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = searchParams.get("partner");
    if (!raw) {
      clearPartnerReferralStorage();
      return;
    }
    const code = normalizePartnerManagerCode(raw);
    if (!isValidPartnerManagerCode(code)) {
      clearPartnerReferralStorage();
      return;
    }
    savePartnerReferralCodeForSession(code);
  }, [searchParams]);

  return null;
}
