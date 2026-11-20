// The icon an iPhone uses when the app is added to the home screen: the coin on
// the panel colour, with a margin, since the phone rounds the corners off.
import { logoImage } from "@/components/logo";
import { LOGO_TILE } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return logoImage(size.width, { tile: LOGO_TILE, fill: 0.85 });
}
