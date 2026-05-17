import type { Metadata } from "next";
import {
  TgLegalPageLayout,
  tgLegalContact,
  tgLegalList,
  tgLegalP,
} from "@/components/tg/TgLegalPageLayout";

export const metadata: Metadata = {
  title: "HVAC-SaaS Privacy Policy",
  description: "Политика конфиденциальности HVAC-SaaS",
};

export default function PrivacyPolicyPage() {
  return (
    <TgLegalPageLayout title="Политика конфиденциальности HVAC-SaaS">
      <p style={tgLegalP}>
        HVAC-SaaS использует данные пользователя только для работы сервиса.
      </p>
      <p style={{ ...tgLegalP, fontWeight: 600, color: "#e2e8f0" }}>
        Какие данные могут храниться:
      </p>
      <ul style={tgLegalList}>
        <li>Telegram ID</li>
        <li>email</li>
        <li>история расчётов</li>
        <li>пользовательские прайсы и модели</li>
        <li>данные, связанные с оплатой подписки</li>
      </ul>
      <p style={tgLegalP}>
        Для обработки платежей используются сторонние платёжные сервисы, включая
        Т-Банк.
      </p>
      <p style={tgLegalP}>
        Данные не передаются третьим лицам, кроме случаев, необходимых для работы
        сервиса и обработки платежей.
      </p>
      <p style={tgLegalP}>
        Пользователь может прекратить использование сервиса в любой момент.
      </p>
      <p style={tgLegalContact}>
        Контакты:
        <br />
        <a
          href="mailto:Komfort.service.Krasnodar@gmail.com"
          style={{ color: "#93c5fd", textDecoration: "none" }}
        >
          Komfort.service.Krasnodar@gmail.com
        </a>
      </p>
    </TgLegalPageLayout>
  );
}
