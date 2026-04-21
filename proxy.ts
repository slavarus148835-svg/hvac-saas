import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/verify-email" || pathname.startsWith("/verify-email/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/verify-email-code";
    return NextResponse.redirect(url, 308);
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth/send-email-code|api/auth/verify-email-code|api/auth/registration-status|api/auth/telegram|api/auth/complete-lead|api/cron/lead-recovery|api/cron/telegram-daily-report|api/cron/telegram-weekly-report|api/cron/trial-recovery|api/admin/test-telegram-report|api/debug/telegram|api/debug/set-webhook|api/debug/telegram-send-test|api/telegram/webhook).*)",
  ],
};
