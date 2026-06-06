"use client";

import { useCallback, useEffect, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import {
  resolveTgProtectedPhase,
  type MiniAppAccessStatus,
  type TgProtectedPhase,
} from "@/lib/miniAppAccessGate";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";

export type TgMiniAppAccessState = {
  phase: TgProtectedPhase;
  initData: string;
  profile: TelegramMiniAppProfile | null;
  access: MiniAppAccessStatus | null;
  errorMessage: string | null;
  pendingRegistration: boolean;
  refresh: () => void;
};

function accessFromResolved(resolved: {
  accessAllowed?: boolean;
  subscriptionAllowed?: boolean;
  accessGate?: string;
  emailVerifiedByCode?: boolean;
}): MiniAppAccessStatus {
  const gateReason =
    typeof resolved.accessGate === "string"
      ? (resolved.accessGate as MiniAppAccessStatus["reason"])
      : resolved.emailVerifiedByCode === true
        ? "ok"
        : "email_not_verified";
  const identityOk = resolved.accessAllowed === true;
  const subscriptionAllowed = resolved.subscriptionAllowed !== false;
  return {
    allowed: identityOk && subscriptionAllowed,
    reason: gateReason,
    emailVerifiedByCode: resolved.emailVerifiedByCode === true,
    subscriptionAllowed,
  };
}

export function useTgMiniAppAccess(options?: {
  enabled?: boolean;
  requireTelegram?: boolean;
  requireSubscription?: boolean;
}): TgMiniAppAccessState {
  const enabled = options?.enabled !== false;
  const requireTelegram = options?.requireTelegram !== false;
  const requireSubscription = options?.requireSubscription !== false;
  const [phase, setPhase] = useState<TgProtectedPhase>("loading");
  const [initData, setInitData] = useState("");
  const [profile, setProfile] = useState<TelegramMiniAppProfile | null>(null);
  const [access, setAccess] = useState<MiniAppAccessStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      setPhase("loading");
      setErrorMessage(null);
      setPendingRegistration(false);

      const wa = await waitForTelegramWebApp({ intervalMs: 200, maxAttempts: 12 });
      if (cancelled) return;

      if (!wa) {
        if (requireTelegram) {
          setPhase("no_init");
          return;
        }
        setPhase("need_link");
        return;
      }

      prepareTelegramMiniAppShell(wa);
      const init = typeof wa.initData === "string" ? wa.initData.trim() : "";
      setInitData(init);

      const resolved = await ensureTelegramMiniAppProfile(init || null);
      if (cancelled) return;

      if (resolved.status === "pending_email_registration") {
        setProfile(null);
        setAccess(null);
        setPendingRegistration(true);
        setPhase("need_link");
        return;
      }

      if (resolved.status === "need_email_linking") {
        setInitData(resolved.initData || init);
        setProfile(null);
        setAccess(null);
        setPendingRegistration(true);
        setPhase("need_link");
        return;
      }

      if (resolved.status === "need_registration") {
        setProfile(null);
        setAccess(null);
        setPendingRegistration(true);
        setPhase("need_link");
        return;
      }

      if (resolved.status === "error") {
        setErrorMessage(resolved.message);
        setPhase("error");
        return;
      }

      if (resolved.status === "no_init") {
        setPhase("no_init");
        return;
      }

      if (resolved.status === "profile") {
        const accessStatus = accessFromResolved({
          accessAllowed: resolved.accessAllowed,
          subscriptionAllowed: resolved.subscriptionAllowed,
          accessGate: resolved.accessGate,
          emailVerifiedByCode: resolved.emailVerifiedByCode,
        });
        setProfile(resolved.profile);
        setAccess(accessStatus);
        setPendingRegistration(false);
        setPhase(
          resolveTgProtectedPhase({
            hasInitData: Boolean(init),
            profile: resolved.profile,
            access: accessStatus,
            pendingRegistration: false,
            requireSubscription,
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, requireTelegram, requireSubscription, tick]);

  return {
    phase,
    initData,
    profile,
    access,
    errorMessage,
    pendingRegistration,
    refresh,
  };
}
