import { createHash, timingSafeEqual } from "node:crypto";

// Imported by proxy.ts, so it reads process.env directly instead of the server-only env(). Admin
// config stays out of env() on purpose: a weak or missing password must lock the dashboard, not
// take down checkout.
const MIN_PASSWORD_LENGTH = 12;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function isAdminAuthorized(authorization: string | null): boolean {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!user || !password || password.length < MIN_PASSWORD_LENGTH || !authorization?.startsWith("Basic ")) return false;
  const given = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
  return timingSafeEqual(digest(given), digest(`${user}:${password}`));
}
