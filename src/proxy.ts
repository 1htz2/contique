import type { NextRequest } from "next/server";
import { isAdminAuthorized } from "@/lib/server/admin-auth";

export function proxy(request: NextRequest) {
  if (isAdminAuthorized(request.headers.get("authorization"))) return;
  return new Response("Autenticação necessária", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export const config = { matcher: "/admin/:path*" };
