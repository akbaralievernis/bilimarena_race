import type { MetadataRoute } from "next";

// Only the landing page is public content; races, lobbies and reports are
// private classroom pages and must not end up in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/$", disallow: "/" },
  };
}
