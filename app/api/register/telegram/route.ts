import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { hasTelegramEnv } from "@/lib/telegram";
import {
  buildRegistrationNotificationHtml,
  escapeTelegramHtml,
  sendTelegramNotification,
} from "@/lib/server/sendTelegramNotification";

const FALLBACK_DEFAULT = "ТЕСТ / fallback без Firebase Admin";

export async function GET() {
  const hasToken = !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const hasChatId = !!String(process.env.TELEGRAM_CHAT_ID || "").trim();
  return NextResponse.json({
    ok: true,
    hasToken,
    hasChatId,
  });
}

export async function POST(req: Request) {
  console.log("[api/register/telegram] POST called");

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const bodyText = String(body.text || "").trim();
  console.log(`[api/register/telegram] body text present: ${bodyText.length > 0}`);

  const app = getAdminApp();
  let html: string;
  let mode: "Firebase verified mode" | "fallback mode" = "fallback mode";

  if (!app) {
    console.error("[api/register/telegram] Firebase Admin unavailable, fallback mode");
    html = escapeTelegramHtml(bodyText || FALLBACK_DEFAULT).replace(/\n/g, "<br/>");
  } else {
    const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!idToken) {
      html = escapeTelegramHtml(bodyText || FALLBACK_DEFAULT).replace(/\n/g, "<br/>");
    } else {
      const adminAuth = getAuth(app);
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const uid = decoded.uid;
        let email = String(decoded.email || "").trim();
        if (!email) {
          const rec = await adminAuth.getUser(uid);
          email = String(rec.email || "").trim();
        }
        let name = "";
        let phone = "";
        const db = getAdminDb();
        if (db) {
          const u = await db.collection(PRICING_FS.users).doc(uid).get();
          if (u.exists) {
            const d = u.data() ?? {};
            if (typeof d.name === "string") name = d.name;
            if (typeof d.phone === "string") phone = d.phone;
          }
        }
        const date = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
        html = buildRegistrationNotificationHtml({
          email: email || "-",
          uid,
          name,
          phone,
          date,
        });
        mode = "Firebase verified mode";
      } catch (e) {
        console.error("[api/register/telegram] verifyIdToken failed", e);
        html = escapeTelegramHtml(bodyText || FALLBACK_DEFAULT).replace(/\n/g, "<br/>");
      }
    }
  }

  console.log(`[api/register/telegram] mode: ${mode}`);

  if (!hasTelegramEnv()) {
    console.error("Telegram env missing");
    return NextResponse.json({ error: "Telegram env missing" }, { status: 500 });
  }

  console.log("[api/register/telegram] sending telegram message");
  const result = await sendTelegramNotification(html);
  console.log(`[api/register/telegram] telegram result ok: ${result.ok}`);

  if (result.skipped && result.reason === "missing_env") {
    console.error("Telegram env missing");
    return NextResponse.json({ error: "Telegram env missing" }, { status: 500 });
  }

  if (!result.ok) {
    const errMsg =
      result.telegramDescription ||
      result.error ||
      (typeof result.data?.description === "string" ? result.data.description : null) ||
      "telegram_send_failed";
    return NextResponse.json(
      {
        ok: false,
        error: errMsg,
        httpStatus: result.httpStatus,
        telegramErrorCode: result.telegramErrorCode,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
