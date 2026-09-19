import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/config/site";

/**
 * Generates /sitemap.xml at build time.
 *
 * Add an entry whenever you add a route. When routes become data-driven
 * (a projects list, say), map over the source here instead.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: absoluteUrl("/agent"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
