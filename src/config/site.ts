/**
 * Single source of truth for site-wide metadata.
 *
 * Everything SEO-related reads from here — layout metadata, sitemap,
 * robots, and the JSON-LD structured data — so there is one place to
 * update when details change.
 */

export const SITE = {
  name: "Izaan Jahangir",
  /** Used in <title> as "Page — Izaan Jahangir". */
  shortName: "Izaan Jahangir",
  jobTitle: "Senior Software Engineer",
  description:
    "Portfolio of Izaan Jahangir, a senior software engineer building full-stack web and mobile products with React, React Native, Node.js and Python.",
  /**
   * Absolute origin, no trailing slash. Required for canonical URLs,
   * Open Graph and the sitemap — relative URLs are invalid in those.
   * Set NEXT_PUBLIC_SITE_URL in production.
   */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  locale: "en_US",
  /** Profiles used for the JSON-LD `sameAs` property. */
  socials: {
    github: "https://github.com/izaanjahangir",
  },
} as const;

/** Builds an absolute URL from a site-relative path. */
export function absoluteUrl(path = "/"): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}
