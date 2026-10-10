import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/dia-das-criancas", "/privacidade", "/termos", "/contato"].map((path) => ({ url: `${SITE_URL}${path}` }));
}
