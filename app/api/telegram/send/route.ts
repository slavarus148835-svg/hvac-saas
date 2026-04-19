import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import {
  buildRegistrationNotificationHtml,
  sendTelegramNotification,
  sendTelegramPlainTextAsHtml,
} from "@/lib/server/sendTelegramNotification";

export async function POST(req: Request) {
  try {
    const app = getAdminApp();
    if (!app) {
      console.error(
        "[api/telegram/send] FIREBASE_SERVICE_ACCOUNT_JSON missing — cannot verify ID token"
      );
      return NextResponse.json(
        { error: "server_auth_unavailable", hint: "Set FIREBASE_SERVICE_ACCOUNT_JSON on Vercel" },
        { status: 503 }
      );
    }
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const adminAuth = getAuth(app);
    const decoded = await adminAuth.verifyIdToken(token);

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      event?: string;
    };

    if (body.event === "registration") {
      let email = String(decoded.email || "").trim();
      if (!email) {
        const rec = await adminAuth.getUser(decoded.uid);
        email = String(rec.email || "").trim() || "-";
      }

      let name = "";
      let phone = "";
      const db = getAdminDb();
      if (db) {
        const u = await db.collection(PRICING_FS.users).doc(decoded.uid).get();
        if (u.exists) {
          const d = u.data() ?? {};
          if (typeof d.name === "string") name = d.name;
          if (typeof d.phone === "string") phone = d.phone;
        }
      }

      const datetime = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
      const html = buildRegistrationNotificationHtml({
        email: email || "-",
        uid: decoded.uid,
        name,
        phone,
        date: datetime,
      });
      try {
        const result = await sendTelegramNotification(html);
        if (!result.ok) {
          console.error("[api/telegram/send] registration telegram result", result);
        }
        return NextResponse.json(result);
      } catch (e) {
        console.error("[api/telegram/send] registration send threw", e);
        return NextResponse.json({ ok: false, skipped: true }, { status: 200 });
      }
    }

    const text = String(body?.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "empty_text" }, { status: 400 });
    }

    try {
      const result = await sendTelegramPlainTextAsHtml(text);
      if (!result.ok) {
        console.error("[api/telegram/send] custom text telegram result", result);
      }
      return NextResponse.json(result);
    } catch (e) {
      console.error("[api/telegram/send] custom send threw", e);
      return NextResponse.json({ ok: false, skipped: true }, { status: 200 });
    }
  } catch (e) {
    console.error("[api/telegram/send] handler error", e);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
