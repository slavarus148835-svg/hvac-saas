import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeEmailForAuth } from "@/lib/server/authDuplicateGuards";
import {
  buildRegistrationDiagnosis,
  evaluatePreRegistration,
  messageForRegistrationReason,
} from "@/lib/server/registrationDiagnose";

export const runtime = "nodejs";

function logStep(step: string, payload: Record<string, unknown>) {
  console.log(step, payload);
}

/**
 * Серверная проверка перед createUserWithEmailAndPassword.
 * Блокирует только реальные дубликаты (Auth или users+Auth), не orphan Firestore и не tg_*.
 */
export async function POST(req: Request) {
  let normalizedEmail = "";
  try {
    const app = getAdminApp();
    const db = getAdminDb();
    if (!app || !db) {
      logStep("REGISTRATION_STOPPED", { reason: "server_misconfigured" });
      return NextResponse.json(
        {
          ok: false,
          error: "server_misconfigured",
          reason: "server_misconfigured",
          message: messageForRegistrationReason("server_misconfigured"),
        },
        { status: 503 }
      );
    }

    let body: { email?: string; telegramLoginSessionId?: string };
    try {
      body = (await req.json()) as { email?: string; telegramLoginSessionId?: string };
    } catch {
      logStep("REGISTRATION_ERROR", { reason: "invalid_json" });
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          reason: "invalid_json",
          message: messageForRegistrationReason("internal_error"),
        },
        { status: 400 }
      );
    }

    normalizedEmail = normalizeEmailForAuth(String(body.email ?? ""));
    logStep("REGISTRATION_START", { hasTelegramSessionId: Boolean(body.telegramLoginSessionId) });
    logStep("REGISTRATION_EMAIL_NORMALIZED", { normalizedEmail });

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      logStep("REGISTRATION_STOPPED", { reason: "invalid_email" });
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_email",
          reason: "invalid_email",
          message: messageForRegistrationReason("invalid_email"),
        },
        { status: 400 }
      );
    }

    logStep("REGISTRATION_EXISTING_AUTH_CHECK", { normalizedEmail });
    logStep("REGISTRATION_EXISTING_FIRESTORE_CHECK", { normalizedEmail });

    const sid = String(body.telegramLoginSessionId ?? "").trim() || undefined;
    const evaluation = await evaluatePreRegistration(db, app, normalizedEmail, {
      telegramLoginSessionId: sid,
    });

    if (!evaluation.allowed) {
      logStep("REGISTRATION_STOPPED", {
        reason: evaluation.reason,
        normalizedEmail,
      });
      return NextResponse.json({
        ok: false,
        authStatus: evaluation.authStatus,
        reason: evaluation.reason,
        message: evaluation.message,
      });
    }

    const diagnosis = await buildRegistrationDiagnosis(db, app, normalizedEmail, {
      telegramLoginSessionId: sid,
    });
    const orphanUids = diagnosis.firestoreUsersByEmail
      .filter((u) => u.isOrphan && !u.isTgProvisionUid)
      .map((u) => u.uid);
    if (orphanUids.length > 0) {
      logStep("REGISTRATION_EXISTING_FIRESTORE_CHECK", {
        orphanFirestoreUids: orphanUids,
        action: "allowed_not_blocking",
      });
    }

    logStep("REGISTRATION_CREATE_AUTH_START", {
      normalizedEmail,
      note: "client_will_call_createUserWithEmailAndPassword",
    });

    return NextResponse.json({ ok: true, authStatus: "ok" });
  } catch (e) {
    console.error("REGISTRATION_ERROR", { normalizedEmail, error: String(e) });
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        reason: "internal_error",
        message: messageForRegistrationReason("internal_error"),
      },
      { status: 500 }
    );
  }
}
