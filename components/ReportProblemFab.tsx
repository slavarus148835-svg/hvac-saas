"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const DEFAULT_SUPPORT = "https://t.me/karmaforce";

function supportTelegramUsername(raw: string): string {
  const t = raw.trim().replace(/\/$/, "");
  const fromPath = t.match(/t\.me\/([^/?#]+)/i);
  if (fromPath?.[1]) return fromPath[1].replace(/^@/, "");
  if (t.startsWith("@")) return t.slice(1).replace(/^@/, "");
  return "karmaforce";
}

function buildReportBody(params: {
  problem: string;
  email: string;
  page: string;
  datetime: string;
  calcSnippet: string;
}): string {
  const lines = [
    "ПРОБЛЕМА:",
    params.problem,
    "",
    "EMAIL:",
    params.email || "—",
    "",
    "СТРАНИЦА:",
    params.page,
    "",
    "ВРЕМЯ:",
    params.datetime,
  ];
  if (params.calcSnippet) {
    lines.push("", "ДАННЫЕ РАСЧЁТА:", params.calcSnippet);
  }
  return lines.join("\n");
}

function telegramDirectUrl(username: string, body: string): string {
  const max = 3200;
  const clipped = body.length > max ? body.slice(0, max) + "\n[…]" : body;
  const safeUser = username.replace(/[^a-zA-Z0-9_]/g, "") || "karmaforce";
  return `https://t.me/${safeUser}?text=${encodeURIComponent(clipped)}`;
}

type ReportProblemFabProps = {
  /** На формах снизу — кнопка вверху экрана, не перекрывает «Сохранить» */
  layout?: "top" | "bottom";
  /** Доп. отступ снизу (px), только при layout bottom */
  fabBottomExtraPx?: number;
};

export function ReportProblemFab({
  layout = "bottom",
  fabBottomExtraPx = 0,
}: ReportProblemFabProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const support = process.env.NEXT_PUBLIC_SUPPORT_URL || DEFAULT_SUPPORT;
  const navigateLockRef = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    setSubmitNote("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = () => {
    if (submitBusy || navigateLockRef.current) return;
    const problem = text.trim();
    if (!problem) {
      setSubmitNote("Опишите проблему в поле выше.");
      return;
    }
    navigateLockRef.current = true;
    setSubmitBusy(true);
    setSubmitNote("");
    const page = typeof window !== "undefined" ? window.location.href : "";
    const datetime = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "medium" });
    const user = auth.currentUser;
    const email = (user?.email || "").trim();
    const calcEl =
      typeof document !== "undefined"
        ? document.querySelector("[data-hvac-report-calc]")
        : null;
    const calcSnippet = (calcEl?.textContent || "").trim();

    const body = buildReportBody({
      problem,
      email,
      page,
      datetime,
      calcSnippet,
    });

    const username = supportTelegramUsername(support);
    let url = telegramDirectUrl(username, body);
    if (url.length > 8000) {
      url = telegramDirectUrl(username, buildReportBody({
        problem: problem.slice(0, 1500) + (problem.length > 1500 ? " […]" : ""),
        email,
        page,
        datetime,
        calcSnippet: calcSnippet.slice(0, 400),
      }));
    }

    if (user) {
      void addDoc(collection(db, "bugReports"), {
        uid: user.uid,
        createdAt: new Date().toISOString(),
        page,
        text: problem,
      }).catch((e) => {
        console.error("bugReports", e);
      });
    }

    window.location.href = url;
  };

  const right = `calc(10px + env(safe-area-inset-right, 0px))`;
  const fabPosition: CSSProperties =
    layout === "top"
      ? {
          top: `calc(10px + env(safe-area-inset-top, 0px))`,
          right,
          bottom: "auto",
        }
      : {
          bottom: `calc(12px + env(safe-area-inset-bottom, 0px) + ${fabBottomExtraPx}px)`,
          right,
          top: "auto",
        };

  return (
    <>
      <button
        type="button"
        aria-label="Сообщить о проблеме"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          zIndex: 60,
          padding: "8px 11px",
          borderRadius: 999,
          background: "#111827",
          color: "#fff",
          fontSize: "11px",
          fontWeight: 700,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.14)",
          maxWidth: "min(calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), 168px)",
          lineHeight: 1.2,
          pointerEvents: "auto",
          ...fabPosition,
        }}
      >
        Проблема?
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-problem-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))",
            pointerEvents: "auto",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#fff",
              borderRadius: 18,
              padding: 18,
              boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
              marginBottom: "max(16px, env(safe-area-inset-bottom))",
              pointerEvents: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="report-problem-title" style={{ margin: "0 0 8px 0", fontSize: 20 }}>
              Сообщить о проблеме
            </h2>
            <p style={{ margin: "0 0 12px 0", fontSize: 14, color: "#6b7280", lineHeight: 1.45 }}>
              Опишите проблему и нажмите «Отправить в Telegram» — откроется чат поддержки с готовым
              текстом. Для авторизованных обращение дублируется в сервисе.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Что случилось? На какой странице?"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 12,
                borderRadius: 12,
                border: "1px solid #d1d5db",
                fontSize: 15,
                resize: "vertical",
                marginBottom: 12,
              }}
            />
            {submitNote ? (
              <div style={{ fontSize: 13, color: "#b45309", marginBottom: 10 }}>{submitNote}</div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={close}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitBusy}
                onClick={submit}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: submitBusy ? "not-allowed" : "pointer",
                  opacity: submitBusy ? 0.65 : 1,
                }}
              >
                {submitBusy ? "Открываем…" : "Отправить в Telegram"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
