import nodemailer from "nodemailer";

const GMAIL_HOST = "smtp.gmail.com";
const GMAIL_PORT = 587;

/** Публичный адрес отправителя (логин Gmail). Пароль — только из env. */
export const DEFAULT_GMAIL_SMTP_USER = "komfort.service.krasnodar@gmail.com";

export function getGmailSmtpUser(): string {
  const fromEnv = String(process.env.GMAIL_SMTP_USER ?? process.env.SMTP_USER ?? "").trim();
  return fromEnv || DEFAULT_GMAIL_SMTP_USER;
}

/** App password или SMTP-пароль Gmail — задать в Vercel / .env.local, не коммитить. */
export function getGmailSmtpPass(): string {
  return String(process.env.GMAIL_SMTP_PASS ?? process.env.SMTP_PASS ?? "").trim();
}

export function isGmailVerificationSmtpConfigured(): boolean {
  return getGmailSmtpPass().length > 0;
}

export function createGmailVerificationTransporter() {
  return nodemailer.createTransport({
    host: GMAIL_HOST,
    port: GMAIL_PORT,
    secure: false,
    auth: {
      user: getGmailSmtpUser(),
      pass: getGmailSmtpPass(),
    },
  });
}

/**
 * Отправка кода подтверждения регистрации только через Gmail SMTP (nodemailer).
 */
export async function sendVerificationCodeEmail(params: { to: string; code: string }) {
  const transporter = createGmailVerificationTransporter();
  const user = getGmailSmtpUser();
  try {
    await transporter.sendMail({
      from: `Калькулятор кондиционеров <${user}>`,
      to: params.to,
      subject: "Код подтверждения",
      text: `Ваш код подтверждения: ${params.code}`,
    });
  } catch (error) {
    console.error("EMAIL SEND ERROR:", error);
    throw new Error("Ошибка отправки email");
  }
}
