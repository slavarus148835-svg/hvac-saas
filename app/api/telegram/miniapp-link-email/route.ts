import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { findUsersByNormalizedEmail, normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import { ensureUserEmailVerificationFromAuth } from "@/lib/server/telegram/ensureUserEmailVerificationFromAuth";
import {
  linkBlockedMessage,
  linkTelegramToEmailUid,
} from "@/lib/server/telegram/telegramLinkShared";
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

export async function POST(req: Request) {
  try {
    let body: { initData?: string; email?: string };
    try {
      body = (await req.json()) as { initData?: string; email?: string };
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const initData = typeof body.initData === "string" ? body.initData : "";
    const verified = verifyTelegramInitData(initData);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, error: "invalid_init_data" }, { status: 401 });
    }

    const normEmail = normalizeEmailForAuth(String(body.email ?? ""));
    if (!normEmail || !normEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const tgId = normalizeTelegramUserIdForMiniApp(verified.telegramUser.id);
    const chatKey =
      verified.chatId != null && Number.isFinite(verified.chatId)
        ? String(Math.trunc(verified.chatId)).replace(/\D/g, "")
        : null;

    const app = getAdminApp();
    const db = getAdminDb();
    if (!app || !db) {
      return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
    }

    console.log("AUTH_DUPLICATE_CHECK_START", { field: "email_link", normalizedEmail: normEmail });

    const byEmail = await findUsersByNormalizedEmail(db, normEmail);
    if (byEmail.length === 0) {
      console.log("TELEGRAM_MINIAPP_LINK_EMAIL", { outcome: "email_not_in_firestore" });
      return NextResponse.json(
        {
          ok: false,
          authStatus: "email_not_registered",
          message:
            "Такой email не найден. Зарегистрируйтесь на сайте с этим email, затем снова откройте Mini App.",
        },
        { status: 404 }
      );
    }
    if (byEmail.length > 1) {
      console.log("AUTH_DUPLICATE_BLOCKED", { reason: "multiple_users_same_email", count: byEmail.length });
      return NextResponse.json(
        { ok: false, authStatus: "duplicate_blocked", error: "email_ambiguous" },
        { status: 409 }
      );
    }

    const target = byEmail[0]!;
    const targetUid = target.id;
    const targetData = target.data() as Record<string, unknown>;
    const docEmail = normalizeEmailForAuth(String(targetData.email ?? ""));
    if (docEmail && docEmail !== normEmail) {
      console.log("AUTH_DUPLICATE_BLOCKED", { reason: "normalized_email_mismatch", targetUid });
      return NextResponse.json(
        { ok: false, authStatus: "duplicate_blocked", error: "email_mismatch" },
        { status: 409 }
      );
    }

    const linked = await linkTelegramToEmailUid(db, app, {
      targetUid,
      telegramUser: verified.telegramUser,
      chatId: verified.chatId,
      registrationSource: "telegram_mini_app",
    });

    if (!linked.ok) {
      const blockedReason =
        linked.reason === "telegram_bound_elsewhere" ? "merge_conflict" : linked.reason;
      return NextResponse.json(
        {
          ok: false,
          authStatus: "duplicate_blocked",
          error: blockedReason,
          message: linkBlockedMessage(blockedReason),
        },
        { status: 409 }
      );
    }

    console.log("AUTH_TELEGRAM_LINKED_TO_EXISTING_EMAIL_USER", {
      uid: targetUid,
      telegramUserId: tgId,
      mergedFromUid: linked.mergedFromUid ?? null,
    });
    console.log("AUTH_TRIAL_REUSE_EXISTING_USER", { uid: targetUid, source: "miniapp_link_email" });

    const ua = req.headers.get("user-agent");
    const ipHash = hashClientIp(req);
    const { sessionToken } = await createTelegramMiniAppSession(db, {
      uid: targetUid,
      telegramUserId: tgId,
      userAgent: ua,
      ipHash,
    });

    const fresh = await db.collection(PRICING_FS.users).doc(targetUid).get();
    let freshData = (fresh.data() ?? targetData) as Record<string, unknown>;
    freshData = await ensureUserEmailVerificationFromAuth(app, db, targetUid, freshData);
    const profile = telegramMiniAppPublicProfileFromUserDoc(targetUid, freshData);

    return NextResponse.json({
      ok: true,
      authStatus: "existing_user_linked_by_email",
      sessionToken,
      mergedFromUid: linked.mergedFromUid ?? null,
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
    console.error("[miniapp-link-email]", e);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
