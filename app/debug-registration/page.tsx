"use client";

import { useCallback, useState } from "react";

type Row = { label: string; value: string };

export default function DebugRegistrationPage() {
  const [secret, setSecret] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [raw, setRaw] = useState("");

  const headers = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (secret.trim()) h["x-internal-debug-secret"] = secret.trim();
    return h;
  }, [secret]);

  const parseQuery = () => {
    const q = query.trim();
    if (!q) return { uid: null as string | null, email: null as string | null };
    if (q.includes("@")) return { uid: null, email: q };
    return { uid: q, email: null };
  };

  const loadStatus = async () => {
    setError("");
    setLoading(true);
    try {
      const { uid, email } = parseQuery();
      if (!uid && !email) {
        setError("Укажите uid или email");
        setRows([]);
        setRaw("");
        return;
      }
      const sp = new URLSearchParams();
      if (uid) sp.set("uid", uid);
      if (email) sp.set("email", email);
      const res = await fetch(`/api/debug/registration?${sp.toString()}`, {
        method: "GET",
        headers: headers(),
        cache: "no-store",
      });
      const text = await res.text();
      setRaw(text);
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${text.slice(0, 500)}`);
        setRows([]);
        return;
      }
      const j = JSON.parse(text) as Record<string, unknown>;
      const nextRows: Row[] = [
        { label: "uid", value: String(j.uid ?? "—") },
        { label: "email", value: String(j.email ?? "—") },
        { label: "registrationStage", value: String(j.registrationStage ?? "—") },
        { label: "emailVerifiedByCode", value: String(j.emailVerifiedByCode ?? "—") },
        { label: "emailCodeSentAt", value: String(j.emailCodeSentAt ?? "—") },
        { label: "emailCodeSendError", value: String(j.emailCodeSendError ?? "—") },
        { label: "telegramNotifiedAt", value: String(j.telegramNotifiedAt ?? "—") },
        { label: "telegramNotifyError", value: String(j.telegramNotifyError ?? "—") },
        { label: "lastRegistrationError", value: String(j.lastRegistrationError ?? "—") },
        { label: "есть активный код (hasActiveCode)", value: String(j.hasActiveCode ?? "—") },
        { label: "expiresAt (codeExpiresAt)", value: String(j.codeExpiresAt ?? "—") },
        { label: "attempts", value: String(j.attempts ?? "—") },
        { label: "resendAvailableAt", value: String(j.resendAvailableAt ?? "—") },
        { label: "firestoreUserExists", value: String(j.firestoreUserExists ?? "—") },
      ];
      setRows(nextRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setRaw("");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setError("");
    setLoading(true);
    try {
      const { uid, email } = parseQuery();
      if (!uid && !email) {
        setError("Укажите uid или email");
        return;
      }
      const res = await fetch("/api/debug/registration", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action: "resend", uid: uid ?? undefined, email: email ?? undefined }),
      });
      const text = await res.text();
      setRaw(text);
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${text.slice(0, 500)}`);
        return;
      }
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Debug: регистрация</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Нужен <code>INTERNAL_DEBUG_SECRET</code> в env сервера и заголовок (ввод ниже).
      </p>

      <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
        Секрет (x-internal-debug-secret)
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
          autoComplete="off"
        />
      </label>

      <label style={{ display: "block", marginBottom: 12, fontSize: 13 }}>
        UID или email
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="abc123… или user@mail.com"
          style={{ display: "block", width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" onClick={() => void loadStatus()} disabled={loading}>
          {loading ? "…" : "Обновить статус"}
        </button>
        <button type="button" onClick={() => void resendCode()} disabled={loading}>
          Отправить код повторно
        </button>
      </div>

      {error ? (
        <pre
          style={{
            background: "#fef2f2",
            padding: 12,
            borderRadius: 8,
            color: "#991b1b",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </pre>
      ) : null}

      {rows.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "6px 8px", color: "#64748b", verticalAlign: "top", width: "42%" }}>
                  {r.label}
                </td>
                <td style={{ padding: "6px 8px", wordBreak: "break-all" }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {raw ? (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Сырой JSON</summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              background: "#f8fafc",
              borderRadius: 8,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 320,
            }}
          >
            {raw}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
