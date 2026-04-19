import { createHash, randomInt } from "crypto";

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailCode(plain: string, pepper: string): string {
  return createHash("sha256")
    .update(`${plain}:${pepper}`, "utf8")
    .digest("hex");
}

export function getEmailCodePepper(): string | null {
  const p = String(process.env.EMAIL_CODE_PEPPER || "").trim();
  return p || null;
}
