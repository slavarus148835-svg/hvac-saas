"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";
import { buildLoginRedirectUrl } from "@/lib/safeRedirect";

type MePayload = {
  referralCode: string;
  referralLink: string;
  partnerBalance: number;
  partnerTotalEarned: number;
  partnerRegisteredCount: number;
  partnerPaidCount: number;
  commissionPercent: number;
};

const page: CSSProperties = {
  minHeight: "100vh",
  padding: "20px 16px 40px",
  maxWidth: 520,
  margin: "0 auto",
  fontFamily: "system-ui, sans-serif",
  background: "#f8fafc",
};

const card: CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 14,
  marginBottom: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const statLabel: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 4,
};

const statValue: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#0f172a",
};

const btn: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  marginBottom: 8,
};

const primaryBtn: CSSProperties = {
  ...btn,
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
};

function buildShareText(link: string): string {
  return [
    "Я пользуюсь сервисом для монтажников кондиционеров.",
    "",
    "Он помогает быстро считать монтаж, не забывать доп. работы и не терять деньги на объекте.",
    "",
    "Можно попробовать:",
    link,
  ].join("\n");
}

export default function PartnerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [me, setMe] = useState<MePayload | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    setLoadError(null);
    const u = await resolveAuthUser(auth.currentUser);
    if (!u) {
      router.replace(buildLoginRedirectUrl("/partner"));
      return;
    }
    const token = await u.getIdToken();
    const res = await fetch("/api/partner/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) {
      router.replace("/calculator");
      return;
    }
    if (!res.ok) {
      setLoadError("Не удалось загрузить кабинет партнёра. Попробуйте позже.");
      setMe(null);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as MePayload;
    setMe(data);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (raw) => {
      const u = await resolveAuthUser(raw);
      if (!u) {
        setLoading(false);
        router.replace(buildLoginRedirectUrl("/partner"));
        return;
      }
      setLoading(true);
      await loadMe();
    });
    return () => unsub();
  }, [router, loadMe]);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(label);
      window.setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint("Не удалось скопировать");
      window.setTimeout(() => setCopyHint(null), 2500);
    }
  };

  if (loading) {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 16, color: "#475569" }}>Загрузка…</div>
      </div>
    );
  }

  if (loadError || !me) {
    return (
      <div style={{ ...page, textAlign: "center" }}>
        <p style={{ color: "#b91c1c", marginBottom: 16 }}>{loadError || "Нет данных."}</p>
        <button type="button" style={primaryBtn} onClick={() => void loadMe()}>
          Повторить
        </button>
      </div>
    );
  }

  const share = buildShareText(me.referralLink);

  return (
    <div style={page}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "#0f172a" }}>
        Партнёрская программа
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "#475569", margin: "0 0 20px" }}>
        Приглашайте других мастеров и получайте 30% с каждой оплаты.
      </p>

      <div style={grid}>
        <div style={card}>
          <div style={statLabel}>К выплате</div>
          <div style={statValue}>{me.partnerBalance.toFixed(2)} ₽</div>
        </div>
        <div style={card}>
          <div style={statLabel}>Всего заработано</div>
          <div style={statValue}>{me.partnerTotalEarned.toFixed(2)} ₽</div>
        </div>
        <div style={card}>
          <div style={statLabel}>Регистраций</div>
          <div style={statValue}>{me.partnerRegisteredCount}</div>
        </div>
        <div style={card}>
          <div style={statLabel}>Оплат</div>
          <div style={statValue}>{me.partnerPaidCount}</div>
        </div>
      </div>

      <div style={{ ...card, marginTop: 4 }}>
        <div style={{ ...statLabel, marginBottom: 8 }}>Ваша ссылка</div>
        <div
          style={{
            fontSize: 13,
            wordBreak: "break-all",
            color: "#0f172a",
            lineHeight: 1.45,
            marginBottom: 12,
          }}
        >
          {me.referralLink}
        </div>
        <button type="button" style={primaryBtn} onClick={() => void copy("Ссылка", me.referralLink)}>
          Скопировать ссылку
        </button>
        <button type="button" style={btn} onClick={() => void copy("Telegram", share)}>
          Скопировать текст Telegram
        </button>
        <button type="button" style={btn} onClick={() => void copy("WhatsApp", share)}>
          Скопировать текст WhatsApp
        </button>
        {copyHint ? (
          <div style={{ fontSize: 13, color: "#15803d", marginTop: 4 }}>Скопировано: {copyHint}</div>
        ) : null}
      </div>

      <div style={{ ...card, marginTop: 4 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: "#0f172a" }}>Как это работает</div>
        <ol style={{ margin: 0, paddingLeft: 18, color: "#334155", lineHeight: 1.55, fontSize: 14 }}>
          <li>Делитесь ссылкой</li>
          <li>Мастер регистрируется</li>
          <li>Он оплачивает подписку</li>
          <li>Вы получаете 30% каждый месяц</li>
        </ol>
      </div>
    </div>
  );
}
