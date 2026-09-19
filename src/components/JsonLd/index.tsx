/**
 * Renders a JSON-LD structured data block.
 *
 * Search engines read this to build rich results. It is a server
 * component, so the markup ships in the prerendered HTML.
 *
 * `dangerouslySetInnerHTML` is required — React escapes text children,
 * which would corrupt the JSON. The input is our own static config, never
 * user or model content.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
