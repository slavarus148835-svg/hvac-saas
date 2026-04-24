import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Публичная оферта — HVAC SaaS",
  description: "Публичная оферта на оказание услуг по предоставлению доступа к сервису HVAC SaaS.",
};

export default function PublicOfferPage() {
  return (
    <div style={page}>
      <header style={header}>
        <Link href="/" style={logoLink}>
          HVAC SaaS
        </Link>
      </header>

      <main style={main}>
        <article style={article}>
          <h1 style={h1}>Публичная оферта</h1>
          <p style={p}>
            Настоящий документ является публичной офертой ИП Танеев Николай Сергеевич (далее —
            «Исполнитель») в адрес любого дееспособного лица (далее — «Заказчик») на заключение
            договора оказания услуг по предоставлению доступа к программному сервису «HVAC SaaS»
            (далее — «Сервис») на условиях, изложенных ниже.
          </p>
          <p style={p}>
            Акцептом оферты считается совершение Заказчиком оплаты доступа к Сервису в порядке,
            предусмотренном на сайте Сервиса. С момента акцепта договор между Исполнителем и
            Заказчиком считается заключённым.
          </p>

          <h2 style={h2}>1. Предмет договора</h2>
          <p style={p}>
            Исполнитель обязуется предоставить Заказчику доступ к функционалу Сервиса на оплаченный
            срок, а Заказчик обязуется принять и оплатить услуги в размере и порядке, указанных при
            оформлении оплаты на сайте Сервиса.
          </p>

          <h2 style={h2}>2. Стоимость и порядок оплаты</h2>
          <p style={p}>
            Стоимость доступа к Сервису указывается на странице оплаты в личном кабинете на момент
            оформления платежа. Оплата производится через платёжную форму банка-партнёра. Доступ к
            Сервису активируется после подтверждения успешной оплаты.
          </p>

          <h2 style={h2}>3. Права и обязанности сторон</h2>
          <p style={p}>
            Заказчик обязуется использовать Сервис в соответствии с его назначением и не нарушать
            права третьих лиц. Исполнитель вправе приостановить или ограничить доступ при нарушении
            условий использования либо по техническим причинам, с разумными усилиями по восстановлению
            работы Сервиса.
          </p>

          <h2 style={h2}>4. Ответственность</h2>
          <p style={p}>
            Сервис предоставляется «как есть». Исполнитель не отвечает за косвенные убытки и упущенную
            выгоду Заказчика. По вопросам качества услуг Заказчик может обратиться по контактам ниже.
          </p>

          <h2 style={h2}>5. Реквизиты и контакты Исполнителя</h2>
          <p style={p}>
            <strong>ИП Танеев Николай Сергеевич</strong>
            <br />
            ИНН: 263109142309
            <br />
            ОГРН: 323265100027350
            <br />
            Действует на основании ОГРН 323265100027350
          </p>
          <p style={p}>
            Расчётный счёт: 40802810400004399213
            <br />
            Банк: АО «Тинькофф Банк»
            <br />
            БИК банка: 044525974
            <br />
            Корреспондентский счёт: 30101810145250000974
          </p>
          <p style={p}>
            Email:{" "}
            <a href="mailto:komfort.service.krasnodar@gmail.com" style={link}>
              komfort.service.krasnodar@gmail.com
            </a>
          </p>
        </article>
      </main>
    </div>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6f8",
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

const header: CSSProperties = {
  padding: "16px clamp(12px, 4vw, 20px)",
  borderBottom: "1px solid #e5e7eb",
  background: "#fff",
};

const logoLink: CSSProperties = {
  fontWeight: 800,
  fontSize: "18px",
  color: "#111827",
  textDecoration: "none",
};

const main: CSSProperties = {
  maxWidth: "720px",
  margin: "0 auto",
  padding: "24px clamp(12px, 4vw, 20px) 48px",
  boxSizing: "border-box",
};

const article: CSSProperties = {
  background: "#fff",
  borderRadius: "20px",
  padding: "clamp(16px, 4vw, 24px) clamp(14px, 4vw, 22px)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const h1: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "26px",
  lineHeight: 1.2,
  color: "#111827",
};

const h2: CSSProperties = {
  margin: "24px 0 10px",
  fontSize: "18px",
  color: "#111827",
};

const p: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "15px",
  lineHeight: 1.55,
  color: "#374151",
  overflowWrap: "anywhere",
};

const link: CSSProperties = {
  color: "#0369a1",
  textDecoration: "underline",
};
