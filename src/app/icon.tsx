// The browser-tab icon, plus the larger sizes the web app manifest lists.
// Drawn from lib/logo.ts at build time; there is no image file.
import { logoImage } from "@/components/logo";

/** Sizes, each a multiple of 16 so every coin pixel is a whole number of screen pixels. */
const ICON_SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return ICON_SIZES.map((size) => ({ id: String(size), size: { width: size, height: size }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  return logoImage(Number(await id));
}
