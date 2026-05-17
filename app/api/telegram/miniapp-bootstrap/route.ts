import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import {
  findUserByTelegramKeys,
} from "@/lib/server/authDuplicateGuards";
import {
  linkBlockedMessage,
  linkTelegramToEmailUid,
  markTelegramRegistrationSessionLinked,
  TELEGRAM_LINK_TOKEN_PREFIX,
  upsertTelegramRegistrationSession,
} from "@/lib/server/telegram/telegramLinkShared";
import { consumeTelegramLinkToken } from "@/lib/server/telegram/telegramLinkTokens";
import { evaluateMiniAppAccessGate } from "@/lib/server/telegram/evaluateMiniAppAccessGate";
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

function readStartParam(initData: string): string {
  try {
    return String(new URLSearchParams(initData).get("start_param") || "").trim();
  } catch {
    return "";
  }
}

function publicProfilePayload(
  uid: string,
  data: Record<string, unknown>
) {
  const profile = telegramMiniAppPublicProfileFromUserDoc(uid, data);
  return {
    uid: profile.uid,
    email: profile.email,
    plan: profile.plan,
    hasPaid: profile.hasPaid,
    blocked: profile.blocked,
    telegramUserId: profile.telegramUserId,
    telegramId: profile.telegramId,
    telegramUsername: profile.telegramUsername,
  };
}

export async function POST(req: Request) {
  console.log("MINIAPP_AUTH_START");
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
    const verified = verifyTelegramInitData(initData);
    if (!verified.ok) {
      console.log("MINIAPP_AUTH_VERIFIED", { ok: false, error: verified.error });
      return NextResponse.json({ ok: false, error: "invalid_init_data" }, { status: 401 });
    }
    console.log("MINIAPP_AUTH_VERIFIED", { ok: true, telegramUserId: verified.telegramUser.id });

    const tgId = normalizeTelegramUserIdForMiniApp(verified.telegramUser.id);
    const chatKey =
      verified.chatId != null && Number.isFinite(verified.chatId)
        ? String(Math.trunc(verified.chatId)).replace(/\D/g, "")
        : null;

    const startParam = readStartParam(initData);
    let linkRaw =
      typeof body.linkToken === "string" ? body.linkToken.trim() : "";
    if (!linkRaw && startParam.toLowerCase().startsWith(TELEGRAM_LINK_TOKEN_PREFIX)) {
      linkRaw = startParam.slice(TELEGRAM_LINK_TOKEN_PREFIX.length);
    }

    const ua = req.headers.get("user-agent");
    const ipHash = hashClientIp(req);

    if (linkRaw) {
      console.log("TELEGRAM_LINK_START", { telegramUserId: tgId });
      const consumed = await consumeTelegramLinkToken(db, linkRaw);
      if (!consumed.ok) {
        const msg =
          consumed.reason === "used"
            ? "Ссылка для привязки уже использована. Создайте новую в личном кабинете на сайте."
            : consumed.reason === "expired"
              ? "Ссылка для привязки истекла. Создайте новую в личном кабинете."
              : "Ссылка для привязки недействительна.";
        return NextResponse.json({ ok: false, error: consumed.reason, message: msg }, { status: 410 });
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
          console.log("TELEGRAM_LINK_CONFLICT", { uid: consumed.uid, reason: linked.reason });
        } else if (linked.reason === "target_has_other_telegram") {
          console.log("TELEGRAM_LINK_BLOCKED_UID_HAS_OTHER_TELEGRAM", { uid: consumed.uid });
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

      const userSnap = await db.collection(PRICING_FS.users).doc(consumed.uid).get();
      const { sessionToken } = await createTelegramMiniAppSession(db, {
        uid: consumed.uid,
        telegramUserId: tgId,
        userAgent: ua,
        ipHash,
      });

      const sessionId = `mlink_${tgId}_${consumed.uid.slice(0, 8)}`;
      await markTelegramRegistrationSessionLinked(db, sessionId, consumed.uid, consumed.email).catch(
        () => null
      );

      console.log("TELEGRAM_LINK_SUCCESS", {
        uid: consumed.uid,
        telegramUserId: tgId,
        mergedFromUid: linked.mergedFromUid ?? null,
      });

      return NextResponse.json({
        ok: true,
        authStatus: "linked_existing_email",
        sessionToken,
        linkedUid: consumed.uid,
        email: consumed.email,
        profile: publicProfilePayload(
          consumed.uid,
          (userSnap.data() ?? {}) as Record<string, unknown>
        ),
      });
    }

    const lookup = await findUserByTelegramKeys(db, tgId, chatKey);
    if (lookup.kind === "ambiguous") {
      return NextResponse.json(
        { ok: false, authStatus: "duplicate_blocked", error: "telegram_lookup_ambiguous" },
        { status: 409 }
      );
    }

    if (lookup.kind === "found") {
      const doc = lookup.doc;
      const userData = doc.data() as Record<string, unknown>;
      const access = evaluateMiniAppAccessGate(doc.id, userData);
      const { sessionToken } = await createTelegramMiniAppSession(db, {
        uid: doc.id,
        telegramUserId: tgId,
        userAgent: ua,
        ipHash,
      });
      return NextResponse.json({
        ok: true,
        authStatus: "existing_user_by_telegram",
        sessionToken,
        accessAllowed: access.allowed,
        accessGate: access.reason,
        emailVerifiedByCode: access.emailVerifiedByCode,
        profile: publicProfilePayload(doc.id, userData),
      });
    }

    const pending = await upsertTelegramRegistrationSession(db, {
      telegramUser: verified.telegramUser,
      chatId: verified.chatId,
    });

    return NextResponse.json({
      ok: true,
      authStatus: "pending_email_registration",
      pendingSessionId: pending.sessionId,
      telegramConfirmed: true,
      telegramUserId: tgId,
    });
  } catch (e) {
    console.log("TELEGRAM_LINK_ERROR", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
