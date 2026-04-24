"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { withAuthGuard } from "@/lib/withAuthGuard";

function AboutPage() {
  const router = useRouter();

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <button type="button" onClick={() => router.push("/dashboard")} style={backButtonStyle}>
          Назад в кабинет
        </button>

        <h1 style={titleStyle}>О сервисе</h1>

        <p style={paraStyle}>
          Приветствую тебя, коллега. Рад, что тебя заинтересовал мой продукт.
        </p>
        <p style={paraStyle}>
          Я сам работаю в сфере монтажа кондиционеров и хорошо понимаю, как проходит реальная работа на
          объекте.
        </p>
        <p style={paraStyle}>
          Мне нравится эта профессия, я постоянно развиваюсь в ней и стараюсь делать свою работу быстрее,
          точнее и удобнее.
        </p>
        <p style={paraStyle}>Именно поэтому я начал разрабатывать этот инструмент.</p>
        <p style={paraStyle}>
          Это не сторонний продукт — это сервис, сделанный мастером для мастеров, с пониманием всех
          нюансов работы изнутри.
        </p>
        <p style={paraStyle}>
          Моя цель — сделать работу максимально комфортной:
          <br />
          — сократить время расчётов
          <br />
          — убрать хаос и «примерные цены»
          <br />
          — помочь не терять деньги из-за забытых работ
          <br />— дать мастеру уверенность в своих расчётах
        </p>
        <p style={paraStyle}>
          Благодаря сервису и возможности отправлять готовый расчёт или КП прямо с объекта, мастер
          выглядит профессионально и вызывает больше доверия у клиента.
        </p>
        <p style={paraStyle}>
          Если у тебя есть идеи или предложения — напиши, я развиваю сервис под реальные задачи.
        </p>

        <h2 style={sectionTitle}>Контакты</h2>
        <p style={paraStyle}>
          Email:{" "}
          <a href="mailto:komfort.service.krasnodar@gmail.com" style={linkStyle}>
            komfort.service.krasnodar@gmail.com
          </a>
        </p>

        <p style={paraStyle}>
          ИП Танеев Николай Сергеевич
          <br />
          ИНН: 263109142309
          <br />
          ОГРН: 323265100027350
          <br />
          Действует на основании ОГРН 323265100027350
        </p>
      </div>
    </div>
  );
}

export default withAuthGuard(AboutPage);

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: "12px clamp(12px, 4vw, 20px) 32px",
  maxWidth: "720px",
  margin: "0 auto",
  boxSizing: "border-box",
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "clamp(16px, 4vw, 24px)",
  boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const backButtonStyle: CSSProperties = {
  marginBottom: "18px",
  padding: "10px 14px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const titleStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "28px",
  lineHeight: 1.15,
  color: "#111827",
};

const sectionTitle: CSSProperties = {
  margin: "22px 0 10px",
  fontSize: "18px",
  color: "#111827",
};

const paraStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "15px",
  lineHeight: 1.55,
  color: "#374151",
  overflowWrap: "anywhere",
};

const linkStyle: CSSProperties = {
  color: "#0369a1",
  textDecoration: "underline",
};
