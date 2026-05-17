"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { tgHapticButtonTap, tgHapticNotification } from "@/lib/telegramHaptic";
import {
  createMiniAppModel,
  deleteMiniAppModel,
  fetchMiniAppModels,
  updateMiniAppModel,
  type MiniAppModelRow,
} from "@/lib/telegramMiniAppCalculatorApi";
import { formatCapacityBtu } from "@/lib/calculator";
import { ensureTelegramMiniAppProfile } from "@/lib/telegramMiniAppSession";
import { prepareTelegramMiniAppShell, waitForTelegramWebApp } from "@/lib/telegramMiniApp";
import TgMiniAppNav from "@/app/tg/components/TgMiniAppNav";
import { TgMiniAppEmailLink } from "@/app/tg/components/TgMiniAppEmailLink";
import { TgProtectedMiniApp } from "@/components/tg/TgProtectedMiniApp";
import { useScrollInputIntoView } from "@/lib/useScrollInputIntoView";

const CAP_OPTS = ["", "7", "9", "12", "18", "24", "30", "36"] as const;

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

const btn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#b91c1c",
  border: "2px solid #fecaca",
  marginTop: 8,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 10,
  boxSizing: "border-box",
};

const btnGhost: React.CSSProperties = {
  ...btn,
  background: "#fff",
  color: "#0f172a",
  border: "2px solid #e2e8f0",
  marginTop: 8,
  textDecoration: "none",
};

type TgModelsAuthUi =
  | "profile"
  | "need_email_linking"
  | "need_registration"
  | "error"
  | "no_init"
  | "no_tg";

export default function TgModelsPage() {
  const [ready, setReady] = useState(false);
  const [inTelegram, setInTelegram] = useState(false);
  const [authUi, setAuthUi] = useState<TgModelsAuthUi>("need_registration");
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailLinkInitData, setEmailLinkInitData] = useState("");
  const [models, setModels] = useState<MiniAppModelRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftCap, setDraftCap] = useState<string>("");
  const [draftComment, setDraftComment] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCap, setEditCap] = useState<string>("");
  const [editComment, setEditComment] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useScrollInputIntoView(ready && authUi === "profile");

  async function reload() {
    const r = await fetchMiniAppModels();
    if (r.ok) {
      setModels(r.models);
      setListError(null);
    } else {
      setListError(r.error);
    }
  }

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
        await reload();
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

  function startEdit(m: MiniAppModelRow) {
    tgHapticButtonTap();
    setEditId(m.id);
    setEditName(m.name);
    setEditPrice(String(m.price));
    setEditCap(m.capacityKw || "");
    setEditComment(m.comment || "");
  }

  async function onAdd() {
    if (addBusy) return;
    tgHapticButtonTap();
    const name = draftName.trim();
    const price = Math.max(0, Math.floor(Number(draftPrice.replace(/\D/g, "") || 0)));
    if (!name) {
      tgHapticNotification("error");
      return;
    }
    if (!price) {
      tgHapticNotification("error");
      return;
    }
    setAddBusy(true);
    const r = await createMiniAppModel({
      name,
      price,
      capacityKw: draftCap || undefined,
      comment: draftComment.trim() || undefined,
    });
    setAddBusy(false);
    if (r.ok) {
      tgHapticNotification("success");
      setDraftName("");
      setDraftPrice("");
      setDraftCap("");
      setDraftComment("");
      await reload();
    } else {
      tgHapticNotification("error");
      setListError(r.error);
    }
  }

  async function onSaveEdit() {
    if (!editId || editBusy) return;
    tgHapticButtonTap();
    const name = editName.trim();
    const price = Math.max(0, Math.floor(Number(editPrice.replace(/\D/g, "") || 0)));
    if (!name || !price) {
      tgHapticNotification("error");
      return;
    }
    setEditBusy(true);
    const r = await updateMiniAppModel({
      id: editId,
      name,
      price,
      capacityKw: editCap,
      comment: editComment,
    });
    setEditBusy(false);
    if (r.ok) {
      tgHapticNotification("success");
      setEditId(null);
      await reload();
    } else {
      tgHapticNotification("error");
      setListError(r.error);
    }
  }

  async function onDelete(id: string) {
    tgHapticButtonTap();
    const r = await deleteMiniAppModel(id);
    if (r.ok) {
      tgHapticNotification("success");
      if (editId === id) setEditId(null);
      await reload();
    } else {
      tgHapticNotification("error");
      setListError(r.error);
    }
  }

  return (
    <TgProtectedMiniApp>
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => prepareTelegramMiniAppShell(window.Telegram?.WebApp ?? null)}
      />
      <div style={page}>
        <h1 style={title}>Модели кондиционеров</h1>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
          Список общий с веб-версией. Выбранные модели сразу доступны в калькуляторе Mini App.
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
                    await reload();
                  }}
                />
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
                  Нет аккаунта?{" "}
                  <Link href="/tg/register" style={{ color: "#0f172a", fontWeight: 600 }}>
                    Регистрация на сайте
                  </Link>
                </p>
              </>
            ) : null}
            {inTelegram && authUi === "need_registration" ? (
              <>
                <p style={{ margin: "0 0 12px" }}>
                  Подключите Telegram к профилю HVAC-SaaS — список моделей синхронизируется с сайтом.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href="/login" style={{ ...btn, flex: 1, padding: "12px", fontSize: 15 }}>
                    Войти
                  </Link>
                  <Link
                    href="/tg/register"
                    style={{ ...btnGhost, flex: 1, padding: "12px", fontSize: 15, marginTop: 0 }}
                  >
                    Регистрация
                  </Link>
                </div>
              </>
            ) : null}
            {!inTelegram && (authUi === "need_registration" || authUi === "need_email_linking") ? (
              <>
                <p style={{ margin: "0 0 12px" }}>
                  Войдите на сайте или свяжите Telegram с профилем, чтобы управлять моделями.
                </p>
                <Link href="/login" style={btn}>
                  Войти
                </Link>
                <Link href="/tg/register" style={{ ...btnGhost, textAlign: "center" }}>
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
                <Link href="/tg/register" style={{ ...btnGhost, textAlign: "center" }}>
                  Зарегистрироваться
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <>
            {listError ? <p style={{ color: "#b91c1c" }}>{listError}</p> : null}

            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Добавить модель</div>
              <input
                style={input}
                placeholder="Название модели"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <select
                style={input}
                value={draftCap}
                onChange={(e) => setDraftCap(e.target.value)}
              >
                <option value="">Мощность BTU (необязательно)</option>
                {CAP_OPTS.filter(Boolean).map((c) => (
                  <option key={c} value={c}>
                    {formatCapacityBtu(c)}
                  </option>
                ))}
              </select>
              <input
                style={input}
                placeholder="Цена, ₽"
                inputMode="numeric"
                value={draftPrice}
                onChange={(e) => setDraftPrice(e.target.value.replace(/\D/g, ""))}
              />
              <input
                style={input}
                placeholder="Комментарий (необязательно)"
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
              />
              <button type="button" style={btn} disabled={addBusy} onClick={() => void onAdd()}>
                {addBusy ? "…" : "Сохранить новую модель"}
              </button>
            </div>

            {models.length === 0 ? (
              <div style={card}>
                <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Модели ещё не добавлены</p>
                <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                  Добавьте первую модель формой выше — она сразу появится в калькуляторе.
                </p>
              </div>
            ) : (
              models.map((m) => (
                <div key={m.id} style={card}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{m.name}</div>
                  <div style={{ color: "#475569", marginBottom: 8 }}>
                    {m.capacityKw ? `модель ${formatCapacityBtu(String(m.capacityKw))} · ` : null}
                    {new Intl.NumberFormat("ru-RU").format(m.price)} ₽
                  </div>
                  {m.comment ? (
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b" }}>{m.comment}</p>
                  ) : null}
                  {editId === m.id ? (
                    <>
                      <input
                        style={input}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <select
                        style={input}
                        value={editCap}
                        onChange={(e) => setEditCap(e.target.value)}
                      >
                        <option value="">Мощность BTU</option>
                        {CAP_OPTS.filter(Boolean).map((c) => (
                          <option key={c} value={c}>
                            {formatCapacityBtu(c)}
                          </option>
                        ))}
                      </select>
                      <input
                        style={input}
                        inputMode="numeric"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value.replace(/\D/g, ""))}
                      />
                      <input
                        style={input}
                        placeholder="Комментарий"
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                      />
                      <button
                        type="button"
                        style={btn}
                        disabled={editBusy}
                        onClick={() => void onSaveEdit()}
                      >
                        {editBusy ? "…" : "Сохранить"}
                      </button>
                      <button type="button" style={btnSecondary} onClick={() => onDelete(m.id)}>
                        Удалить
                      </button>
                    </>
                  ) : (
                    <button type="button" style={btn} onClick={() => startEdit(m)}>
                      Редактировать
                    </button>
                  )}
                </div>
              ))
            )}

            <Link
              href="/tg/calculator"
              style={{
                ...btn,
                background: "#fff",
                color: "#0f172a",
                border: "2px solid #e2e8f0",
                textDecoration: "none",
                marginTop: 8,
              }}
            >
              В калькулятор
            </Link>
          </>
        )}
      </div>
    </>
    </TgProtectedMiniApp>
  );
}
