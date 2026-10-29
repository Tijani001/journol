import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** The front page, terms and privacy are public; everything else is a journalist's own work. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/app", "/terms", "/privacy", "/sign-up"], disallow: ["/api/", "/story/", "/angle/", "/angles", "/stories", "/read", "/account", "/admin"] },
    host: SITE_URL,
  };
}
