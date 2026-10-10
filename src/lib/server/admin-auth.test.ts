import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminAuthorized } from "./admin-auth";

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

describe("isAdminAuthorized", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the configured credentials and rejects anything else", () => {
    vi.stubEnv("ADMIN_USER", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "uma-senha-bem-longa");
    expect(isAdminAuthorized(basic("admin", "uma-senha-bem-longa"))).toBe(true);
    expect(isAdminAuthorized(basic("admin", "errada"))).toBe(false);
    expect(isAdminAuthorized(null)).toBe(false);
  });

  it("locks the dashboard when the configured password is too short, even if typed correctly", () => {
    vi.stubEnv("ADMIN_USER", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "curta");
    expect(isAdminAuthorized(basic("admin", "curta"))).toBe(false);
  });
});
