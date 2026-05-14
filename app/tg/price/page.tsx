"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import type { CalculatorPriceList } from "@/lib/calculator";
import { MINI_APP_PRICE_FORM_KEYS } from "@/lib/miniAppPriceForm";
import { TG_MINI_APP_PRICE_SECTIONS, tgMiniAppPriceFieldMeta } from "@/lib/tgMiniAppPriceEditorConfig";
import { tgHapticButtonTap, tgHapticNotification } from "@/lib/telegramHaptic";
import {
  fetchMiniAppPriceForm,
  saveMiniAppPriceForm,
} from "@/lib/telegramMiniAppCalculatorApi";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import { useScrollInputIntoView } from "@/lib/useScrollInputIntoView";

const page: React.CSSProperties = {
  minHeight: "100dvh",
  maxHeight: "100dvh",
  overflowY: "auto",
  scrollPaddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
  padding:
    "max(12px, env(safe-area-inset-top)) 16px calc(96px + env(safe-area-inset-bottom))",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 6px",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 14,
  fontSize: 14,
  lineHeight: 1.45,
  color: "#334155",
};

const btn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "16px 18px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 10,
  textDecoration: "none",
};

function emptyForm(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of MINI_APP_PRICE_FORM_KEYS) {
    o[k] = "0";
  }
  return o;
}

type TgPriceAuthUi =
  | "profile"
  | "need_email_linking"
  | "need_registration"
  | "error"
  | "no_init"
  | "no_tg";

export default function TgPricePage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState(false);
  const [authUi, setAuthUi] = useState<TgPriceAuthUi>("need_registration");
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailLinkInitData, setEmailLinkInitData] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [giftRouteMeters, setGiftRouteMeters] = useState("1");
  const [hasSavedPriceList, setHasSavedPriceList] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  useScrollInputIntoView(ready && authUi === "profile");

  const loadPriceForm = async () => {
    const p = await fetchMiniAppPriceForm();
    if (!p.ok) {
      setLoadError(p.error);
      return;
    }
    const next = emptyForm();
    for (const k of MINI_APP_PRICE_FORM_KEYS) {
      const v = p.form[k];
      next[k] = typeof v === "string" && v.trim() ? v : next[k];
    }
    setForm(next);
    setGiftRouteMeters(String(p.giftRouteMeters));
    setHasSavedPriceList(p.hasSavedPriceList);
    setLoadError(null);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({ intervalMs: 200, maxAttempts: 12 });
      const tg = Boolean(wa);
      if (wa) {
        prepareTelegramMiniAppShell(wa);
        setInTelegram(true);
      } else {
        setInTelegram(false);
      }
      const initData = typeof wa?.initData === "string" ? wa.initData.trim() : "";
      const r = await ensureTelegramMiniAppProfile(initData || null);
      if (cancelled) return;
      if (r.status === "profile") {
        setAuthUi("profile");
        setAuthError(null);
        await loadPriceForm();
        if (cancelled) return;
        setReady(true);
        return;
      }
      if (r.status === "need_email_linking") {
        if (r.initData) {
          setAuthUi("need_email_linking");
          setEmailLinkInitData(r.initData);
        } else {
          setAuthUi("need_registration");
          setEmailLinkInitData("");
        }
        setAuthError(null);
        setReady(true);
        return;
      }
      if (r.status === "need_registration") {
        setAuthUi("need_registration");
        setAuthError(null);
        setReady(true);
        return;
      }
      if (r.status === "error") {
        setAuthUi("error");
        setAuthError(r.message);
        setReady(true);
        return;
      }
      setAuthUi(tg ? "no_init" : "no_tg");
      setAuthError(null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pricesPayload = useMemo(() => {
    const prices: Record<string, number> = {};
    for (const k of MINI_APP_PRICE_FORM_KEYS) {
      const raw = String(form[k] ?? "0").replace(/\s/g, "").replace(",", ".");
      const n = Number(raw);
      prices[k] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }
    return prices as Record<keyof CalculatorPriceList, number>;
  }, [form]);

  async function onSave() {
    if (saveBusy) return;
    tgHapticButtonTap();
    setSaveBusy(true);
    const gift = Math.max(0, Math.floor(Number(giftRouteMeters.replace(/\D/g, "") || 0)));
    const r = await saveMiniAppPriceForm({
      prices: pricesPayload,
      giftRouteMeters: gift,
    });
    setSaveBusy(false);
    if (r.ok) {
      tgHapticNotification("success");
      setHasSavedPriceList(true);
    } else {
      tgHapticNotification("error");
      setLoadError(r.error);
    }
  }

  function setField(key: keyof CalculatorPriceList, value: string) {
    setForm((prev) => ({ ...prev, [key]: value.replace(/[^\d]/g, "") }));
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        <h1 style={title}>Личный прайс</h1>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Те же поля, что в веб-кабинете: документ прайса в Firestore и подарочные метры трассы в
          профиле пользователя.
        </p>
        {ready && authUi === "profile" ? <TgMiniAppNav /> : null}

        {!ready ? (
          <p style={{ color: "#64748b" }}>Загрузка…</p>
        ) : authUi !== "profile" ? (
          <div style={card}>
            {inTelegram && authUi === "need_email_linking" && emailLinkInitData ? (
              <>
                <TgMiniAppEmailLink
                  initData={emailLinkInitData}
                  onLinked={async () => {
                    setAuthUi("profile");
                    setAuthError(null);
                    await loadPriceForm();
                  }}
                />
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
                  Нет аккаунта?{" "}
                  <Link href="/register" style={{ color: "#0f172a", fontWeight: 600 }}>
                    Регистрация на сайте
                  </Link>
                </p>
              </>
            ) : null}
            {inTelegram && authUi === "need_registration" ? (
              <>
                <p style={{ margin: "0 0 12px" }}>
                  Подключите Telegram к профилю HVAC-SaaS — тогда откроется редактирование прайса.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href="/login" style={{ ...btn, flex: 1, padding: "12px", fontSize: 15 }}>
                    Войти
                  </Link>
                  <Link
                    href="/register"
                    style={{ ...btnSecondary, flex: 1, padding: "12px", fontSize: 15, marginTop: 0 }}
                  >
                    Регистрация
                  </Link>
                </div>
              </>
            ) : null}
            {!inTelegram && (authUi === "need_registration" || authUi === "need_email_linking") ? (
              <>
                <p style={{ margin: "0 0 12px" }}>
                  Свяжите Telegram с профилем HVAC-SaaS или войдите на сайте, чтобы редактировать
                  прайс.
                </p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Зарегистрироваться
                </Link>
              </>
            ) : null}
            {authUi === "error" && authError ? (
              <p style={{ margin: 0, color: "#b91c1c" }}>{authError}</p>
            ) : null}
            {authUi === "no_init" ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                Нет initData — откройте Mini App из бота или войдите с сохранённой сессией.
              </p>
            ) : null}
            {authUi === "no_tg" ? (
              <>
                <p style={{ margin: "0 0 12px", color: "#64748b" }}>
                  Нет сессии Mini App. Войдите на сайте или откройте приложение из бота.
                </p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Зарегистрироваться
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <>
            {!hasSavedPriceList ? (
              <div style={{ ...card, background: "#fffbeb", borderColor: "#fcd34d" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>Проверьте личный прайс перед первым расчётом</p>
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "#92400e" }}>
                  Сейчас подставлены значения по умолчанию. Сохраните свои цены.
                </p>
              </div>
            ) : null}

            {loadError ? (
              <p style={{ color: "#b91c1c", marginBottom: 12 }}>{loadError}</p>
            ) : null}

            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Подарочные метры трассы</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
                В калькуляре: к оплате метры минус это значение (целое ≥ 0).
              </p>
              <input
                value={giftRouteMeters}
                onChange={(e) => setGiftRouteMeters(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {TG_MINI_APP_PRICE_SECTIONS.map((sec) => (
              <div key={sec.title} style={card}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{sec.title}</div>
                {sec.subtitle ? (
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>{sec.subtitle}</p>
                ) : null}
                {sec.keys.map((key) => {
                  const m = tgMiniAppPriceFieldMeta(key);
                  return (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                        {m.hint ? (
                          <div style={{ fontSize: 12, color: "#64748b" }}>{m.hint}</div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          value={form[key] ?? ""}
                          onChange={(e) => setField(key, e.target.value)}
                          inputMode="numeric"
                          style={{
                            width: 112,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #e2e8f0",
                            fontSize: 16,
                            textAlign: "right",
                            boxSizing: "border-box",
                          }}
                        />
                        <span style={{ fontSize: 14, color: "#64748b", minWidth: 36 }}>
                          {m.suffix ?? "₽"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            <button type="button" style={btn} disabled={saveBusy} onClick={() => void onSave()}>
              {saveBusy ? "Сохранение…" : "Сохранить прайс"}
            </button>
            <Link href="/tg/calculator" style={btnSecondary}>
              Вернуться в калькулятор
            </Link>
          </>
        )}
      </div>
    </>
  );
}
