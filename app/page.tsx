import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";

/** Не отдавать устаревший HTML главной из CDN/браузера после смены копирайта. */
export const dynamic = "force-dynamic";

/** Маркер билда в `<head>` (view-source / DevTools), без текста в UI. */
export async function generateMetadata(): Promise<Metadata> {
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    `local-${process.pid}`;
  return {
    other: {
      "hvac-saas-build": buildId,
      "hvac-landing-revision": "HERO_REVISION_2026_04_18_V2",
    },
  };
}

export default function HomePage() {
  return (
    <div style={page}>
      <header style={header}>
        <Link href="/" style={logoLink}>
          HVAC SaaS
        </Link>
      </header>

      <main style={main}>
        <section style={heroSection}>
          <div style={heroCopy}>
            <h1 style={title}>Смета на монтаж кондиционеров за 1 минуту</h1>
            <p style={lead}>
              Считай стоимость на объекте, сохраняй расчёты и отправляй клиенту прямо с телефона
            </p>
            <ul style={heroBullets}>
              <li>Поля под ваши расценки и типовые работы</li>
              <li>История расчетов и отправка готовых смет</li>
              <li>Доступ с телефона или планшета, без установки приложений</li>
            </ul>
            <div style={heroCtas}>
              <Link href="/register" style={ctaPrimary}>
                Создать аккаунт
              </Link>
              <Link href="/login" style={ctaSecondary}>
                Войти
              </Link>
            </div>
          </div>
        </section>

        <section style={grid}>
          <article style={card}>
            <h2 style={cardTitle}>Для кого</h2>
            <p style={cardText}>
              Частные мастера и бригады, которым нужна смета на месте и порядок в цифрах без
              разрозненных файлов и чатов.
            </p>
          </article>
          <article style={card}>
            <h2 style={cardTitle}>Что внутри после входа</h2>
            <ul style={list}>
              <li>калькулятор сметы по вашим ставкам на работы;</li>
              <li>личный прайс и свои услуги в расчёте;</li>
              <li>история расчётов;</li>
              <li>быстрая отправка расчёта клиенту прямо из личного кабинета;</li>
              <li>разделы сервиса и настройки аккаунта под ежедневную работу на объекте.</li>
            </ul>
          </article>
          <article style={card}>
            <h2 style={cardTitle}>Как начать</h2>
            <ol style={list}>
              <li>заполните короткую форму вверху страницы и подтвердите email;</li>
              <li>настройте прайс или сразу откройте калькулятор;</li>
              <li>сохраните первый расчёт — дальше всё под рукой.</li>
            </ol>
          </article>
        </section>
      </main>

      <footer style={footer}>
        <span>© HVAC SaaS</span>
      </footer>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "#f4f6f8",
  color: "#111827",
  fontFamily: "system-ui, sans-serif",
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 24px",
  borderBottom: "1px solid #e5e7eb",
  background: "#fff",
};

const logoLink: CSSProperties = {
  fontWeight: 800,
  fontSize: "18px",
  letterSpacing: "-0.02em",
  color: "#111827",
  textDecoration: "none",
};

const main: CSSProperties = {
  flex: 1,
  maxWidth: "1040px",
  margin: "0 auto",
  padding: "32px 20px 48px",
  width: "100%",
  boxSizing: "border-box",
};

const heroSection: CSSProperties = {
  marginBottom: "40px",
};

const heroCopy: CSSProperties = {
  maxWidth: "640px",
  margin: 0,
};

const title: CSSProperties = {
  fontSize: "clamp(28px, 5vw, 42px)",
  lineHeight: 1.12,
  margin: "0 0 12px",
  letterSpacing: "-0.03em",
};

const lead: CSSProperties = {
  fontSize: "18px",
  lineHeight: 1.55,
  color: "#374151",
  margin: "0 0 18px",
  maxWidth: "640px",
};

const heroBullets: CSSProperties = {
  margin: "0 0 24px",
  paddingLeft: "22px",
  maxWidth: "640px",
  fontSize: "16px",
  lineHeight: 1.55,
  color: "#1f2937",
};

const heroCtas: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  alignItems: "center",
};

const ctaBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 22px",
  borderRadius: "14px",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  textAlign: "center",
  minWidth: "min(100%, 200px)",
  boxSizing: "border-box",
};

const ctaPrimary: CSSProperties = {
  ...ctaBase,
  background: "#111827",
  color: "#fff",
  border: "none",
};

const ctaSecondary: CSSProperties = {
  ...ctaBase,
  background: "#fff",
  color: "#111827",
  border: "1px solid #d1d5db",
};

const grid: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const card: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.04)",
  border: "1px solid #eef0f3",
};

const cardTitle: CSSProperties = {
  marginTop: 0,
  marginBottom: "10px",
  fontSize: "18px",
};

const cardText: CSSProperties = {
  margin: 0,
  color: "#4b5563",
  lineHeight: 1.5,
  fontSize: "15px",
};

const list: CSSProperties = {
  margin: 0,
  paddingLeft: "18px",
  color: "#4b5563",
  lineHeight: 1.55,
  fontSize: "15px",
};

const footer: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "16px 24px",
  borderTop: "1px solid #e5e7eb",
  background: "#fff",
  fontSize: "13px",
  color: "#6b7280",
};
