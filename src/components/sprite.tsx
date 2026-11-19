// Pixel art without image files: each sprite is a grid of characters,
// and each character maps to a colour. "." is transparent.
// Used for the tab icons and small props (chest, shield, hearts).
// To draw a new one, add a grid and render it with <Sprite />.

type Palette = Record<string, string>;

export function Sprite({
  rows,
  palette,
  size,
  className,
  label,
}: {
  rows: string[];
  palette: Palette;
  size: number;
  className?: string;
  label?: string;
}) {
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    // Merge runs of the same colour into one rect.
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== ".") {
        rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={palette[c]} />);
      }
      x = end;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects}
    </svg>
  );
}

// ---- Tab icons (8×8, drawn in the current text colour) ---------------------

const ICONS = {
  home: ["...xx...", "..xxxx..", ".xxxxxx.", "xxxxxxxx", ".xxxxxx.", ".xx..xx.", ".xx..xx.", "........"],
  log: [".xxxxxx.", ".x....x.", ".x.xx.x.", ".x....x.", ".x.xx.x.", ".x....x.", ".xxxxxx.", "........"],
  stats: ["......xx", "......xx", "...xx.xx", "...xx.xx", "xx.xx.xx", "xx.xx.xx", "xx.xx.xx", "........"],
  quests: ["xxxxxxxx", "x.xxxx.x", "x.xxxx.x", ".xxxxxx.", "..xxxx..", "...xx...", "..xxxx..", "........"],
  dex: ["..xxxx..", ".x....x.", "x......x", "xxx..xxx", "xxx..xxx", "xxxxxxxx", ".xxxxxx.", "..xxxx.."],
  setup: ["...xx...", ".x.xx.x.", "..xxxx..", "xxx..xxx", "xxx..xxx", "..xxxx..", ".x.xx.x.", "...xx..."],
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return <Sprite rows={ICONS[name]} palette={{ x: "currentColor" }} size={size} />;
}

// ---- Props borrowed from other classic games -------------------------------------

const INK = "#1c2434";

const CHEST = {
  closed: [
    "..kkkkkkkkkk..",
    ".kbbbbbbbbbbk.",
    "kbbbbbbbbbbbbk",
    "kyyyyyyyyyyyyk",
    "kbbbbbyybbbbbk",
    "kddddykkyddddk",
    "kbbbbbyybbbbbk",
    "kbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbk",
    "kyyyyyyyyyyyyk",
    ".kkkkkkkkkkkk.",
  ],
  open: [
    "..kkkkkkkkkk..",
    ".kddddddddddk.",
    ".kddddddddddk.",
    "..kkkkkkkkkk..",
    "...w.yy.w.y...",
    "..yyyywyyyyy..",
    "kkyyyyyyywyykk",
    "kbbbbbbbbbbbbk",
    "kyyyyyyyyyyyyk",
    "kbbbbbbbbbbbbk",
    ".kkkkkkkkkkkk.",
  ],
};

/** A treasure chest for savings quests: it opens when the goal is reached. */
export function Chest({ open, size = 44 }: { open: boolean; size?: number }) {
  return (
    <Sprite
      rows={open ? CHEST.open : CHEST.closed}
      palette={{ k: INK, b: "#9a6332", d: "#6a4020", y: "#f2b632", w: "#fff6c8" }}
      size={size}
      label={open ? "Chest open" : "Chest closed"}
    />
  );
}

const SHIELD = {
  whole: [
    ".kkkkkkkkkk.",
    "kbbbbwwbbbbk",
    "kbbbbwwbbbbk",
    "kwwwwwwwwwwk",
    "kwwwwwwwwwwk",
    "kbbbbwwbbbbk",
    "kbbbbwwbbbbk",
    ".kbbbwwbbbk.",
    ".kbbbwwbbbk.",
    "..kbbwwbbk..",
    "...kbwwbk...",
    "....kkkk....",
  ],
  broken: [
    ".kkkkk.kkkk.",
    "kbbbbk.wbbbk",
    "kbbbk.wwbbbk",
    "kwwwwk.wwwwk",
    "kwwwk.wwwwwk",
    "kbbbbk.wbbbk",
    "kbbbbwk.bbbk",
    ".kbbbk.bbbk.",
    ".kbbk.wbbbk.",
    "..kbbk.bbk..",
    "...kbk.bk...",
    "....k..k....",
  ],
};

/** A shield for budget quests: it cracks when the budget is blown. */
export function Shield({ broken, size = 44 }: { broken: boolean; size?: number }) {
  return (
    <Sprite
      rows={broken ? SHIELD.broken : SHIELD.whole}
      palette={broken ? { k: INK, b: "#8a8f98", w: "#c9ced6" } : { k: INK, b: "#2d5fc4", w: "#e8f0ff" }}
      size={size}
      label={broken ? "Shield broken" : "Shield holding"}
    />
  );
}

const HEART = [".kk...kk.", "krrk.krrk", "krrrkrrrk", "krrrrrrrk", ".krrrrrk.", "..krrrk..", "...krk...", "....k...."];
// A half heart keeps the left side red.
const HALF_HEART = HEART.map((row) => [...row].map((c, x) => (c === "r" && x > 4 ? "e" : c)).join(""));

/** Wallet HP as ten hearts, the way an adventure game counts life. */
export function Hearts({ ratio }: { ratio: number }) {
  const halves = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 20);
  return (
    <span className="inline-flex flex-wrap gap-0.5" role="img" aria-label={`${halves / 2} of 10 hearts`}>
      {Array.from({ length: 10 }, (_, i) => {
        const fill = Math.max(0, Math.min(2, halves - i * 2));
        const palette = { k: INK, r: fill === 0 ? "var(--track)" : "var(--red)", e: "var(--track)" };
        return <Sprite key={i} rows={fill === 1 ? HALF_HEART : HEART} palette={palette} size={22} />;
      })}
    </span>
  );
}
