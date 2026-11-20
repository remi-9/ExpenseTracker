// The app's mark: a gold coin with the peso sign, drawn here pixel by pixel on a
// 16 × 16 grid. It is the browser-tab icon, the phone home-screen icon and the
// logo in the header (app/icon.tsx, app/apple-icon.tsx, components/logo.tsx).
// Edit the grid to change it everywhere. "." is see-through.

export const LOGO_COLORS: Record<string, string> = {
  k: "#1c2434", // outline
  h: "#ffe07a", // highlight
  g: "#e8ac1f", // gold
  s: "#b5760a", // shade
  b: "#6b3f06", // the peso sign
};

export const COIN = [
  "................",
  ".....kkkkkk.....",
  "...kkhhhhhgkk...",
  "..khhggggggggk..",
  "..khgggggggggk..",
  ".khggbbbbggggsk.",
  ".khggbgggbgggsk.",
  ".kggbbbbbbbggsk.",
  ".kgggbgggbgggsk.",
  ".kgggbbbbggggsk.",
  ".kgggbggggggssk.",
  "..kggbgggggssk..",
  "..kgggggggsssk..",
  "...kksssssskk...",
  ".....kkkkkk.....",
  "................",
];

/** The tile a phone puts the icon on: the app's panel colour, since home-screen icons cannot be see-through. */
export const LOGO_TILE = "#fbfdf2";

/** Every painted square of the coin, row by row. */
export function logoPixels(): { x: number; y: number; color: string }[] {
  return COIN.flatMap((row, y) =>
    [...row].flatMap((ch, x) => (ch === "." ? [] : [{ x, y, color: LOGO_COLORS[ch] }])),
  );
}

/**
 * How to draw the 16-pixel coin on a square tile of `size`: the whole number of
 * screen pixels per coin pixel, so it stays sharp, and the gap that centres it.
 * `fill` is the share of the tile the coin may take, for a margin.
 */
export function placeOnTile(size: number, fill = 1): { scale: number; offset: number } {
  const scale = Math.max(1, Math.floor((size * fill) / 16));
  return { scale, offset: Math.floor((size - scale * 16) / 2) };
}
