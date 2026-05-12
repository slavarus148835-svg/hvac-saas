"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { tgHapticButtonTap, tgHapticNotification } from "@/lib/telegramHaptic";
import { fetchMiniAppSettings, patchMiniAppSettings } from "@/lib/telegramMiniAppCalculatorApi";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";

const page: React.CSSProperties = {
  minHeight: "100dvh",
  padding:
    "max(12px, env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))",
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
  margin: "0 0 8px",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 14,
  fontSize: 14,
};

const label: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginBottom: 6,
  color: "#475569",
  fontSize: 13,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 14,
  boxSizing: "border-box",
};

const textarea: React.CSSProperties = {
  ...input,
  minHeight: 88,
  resize: "vertical" as const,
  fontFamily: "inherit",
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

const btnGhost: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 10,
  textDecoration: "none",
};

export default function TgSettingsPage() {
  const [ready, setReady] = useState(false);
  const [authOk, setAuthOk] = useState(false);
  const [giftRouteMeters, setGiftRouteMeters] = useState("1");
  const [quoteFooterTemplate, setQuoteFooterTemplate] = useState("");
  const [guaranteeText, setGuaranteeText] = useState("");
  const [masterContact, setMasterContact] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({ intervalMs: 200, maxAttempts: 12 });
      if (wa) prepareTelegramMiniAppShell(wa);
      const initData = typeof wa?.initData === "string" ? wa.initData.trim() : "";
      const r = await ensureTelegramMiniAppProfile(initData || null);
      if (cancelled) return;
      if (r.status !== "profile") {
        setAuthOk(false);
        setReady(true);
        return;
      }
      setAuthOk(true);
      const s = await fetchMiniAppSettings();
      if (cancelled) return;
      if (!s.ok) {
        setLoadError(s.error);
        setReady(true);
        return;
      }
      setGiftRouteMeters(String(s.giftRouteMeters));
      setQuoteFooterTemplate(s.quoteFooterTemplate);
      setGuaranteeText(s.guaranteeText);
      setMasterContact(s.masterContact);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (saveBusy) return;
    tgHapticButtonTap();
    setSaveBusy(true);
    const gift = Math.max(0, Math.floor(Number(giftRouteMeters.replace(/\D/g, "") || 0)));
    const r = await patchMiniAppSettings({
      giftRouteMeters: gift,
      quoteFooterTemplate,
      guaranteeText,
      masterContact,
    });
    setSaveBusy(false);
    if (r.ok) {
      tgHapticNotification("success");
    } else {
      tgHapticNotification("error");
      setLoadError(r.error);
    }
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        <h1 style={title}>Настройки расчёта</h1>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Подарочные метры и тексты для сметы хранятся в вашем профиле и подставляются в Mini App.
        </p>
        <TgMiniAppNav />

        {!ready ? (
          <p style={{ color: "#64748b" }}>Загрузка…</p>
        ) : !authOk ? (
          <div style={card}>
            <p style={{ margin: "0 0 12px" }}>Войдите через Mini App.</p>
            <Link href="/login" style={btn}>
              Войти
            </Link>
          </div>
        ) : (
          <>
            {loadError ? <p style={{ color: "#b91c1c", marginBottom: 10 }}>{loadError}</p> : null}

            <div style={card}>
              <span style={label}>Подарочные метры трассы</span>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
                Дублируется на странице прайса: здесь можно изменить без редактирования всех цен.
              </p>
              <input
                style={input}
                inputMode="numeric"
                value={giftRouteMeters}
                onChange={(e) => setGiftRouteMeters(e.target.value.replace(/\D/g, ""))}
              />
            </div>

            <div style={card}>
              <span style={label}>Текст гарантии (в конец сметы)</span>
              <textarea
                style={textarea}
                value={guaranteeText}
                onChange={(e) => setGuaranteeText(e.target.value)}
                placeholder="Например: гарантия на монтаж 12 мес."
              />
            </div>

            <div style={card}>
              <span style={label}>Контакт мастера</span>
              <input
                style={input}
                value={masterContact}
                onChange={(e) => setMasterContact(e.target.value)}
                placeholder="Телефон / Telegram для клиента"
              />
            </div>

            <div style={card}>
              <span style={label}>Шаблон финального текста для клиента</span>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>
                Добавляется в конец текста сметы при отправке из калькулятора.
              </p>
              <textarea
                style={{ ...textarea, minHeight: 120 }}
                value={quoteFooterTemplate}
                onChange={(e) => setQuoteFooterTemplate(e.target.value)}
                placeholder="Например: звоните для уточнения даты выезда…"
              />
            </div>

            <button type="button" style={btn} disabled={saveBusy} onClick={() => void onSave()}>
              {saveBusy ? "Сохранение…" : "Сохранить настройки"}
            </button>
            <Link href="/tg/calculator" style={btnGhost}>
              В калькулятор
            </Link>
          </>
        )}
      </div>
    </>
  );
}
