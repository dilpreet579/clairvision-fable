import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || "https://clairvision.vercel.app";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/e/*"],
      disallow: ["/dashboard", "/login", "/forgot-password", "/reset-password", "/accept-invite"],
    },
    sitemap: `${baseUrl}/sitemap.xml`, // if we ever add a sitemap
  };
}
