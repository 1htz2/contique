import "server-only";
import type { ApiError } from "@/lib/contracts";

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || req.headers.get("x-real-ip")?.trim() || null)?.slice(0, 64) ?? null;
}

export const userAgent = (req: Request) => req.headers.get("user-agent")?.slice(0, 400) ?? null;

export function cookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("cookie")?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("=")).slice(0, 300) || undefined;
  }
  return undefined;
}

export function json<T>(body: T, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export const apiError = (error: string, status: number) => json<ApiError>({ error }, status);

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
