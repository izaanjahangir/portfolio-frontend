import { ogImageAlt, ogImageContentType, ogImageSize, renderOgImage } from "@/utils/ogImage";

/**
 * Site-wide Open Graph image. Next picks this up by filename and injects
 * the og:image tags automatically — no metadata wiring needed.
 */
export const alt = ogImageAlt;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function OpengraphImage() {
  return renderOgImage();
}
