import { ImageResponse } from "next/og";
import { SITE } from "@/config/site";

/**
 * Shared renderer for the Open Graph / Twitter card image.
 *
 * Rendered by `next/og` at build time (the routes using it are static), so
 * it costs nothing at request time. Only a subset of CSS is supported —
 * flexbox and absolute positioning, no grid — and every element with more
 * than one child needs an explicit `display`.
 *
 * 1200x630 is the size Open Graph, Twitter, LinkedIn and Slack all expect.
 */

export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";
export const ogImageAlt = `${SITE.name} — ${SITE.jobTitle}`;

export function renderOgImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0c",
          padding: "80px",
          // Mirrors --agent-accent so the card matches the site.
          borderBottom: "16px solid #2563eb",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: "#fafafa",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {SITE.name}
          </div>
          <div style={{ fontSize: 40, color: "#a1a1aa" }}>{SITE.jobTitle}</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
            color: "#71717a",
          }}
        >
          <div style={{ display: "flex" }}>
            React · React Native · Node.js · Python
          </div>
          <div style={{ display: "flex", color: "#3b82f6" }}>
            {SITE.url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    ),
    ogImageSize,
  );
}
