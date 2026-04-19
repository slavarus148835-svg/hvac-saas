import nodemailer from "nodemailer";

export type MailProvider = "resend" | "smtp";

export type SendResult =
  | { ok: true; provider: MailProvider }
  | {
      ok: false;
      provider?: MailProvider;
      error: string;
      detail?: string;
      smtpCode?: string;
      smtpMessage?: string;
    };

/** Только `process.env.SMTP_PASS`. */
export function getSmtpPassword(): string {
  return String(process.env.SMTP_PASS ?? "").trim();
}

/** Список отсутствующих имён (без значений). */
export function listMissingSmtpEnvKeys(): string[] {
  const missing: string[] = [];
  if (!String(process.env.SMTP_HOST ?? "").trim()) missing.push("SMTP_HOST");
  if (!String(process.env.SMTP_PORT ?? "").trim()) missing.push("SMTP_PORT");
  if (!String(process.env.SMTP_USER ?? "").trim()) missing.push("SMTP_USER");
  if (!String(process.env.SMTP_PASS ?? "").trim()) missing.push("SMTP_PASS");
  if (!String(process.env.EMAIL_FROM ?? "").trim()) missing.push("EMAIL_FROM");
  return missing;
}

function smtpPortNumber(): number {
  return Number(String(process.env.SMTP_PORT ?? "").trim());
}

function isSmtpPortValid(): boolean {
  const p = smtpPortNumber();
  return Number.isFinite(p) && p > 0;
}

/** Все пять переменных заданы непустыми строками и порт — число > 0. */
export function isSmtpFullyConfigured(): boolean {
  return listMissingSmtpEnvKeys().length === 0 && isSmtpPortValid();
}

function hasAnySmtpEnvHint(): boolean {
  return (
    !!String(process.env.SMTP_HOST ?? "").trim() ||
    !!String(process.env.SMTP_PORT ?? "").trim() ||
    !!String(process.env.SMTP_USER ?? "").trim() ||
    !!String(process.env.SMTP_PASS ?? "").trim() ||
    !!String(process.env.EMAIL_FROM ?? "").trim()
  );
}

/**
 * Приоритет: полный SMTP → иначе Resend (fallback).
 */
export function getConfiguredMailProvider(): MailProvider | "none" {
  if (isSmtpFullyConfigured()) return "smtp";
  if (String(process.env.RESEND_API_KEY ?? "").trim()) return "resend";
  return "none";
}

export function getMailProviderBlocker():
  | null
  | { code: "missing_smtp_env" | "no_mail_provider" } {
  if (getConfiguredMailProvider() !== "none") return null;
  const resend = String(process.env.RESEND_API_KEY ?? "").trim();
  if (hasAnySmtpEnvHint() && !resend) return { code: "missing_smtp_env" };
  return { code: "no_mail_provider" };
}

function logMailEnvSnapshot(): void {
  console.log("[mail] SMTP_HOST", !!process.env.SMTP_HOST);
  console.log("[mail] SMTP_PORT", !!process.env.SMTP_PORT, process.env.SMTP_PORT);
  console.log("[mail] SMTP_USER", !!process.env.SMTP_USER);
  console.log("[mail] SMTP_PASS", !!process.env.SMTP_PASS);
  console.log("[mail] EMAIL_FROM", !!process.env.EMAIL_FROM);
}

/** 465 → implicit TLS; иначе STARTTLS (587 и др.). */
function smtpSecureForPort(port: number): boolean {
  return port === 465;
}

function parseSmtpError(e: unknown): { name: string; code: string; message: string } {
  const err = e as Error & {
    code?: string;
    responseCode?: number | string;
    response?: string;
  };
  const name = err instanceof Error ? err.name : "Error";
  const message = err instanceof Error ? err.message : String(e);
  const code =
    (err.code !== undefined && String(err.code)) ||
    (err.responseCode !== undefined && String(err.responseCode)) ||
    "";
  return { name, code: code || "unknown", message };
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  logMailEnvSnapshot();

  const smtpReady = isSmtpFullyConfigured();
  console.log(`[sendMail] smtp config present=${smtpReady}`);

  if (smtpReady) {
    const host = String(process.env.SMTP_HOST ?? "").trim();
    const port = smtpPortNumber();
    const user = String(process.env.SMTP_USER ?? "").trim();
    const pass = getSmtpPassword();
    const from = String(process.env.EMAIL_FROM ?? "").trim();
    const secure = smtpSecureForPort(port);

    console.log("[sendMail] provider=smtp");
    console.log(`[sendMail] smtp host present=${!!host}`);
    console.log(`[sendMail] smtp user present=${!!user}`);
    console.log(`[sendMail] smtp pass present=${!!pass}`);
    console.log(`[sendMail] smtp port=${port}`);
    console.log(`[sendMail] smtp secure=${secure}`);
    console.log("[sendMail] mail send start");

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      await transporter.sendMail({
        from: from.includes("@") ? from : user,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html:
          params.html ??
          `<pre style="font-family:system-ui,sans-serif">${escapeHtml(params.text)}</pre>`,
      });
      console.log("[sendMail] mail send success");
      return { ok: true, provider: "smtp" };
    } catch (e) {
      const { name, code, message } = parseSmtpError(e);
      console.error(
        `[sendMail] mail send failed name=${name} code=${code} message=${message}`
      );
      return {
        ok: false,
        provider: "smtp",
        error: message,
        smtpCode: code,
        smtpMessage: message,
      };
    }
  }

  const resendKey = String(process.env.RESEND_API_KEY ?? "").trim();
  const fromFallback =
    String(process.env.EMAIL_FROM ?? "").trim() || "onboarding@resend.dev";

  if (resendKey) {
    console.log("[sendMail] provider=resend (SMTP не полностью настроен — fallback)");
    console.log("[sendMail] mail send start");
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromFallback,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          html: params.html ?? `<pre style="font-family:system-ui,sans-serif">${escapeHtml(
            params.text
          )}</pre>`,
        }),
      });
      const raw = await res.text();
      const safeRaw = redactSensitiveLogSnippet(raw);
      if (!res.ok) {
        console.error(
          `[sendMail] mail send failed name=ResendHTTP code=${res.status} message=${safeRaw.slice(0, 300)}`
        );
        return {
          ok: false,
          provider: "resend",
          error: `resend_http_${res.status}`,
          detail: safeRaw.slice(0, 400),
        };
      }
      console.log("[sendMail] mail send success");
      return { ok: true, provider: "resend" };
    } catch (e) {
      const { name, code, message } = parseSmtpError(e);
      console.error(
        `[sendMail] mail send failed name=${name} code=${code} message=${message}`
      );
      return {
        ok: false,
        provider: "resend",
        error: message,
        detail: message,
      };
    }
  }

  const missing = listMissingSmtpEnvKeys();
  let detail: string;
  if (missing.length > 0) {
    detail = `missing: ${missing.join(", ")}`;
  } else if (!isSmtpPortValid() && String(process.env.SMTP_PORT ?? "").trim()) {
    detail = "invalid SMTP_PORT";
  } else {
    detail = "missing: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM";
  }
  console.error("[sendMail] no provider configured", detail);
  return { ok: false, error: "smtp_env_incomplete", detail };
}

function redactSensitiveLogSnippet(s: string): string {
  return s.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
