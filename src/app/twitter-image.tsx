import { ogImageAlt, ogImageContentType, ogImageSize, renderOgImage } from "@/utils/ogImage";

/**
 * Twitter card image. A separate file convention from opengraph-image —
 * Next does not reuse one for the other — but the same artwork.
 */
export const alt = ogImageAlt;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function TwitterImage() {
  return renderOgImage();
}
