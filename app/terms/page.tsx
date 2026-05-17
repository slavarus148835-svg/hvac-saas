import type { Metadata } from "next";
import {
  TgLegalPageLayout,
  tgLegalContact,
  tgLegalList,
  tgLegalP,
} from "@/components/tg/TgLegalPageLayout";

export const metadata: Metadata = {
  title: "HVAC-SaaS Terms of Service",
  description: "Пользовательское соглашение HVAC-SaaS",
};

export default function TermsOfServicePage() {
  return (
    <TgLegalPageLayout title="Пользовательское соглашение HVAC-SaaS">
      <p style={tgLegalP}>
        Используя HVAC-SaaS, пользователь соглашается с условиями использования
        сервиса.
      </p>
      <p style={tgLegalP}>
        Сервис предназначен для расчёта стоимости монтажных и сервисных работ в
        HVAC сфере.
      </p>
      <p style={{ ...tgLegalP, fontWeight: 600, color: "#e2e8f0" }}>
        Пользователь самостоятельно несёт ответственность за:
      </p>
      <ul style={tgLegalList}>
        <li>корректность введённых данных</li>
        <li>итоговые цены</li>
        <li>взаимодействие с клиентами</li>
      </ul>
      <p style={tgLegalP}>
        Подписка предоставляет доступ к функциям сервиса на оплаченный период.
      </p>
      <p style={tgLegalP}>
        Разработчик сервиса может изменять функциональность приложения без
        предварительного уведомления.
      </p>
      <p style={tgLegalP}>
        Использование сервиса означает согласие с данным соглашением.
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
