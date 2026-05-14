"use client";

import { useState } from "react";
import type { TelegramMiniAppProfile } from "@/lib/telegramMiniAppAuth";
import { linkTelegramMiniAppByEmail } from "@/lib/telegramMiniAppLinkEmail";

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 16,
  marginBottom: 12,
  boxSizing: "border-box",
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

type Props = {
  initData: string;
  onLinked: (profile: TelegramMiniAppProfile) => void;
};

export function TgMiniAppEmailLink({ initData, onLinked }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 14, color: "#334155", lineHeight: 1.5 }}>
        Введите email, с которым вы уже зарегистрировались на сайте — мы привяжем этот Telegram к
        вашему профилю без нового trial.
      </p>
      <input
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        style={input}
      />
      <button
        type="button"
        style={{ ...btn, opacity: busy ? 0.7 : 1 }}
        disabled={busy || !email.trim()}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setErr(null);
            const r = await linkTelegramMiniAppByEmail(initData, email.trim());
            setBusy(false);
            if (r.ok) {
              if (r.profile) onLinked(r.profile);
              else setErr("Не удалось получить профиль после привязки.");
            } else {
              setErr(r.error);
            }
          })();
        }}
      >
        {busy ? "Проверяем…" : "Подключить Telegram"}
      </button>
      {err ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#b91c1c" }}>{err}</p>
      ) : null}
    </div>
  );
}
