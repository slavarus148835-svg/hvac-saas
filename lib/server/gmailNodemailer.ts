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
    connectionTimeout: 10000,
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

/** Письмо с 6-значным кодом для восстановления пароля. */
export async function sendPasswordResetCodeEmail(params: { to: string; code: string }) {
  const transporter = createGmailVerificationTransporter();
  const user = getGmailSmtpUser();
  const text = [
    `Ваш код восстановления пароля: ${params.code}`,
    "Код действует 10 минут.",
    "Если вы не запрашивали восстановление, просто игнорируйте это письмо.",
  ].join("\n");
  try {
    await transporter.sendMail({
      from: `Калькулятор кондиционеров <${user}>`,
      to: params.to,
      subject: "Код восстановления пароля HVAC SaaS",
      text,
    });
  } catch (error) {
    console.error("PASSWORD RESET EMAIL SEND ERROR:", error);
    throw new Error("Ошибка отправки email");
  }
}

/** Простое письмо (напоминание о незавершённом входе), только если SMTP настроен. */
export async function sendPlainGmailEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isGmailVerificationSmtpConfigured()) {
    return { ok: false, reason: "smtp_not_configured" };
  }
  const transporter = createGmailVerificationTransporter();
  const user = getGmailSmtpUser();
  try {
    await transporter.sendMail({
      from: `Калькулятор кондиционеров <${user}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return { ok: true };
  } catch (error) {
    console.error("[gmail] recovery email failed", error);
    return { ok: false, reason: "send_failed" };
  }
}
