import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  linkBlockedMessage,
  linkTelegramToEmailUid,
  markTelegramRegistrationSessionLinked,
} from "@/lib/server/telegram/telegramLinkShared";
import { consumeTelegramLinkToken } from "@/lib/server/telegram/telegramLinkTokens";
import {
  createTelegramMiniAppSession,
  normalizeTelegramUserIdForMiniApp,
  telegramMiniAppPublicProfileFromUserDoc,
} from "@/lib/server/telegram/telegramMiniAppSession";
import { verifyTelegramInitData } from "@/lib/server/telegram/verifyTelegramInitData";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";

export const runtime = "nodejs";

function hashClientIp(req: Request): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim();
  if (!ip) return undefined;
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

/**
 * POST /api/telegram/link-miniapp-to-email
 * Привязка Telegram (initData) к существующему web email-аккаунту по одноразовому linkToken.
 */
export async function POST(req: Request) {
  console.log("TELEGRAM_LINK_START");
  try {
    const app = getAdminApp();
    const db = getAdminDb();
    if (!app || !db) {
      return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
    }

    let body: { initData?: string; linkToken?: string };
    try {
      body = (await req.json()) as { initData?: string; linkToken?: string };
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const initData = typeof body.initData === "string" ? body.initData.trim() : "";
    const linkToken = typeof body.linkToken === "string" ? body.linkToken.trim() : "";
    if (!linkToken) {
      return NextResponse.json({ ok: false, error: "missing_link_token" }, { status: 400 });
    }

    const verified = verifyTelegramInitData(initData);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, error: "invalid_init_data" }, { status: 401 });
    }

    const consumed = await consumeTelegramLinkToken(db, linkToken);
    if (!consumed.ok) {
      if (consumed.reason === "used") {
        console.log("TELEGRAM_LINK_TOKEN_USED");
      } else {
        console.log("TELEGRAM_LINK_TOKEN_EXPIRED", { reason: consumed.reason });
      }
      return NextResponse.json(
        { ok: false, error: consumed.reason, message: "Ссылка для привязки недействительна или истекла." },
        { status: 410 }
      );
    }

    const linked = await linkTelegramToEmailUid(db, app, {
      targetUid: consumed.uid,
      telegramUser: verified.telegramUser,
      chatId: verified.chatId,
      registrationSource: "web",
    });

    if (!linked.ok) {
      const blockedReason =
        linked.reason === "telegram_bound_elsewhere" ? "merge_conflict" : linked.reason;
      if (blockedReason === "merge_conflict") {
        console.log("TELEGRAM_LINK_CONFLICT", { linkedUid: consumed.uid, reason: linked.reason });
      } else if (linked.reason === "target_has_other_telegram") {
        console.log("TELEGRAM_LINK_BLOCKED_UID_HAS_OTHER_TELEGRAM");
      }
      return NextResponse.json(
        {
          ok: false,
          error: blockedReason,
          message: linkBlockedMessage(blockedReason),
        },
        { status: 409 }
      );
    }

    const tgId = normalizeTelegramUserIdForMiniApp(verified.telegramUser.id);
    const ua = req.headers.get("user-agent");
    const ipHash = hashClientIp(req);

    const { sessionToken } = await createTelegramMiniAppSession(db, {
      uid: consumed.uid,
      telegramUserId: tgId,
      userAgent: ua,
      ipHash,
    });

    await markTelegramRegistrationSessionLinked(
      db,
      `mlink_${tgId}`,
      consumed.uid,
      consumed.email
    ).catch(() => null);

    const fresh = await db.collection(PRICING_FS.users).doc(consumed.uid).get();
    const profile = telegramMiniAppPublicProfileFromUserDoc(
      consumed.uid,
      (fresh.data() ?? {}) as Record<string, unknown>
    );

    console.log("TELEGRAM_LINK_SUCCESS", {
      linkedUid: consumed.uid,
      telegramUserId: tgId,
      mergedFromUid: linked.mergedFromUid ?? null,
    });

    return NextResponse.json({
      ok: true,
      linkedUid: consumed.uid,
      email: consumed.email,
      sessionToken,
      profile: {
        uid: profile.uid,
        email: profile.email,
        plan: profile.plan,
        hasPaid: profile.hasPaid,
        blocked: profile.blocked,
        telegramUserId: profile.telegramUserId,
        telegramId: profile.telegramId,
        telegramUsername: profile.telegramUsername,
      },
    });
  } catch (e) {
    console.log("TELEGRAM_LINK_ERROR", { message: String(e) });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
