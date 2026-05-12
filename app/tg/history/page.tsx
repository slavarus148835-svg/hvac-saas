"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { formatCapacityBtu } from "@/lib/calculator";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import {
  deleteMiniAppCalculation,
  fetchMiniAppHistoryList,
  type MiniAppHistoryListItem,
} from "@/lib/telegramMiniAppCalculatorApi";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "20px 16px 32px",
  maxWidth: 440,
  margin: "0 auto",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  background: "#f8fafc",
  color: "#0f172a",
  boxSizing: "border-box",
  paddingBottom: "max(32px, env(safe-area-inset-bottom))",
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 16px",
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
  textDecoration: "none",
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#ffffff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 10,
};

function formatWhen(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mountLabel(m: string) {
  return m === "existing" ? "Чужая трасса" : "Наша трасса";
}

export default function TgHistoryPage() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<TelegramMiniAppProfile | null>(null);
  const [authUi, setAuthUi] = useState<"checking" | "profile" | "need" | "error" | "no">(
    "checking"
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [items, setItems] = useState<MiniAppHistoryListItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wa = await waitForTelegramWebApp({ intervalMs: 200, maxAttempts: 10 });
      if (wa) prepareTelegramMiniAppShell(wa);
      const initData = typeof wa?.initData === "string" ? wa.initData.trim() : "";
      const resolved = await ensureTelegramMiniAppProfile(initData || null);
      if (cancelled) return;
      if (resolved.status === "profile") {
        setProfile(resolved.profile);
        setAuthUi("profile");
        const h = await fetchMiniAppHistoryList();
        if (h.ok) {
          setItems(h.items);
          setListError(null);
        } else {
          setListError(h.error);
        }
      } else if (resolved.status === "need_registration") {
        setAuthUi("need");
      } else if (resolved.status === "error") {
        setAuthUi("error");
        setAuthError(resolved.message);
      } else {
        const r2 = await ensureTelegramMiniAppProfile(null);
        if (cancelled) return;
        if (r2.status === "profile") {
          setProfile(r2.profile);
          setAuthUi("profile");
          const h = await fetchMiniAppHistoryList();
          if (h.ok) {
            setItems(h.items);
            setListError(null);
          } else {
            setListError(h.error);
          }
        } else {
          setAuthUi("no");
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        <h1 style={title}>Сохранённые расчёты</h1>
        {ready ? <TgMiniAppNav /> : null}

        {!ready ? (
          <p>Загрузка…</p>
        ) : authUi !== "profile" ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 16,
            }}
          >
            {authUi === "need" ? (
              <>
                <p style={{ margin: "0 0 16px" }}>Войдите в аккаунт HVAC-SaaS.</p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/register" style={btnSecondary}>
                  Регистрация
                </Link>
              </>
            ) : null}
            {authUi === "error" && authError ? (
              <p style={{ color: "#b91c1c", margin: 0 }}>{authError}</p>
            ) : null}
            {authUi === "no" ? (
              <p style={{ margin: 0, color: "#64748b" }}>Нет сессии Mini App.</p>
            ) : null}
          </div>
        ) : (
          <>
            {profile?.email ? (
              <p style={{ fontSize: 14, color: "#64748b", marginTop: 0 }}>{profile.email}</p>
            ) : null}
            {listError ? (
              <p style={{ color: "#b91c1c" }}>{listError}</p>
            ) : items.length === 0 ? (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  padding: 20,
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#0f172a" }}>
                  Сохранённые расчёты появятся здесь
                </p>
                <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 14 }}>
                  Сделайте расчёт в калькуляторе и нажмите «Сохранить».
                </p>
                <Link href="/tg/calculator" style={btn}>
                  Сделать первый расчёт
                </Link>
              </div>
            ) : (
              items.map((row) => (
                <div
                  key={row.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: "16px 16px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                    {row.clientName?.trim() || "Без имени"}
                  </div>
                  <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
                    <div>{formatWhen(row.createdAt)}</div>
                    <div>
                      {mountLabel(row.mountType)} · {formatCapacityBtu(row.capacity)}
                    </div>
                    {typeof row.roomCount === "number" && row.roomCount > 1 ? (
                      <div style={{ fontSize: 13, color: "#64748b" }}>
                        Комнат: {row.roomCount}
                      </div>
                    ) : null}
                    <div style={{ fontWeight: 800, marginTop: 8, color: "#0f172a" }}>
                      {new Intl.NumberFormat("ru-RU").format(Math.round(row.total))} ₽
                    </div>
                  </div>
                  <Link
                    href={`/tg/calculator?historyId=${encodeURIComponent(row.id)}`}
                    style={{ ...btn, marginTop: 12 }}
                  >
                    Открыть расчёт
                  </Link>
                  <button
                    type="button"
                    style={{
                      ...btnSecondary,
                      opacity: deletingId === row.id ? 0.65 : 1,
                    }}
                    disabled={deletingId !== null}
                    onClick={() => {
                      if (!window.confirm("Удалить этот расчёт?")) return;
                      setDeleteError(null);
                      setDeletingId(row.id);
                      void (async () => {
                        const r = await deleteMiniAppCalculation(row.id);
                        if (r.ok) {
                          setItems((prev) => prev.filter((x) => x.id !== row.id));
                        } else {
                          setDeleteError(r.error);
                          alert(r.error);
                        }
                        setDeletingId(null);
                      })();
                    }}
                  >
                    {deletingId === row.id ? "Удаление…" : "Удалить расчёт"}
                  </button>
                </div>
              ))
            )}
            {deleteError ? (
              <p style={{ color: "#b91c1c", marginTop: 10 }}>{deleteError}</p>
            ) : null}
          </>
        )}

        <Link href="/tg/calculator" style={{ ...btnSecondary, marginTop: 20 }}>
          К калькулятору
        </Link>
        <Link href="/tg" style={{ ...btnSecondary }}>
          На главную /tg
        </Link>
      </div>
    </>
  );
}
