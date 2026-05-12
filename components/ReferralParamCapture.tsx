"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PARTNER_REFERRAL_STORAGE_KEY } from "@/lib/partner/constants";

/**
 * Сохраняет `?ref=` для привязки реферера при регистрации. Не показывает UI.
 */
export function ReferralParamCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("ref");
    if (!raw || typeof window === "undefined") return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(PARTNER_REFERRAL_STORAGE_KEY, trimmed);
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  return null;
}
