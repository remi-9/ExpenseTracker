// The page backdrop is made of two parts: a colour (the "tone") and a pattern
// laid over it. Patterns are not image files; each one is a small rule that says
// which pixels of a repeating tile are on, and the tile is generated from it.

/** Backdrop colours offered on the Options screen, each with a day and a night shade. */
export const TONE_COLORS = {
  grass: { day: "#dbe6c8", night: "#11162a" },
  sky: { day: "#cfe2f3", night: "#0e2233" },
  sand: { day: "#efe2c4", night: "#241c14" },
  rose: { day: "#f3d6d6", night: "#261320" },
  lilac: { day: "#e0d8f0", night: "#1a1430" },
  slate: { day: "#d5dae0", night: "#15171c" },
};
export type Tone = keyof typeof TONE_COLORS;
export const TONES = Object.keys(TONE_COLORS) as Tone[];

/** Blend two #rrggbb colours: `share` of the second into the first. */
function mix(a: string, b: string, share: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(a, i) * (1 - share) + channel(b, i) * share).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The pattern is drawn in the tone itself, nudged a little towards the ink colour. */
export const markColor = (tone: Tone, time: "day" | "night") =>
  time === "day" ? mix(TONE_COLORS[tone].day, "#1c2434", 0.1) : mix(TONE_COLORS[tone].night, "#e8eed6", 0.07);

const SIZE = 32; // pixels per tile side
const SCALE = 2; // screen pixels per tile pixel

/** Distance from (x, y) to the nearest of the tile's repeating centres at `step` intervals. */
function fromCentre(x: number, y: number, step: number) {
  const dx = ((x % step) + step) % step - step / 2;
  const dy = ((y % step) + step) % step - step / 2;
  return { dx, dy, d: Math.hypot(dx, dy) };
}

/** Each pattern answers one question: is the pixel at (x, y) on? */
const RULES = {
  /** Poké Ball outlines: a ring, a band across the middle, and a button. */
  balls: (x: number, y: number) => {
    const { dy, d } = fromCentre(x + 0.5, y + 0.5, 16);
    const ring = d >= 5 && d < 6.2;
    const band = Math.abs(dy) < 0.6 && d < 5 && d >= 2.4;
    const button = d >= 1.2 && d < 2.4;
    return ring || band || button;
  },
  dots: (x: number, y: number) => fromCentre(x + 0.5, y + 0.5, 8).d < 1.2,
  checker: (x: number, y: number) => (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0,
  stripes: (x: number, y: number) => (x + y) % 8 < 2,
  diamonds: (x: number, y: number) => {
    const { dx, dy } = fromCentre(x + 0.5, y + 0.5, 16);
    const m = Math.abs(dx) + Math.abs(dy);
    return m >= 5 && m < 6.5;
  },
  waves: (x: number, y: number) => {
    const crest = 3 + Math.round(2 * Math.sin((x / SIZE) * Math.PI * 4));
    return ((y % 8) + 8) % 8 === crest;
  },
  /** Nothing on top: the plain colour. */
  plain: () => false,
} satisfies Record<string, (x: number, y: number) => boolean>;

export type Pattern = keyof typeof RULES;
export const PATTERNS = Object.keys(RULES) as Pattern[];

export const DEFAULT_BACKDROP: { tone: Tone; pattern: Pattern } = { tone: "grass", pattern: "balls" };

/** The pattern's tile as a CSS background image in the given colour. */
export function patternTile(pattern: Pattern, color: string): { image: string; size: number } {
  const on = RULES[pattern];
  let rects = "";
  for (let y = 0; y < SIZE; y++) {
    // Merge runs of lit pixels into one rectangle per run.
    for (let x = 0; x < SIZE; ) {
      if (!on(x, y)) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < SIZE && on(end, y)) end++;
      rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1"/>`;
      x = end;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges" fill="${color}">${rects}</svg>`;
  return { image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, size: SIZE * SCALE };
}
