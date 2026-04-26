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
  return (
    String(process.env.SMTP_HOST || "").trim().length > 0 ||
    String(process.env.SMTP_USER || "").trim().length > 0 ||
    getGmailSmtpPass().length > 0
  );
}

export function getSmtpHost(): string {
  return String(process.env.SMTP_HOST || "").trim() || GMAIL_HOST;
}

export function getSmtpPort(): number {
  const fromEnv = Number(String(process.env.SMTP_PORT || "").trim());
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.trunc(fromEnv);
  return GMAIL_PORT;
}

export function getEmailFrom(): string {
  const fromEnv = String(process.env.EMAIL_FROM || "").trim();
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  if (fromEnv) return fromEnv;
  if (smtpUser) return smtpUser;
  return getGmailSmtpUser();
}

export function getSmtpEnvStatus() {
  return {
    SMTP_HOST: String(process.env.SMTP_HOST || "").trim().length > 0,
    SMTP_PORT: String(process.env.SMTP_PORT || "").trim().length > 0,
    SMTP_USER: String(process.env.SMTP_USER || "").trim().length > 0,
    SMTP_PASS: String(process.env.SMTP_PASS || process.env.GMAIL_SMTP_PASS || "").trim().length > 0,
    EMAIL_FROM: String(process.env.EMAIL_FROM || "").trim().length > 0,
  };
}

export function createGmailVerificationTransporter() {
  const host = getSmtpHost();
  const port = getSmtpPort();
  const secure = port === 465;
  const user = String(process.env.SMTP_USER || "").trim() || getGmailSmtpUser();
  const pass = getGmailSmtpPass();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
  });
}

async function sendCodeEmail(params: {
  to: string;
  code: string;
  subject: string;
  text: string;
  logPrefix: string;
}): Promise<{ messageId: string }> {
  const transporter = createGmailVerificationTransporter();
  const envStatus = getSmtpEnvStatus();
  console.log(`[${params.logPrefix}] SMTP_HOST exists`, envStatus.SMTP_HOST);
  console.log(`[${params.logPrefix}] SMTP_USER exists`, envStatus.SMTP_USER);
  console.log(`[${params.logPrefix}] SMTP_PASS exists`, envStatus.SMTP_PASS);
  console.log(`[${params.logPrefix}] EMAIL_FROM exists`, envStatus.EMAIL_FROM);

  try {
    const verifyResult = await transporter.verify();
    console.log(`[${params.logPrefix}] transporter.verify result`, verifyResult);
  } catch (error) {
    console.error(`[${params.logPrefix}] transporter.verify error`, error);
    throw error;
  }

  const from = getEmailFrom();
  const info = await transporter.sendMail({
    from: `Калькулятор кондиционеров <${from}>`,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
  const messageId = String((info as { messageId?: unknown }).messageId || "");
  console.log(`[${params.logPrefix}] sendMail result messageId`, messageId || null);
  return { messageId };
}

/**
 * Отправка 6-значного кода через тот же SMTP-транспорт, что и регистрация.
 * Для восстановления пароля передайте subject и text — логируется как send-verification-code.
 */
export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  subject?: string;
  text?: string;
}): Promise<{ messageId: string }> {
  const subject = params.subject ?? "Код подтверждения";
  const text = params.text ?? `Ваш код подтверждения: ${params.code}`;
  try {
    return await sendCodeEmail({
      to: params.to,
      code: params.code,
      subject,
      text,
      logPrefix: "send-verification-code",
    });
  } catch (error) {
    console.error("EMAIL SEND ERROR:", error);
    throw new Error("Ошибка отправки email");
  }
}

/** Тестовое письмо SMTP (debug): тот же путь, что и регистрация/код. */
export async function sendPasswordResetTestEmail(params: { to: string }): Promise<{ messageId: string }> {
  return sendVerificationCodeEmail({
    to: params.to,
    code: "000000",
    subject: "Код восстановления пароля HVAC SaaS",
    text: "TEST PASSWORD RESET EMAIL",
  });
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
