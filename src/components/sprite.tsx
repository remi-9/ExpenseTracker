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
  note: ["....xx..", "....xxx.", "....x.xx", "....x..x", "....x...", ".xxxx...", "xxxxx...", ".xxx...."],
  sun: ["...x....", ".x...x..", "..xxx...", "x.xxx.x.", "..xxx...", ".x...x..", "...x....", "........"],
  moon: ["..xxx...", ".xx.....", "xx......", "xx......", "xx......", ".xx...x.", "..xxxx..", "........"],
  bag: ["..xxxx..", ".x....x.", "xxxxxxxx", "xxxxxxxx", "xxx..xxx", "xxxxxxxx", "xxxxxxxx", "........"],
  battle: ["x......x", "xx....xx", ".xx..xx.", "..xxxx..", "..xxxx..", ".xx..xx.", "xx....xx", "x......x"],
  dex: ["..xxxx..", ".x....x.", "x......x", "xxx..xxx", "xxx..xxx", "xxxxxxxx", ".xxxxxx.", "..xxxx.."],
  setup: ["...xx...", ".x.xx.x.", "..xxxx..", "xxx..xxx", "xxx..xxx", "..xxxx..", ".x.xx.x.", "...xx..."],
  wallet: ["........", ".xxxxxx.", "xxxxxxxx", "x.....xx", "x...xx.x", "x.....xx", "xxxxxxxx", "........"],
  pc: ["xxxxxxxx", "x......x", "x.xxxx.x", "x......x", "xxxxxxxx", "...xx...", "..xxxx..", "........"],
  map: ["xx.xx.xx", "x.x..x.x", "x.x..x.x", "x.x..x.x", "x.x..x.x", "x.x..x.x", "xx.xx.xx", "........"],
  menu: ["........", "xxxxxxxx", "........", "xxxxxxxx", "........", "xxxxxxxx", "........", "........"],
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
export function Hearts({ ratio, size = 22 }: { ratio: number; size?: number }) {
  const halves = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 20);
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${halves / 2} of 10 hearts`}>
      {Array.from({ length: 10 }, (_, i) => {
        const fill = Math.max(0, Math.min(2, halves - i * 2));
        const palette = { k: INK, r: fill === 0 ? "var(--track)" : "var(--red)", e: "var(--track)" };
        return <Sprite key={i} rows={fill === 1 ? HALF_HEART : HEART} palette={palette} size={size} />;
      })}
    </span>
  );
}

// ---- Town map ---------------------------------------------------------------------
// One small building, recoloured for each place, and a patch of tall grass.

// ---- Town map places (16×14) --------------------------------------------------
// Each screen is a building that shows what it is for; r is that screen's roof colour.

export type PlaceKind = "home" | "mart" | "bank" | "pc" | "tower" | "arena" | "grass" | "library" | "tent" | "workshop";

export const PLACE_COLORS: Record<string, string> = {
  w: "#f4ecd8", // wall
  g: "#7fc4e8", // glass
  d: "#6a4020", // door, wood
  k: INK,
  s: "#d8dde4", // smoke
  m: "#8a8f98", // metal, stone
  t: "#ffffff",
  e: "#cf3a33",
  b: "#2d5fc4",
  n: "#3f9a4a",
  o: "#2a6e33",
  y: "#f2b632",
};

export const PLACES: Record<PlaceKind, string[]> = {
  // Home: a cottage with a smoking chimney.
  home: [
    "..........s.s...",
    "...........s....",
    ".....rrrrr.mm...",
    "....rrrrrrrmm...",
    "...rrrrrrrrrr...",
    "..rrrrrrrrrrrr..",
    ".rrrrrrrrrrrrrr.",
    "..wwwwwwwwwwww..",
    "..wggwwwwwwggw..",
    "..wggwwddwwggw..",
    "..wwwwwddwwwww..",
    "..wwwwwddwwwww..",
    "..wwwwwddwwwww..",
    "kkkkkkkkkkkkkkkk",
  ],
  // Log: a shop with a sign, a striped awning and goods in the window.
  mart: [
    "................",
    "..rrrrrrrrrrrr..",
    "..rrrrrrrrrrrr..",
    "..wwwwyyyywwww..",
    "..wwwwyyyywwww..",
    ".rtrtrtrtrtrtrt.",
    ".rtrtrtrtrtrtrt.",
    "..wwwwwwwwwwww..",
    "..wgggggwwddww..",
    "..wgyggewwddww..",
    "..wgggggwwddww..",
    "..wwwwwwwwddww..",
    "..wwwwwwwwddww..",
    "kkkkkkkkkkkkkkkk",
  ],
  // Accounts: a bank with columns and a coin in the pediment.
  bank: [
    "................",
    ".......rr.......",
    ".....rrrrrr.....",
    "...rrrrttrrrr...",
    ".rrrrrrttrrrrrr.",
    "wwwwwwwwwwwwwwww",
    ".tmtmtmddmtmtmt.",
    ".tmtmtmddmtmtmt.",
    ".tmtmtmddmtmtmt.",
    ".tmtmtmddmtmtmt.",
    ".tmtmtmddmtmtmt.",
    ".tmtmtmddmtmtmt.",
    "wwwwwwwwwwwwwwww",
    "kkkkkkkkkkkkkkkk",
  ],
  // Bills: an office with a dish on the roof and a big screen in the window.
  pc: [
    "............m...",
    "...........mmm..",
    "............m...",
    "..rrrrrrrrrrrr..",
    ".rrrrrrrrrrrrrr.",
    "..wwwwwwwwwwww..",
    "..wkkkkkkwwwww..",
    "..wkbbbbkwwddw..",
    "..wkbnnbkwwddw..",
    "..wkbbbbkwwddw..",
    "..wkkkkkkwwddw..",
    "..wwwkkwwwwddw..",
    "..wwwwwwwwwddw..",
    "kkkkkkkkkkkkkkkk",
  ],
  // Stats: a radio tower with a bar chart on its wall.
  tower: [
    ".......ee.......",
    ".......mm.......",
    ".......mm.......",
    "......mmmm......",
    ".....rrrrrr.....",
    "....rrrrrrrr....",
    "....wwwwwwww....",
    "....wwwwwwnw....",
    "....wwwwbwnw....",
    "....wywwbwnw....",
    "....wywwbwnw....",
    "....wwwddwww....",
    "....wwwddwww....",
    "kkkkkkkkkkkkkkkk",
  ],
  // Quests: an arena with a flag and a trophy over the door.
  arena: [
    ".......kee......",
    ".......kee......",
    ".......k........",
    "...rrrrrrrrrr...",
    ".rrrrrrrrrrrrrr.",
    "rrrrrrrrrrrrrrrr",
    "wwwwwwwwwwwwwwww",
    "wwwwwwyyyywwwwww",
    "wggwwwwyywwwwggw",
    "wggwwwyyyywwwggw",
    "wwwwwwwddwwwwwww",
    "wwwwwwwddwwwwwww",
    "wwwwwwwddwwwwwww",
    "kkkkkkkkkkkkkkkk",
  ],
  // Battle: tall grass, where wild Pokémon wait.
  grass: [
    "................",
    "................",
    "................",
    "................",
    "...n.....n......",
    "..nnn...nnn...n.",
    ".nnnnn.nnnnn.nnn",
    "nnnnnnnnnnnnnnnn",
    "nonnnonnnonnnonn",
    "nnnnnnnnnnnnnnnn",
    "nnonnnnnonnnnnon",
    "nnnnnnnnnnnnnnnn",
    "nonnnnonnnnonnnn",
    "kkkkkkkkkkkkkkkk",
  ],
  // Dex: a domed library with shelves of books in the windows.
  library: [
    "......rrrr......",
    ".....rrrrrr.....",
    "....rrrrrrrr....",
    "..wwwwwwwwwwww..",
    ".rrrrrrrrrrrrrr.",
    "..wwwwwwwwwwww..",
    "..wddddwwddddw..",
    "..wdebdwwdnydw..",
    "..wdyndwwdbedw..",
    "..wddddwwddddw..",
    "..wwwwwddwwwww..",
    "..wwwwwddwwwww..",
    "..wwwwwddwwwww..",
    "kkkkkkkkkkkkkkkk",
  ],
  // Bag: a supply tent with crates beside it.
  tent: [
    "................",
    "................",
    "................",
    ".....r..........",
    "....rwr.........",
    "....rwr.........",
    "...rrwrr........",
    "...rrdrr....dddd",
    "..rrrdrrr...dyyd",
    "..rrdddrr...dyyd",
    ".rrrdddrrr..dddd",
    ".rrdddddrr.ddddd",
    "rrrdddddrrrdyyyd",
    "kkkkkkkkkkkkkkkk",
  ],
  // Options: a workshop with a gear on its wall.
  workshop: [
    "................",
    "......rrrr......",
    "....rrrrrrrr....",
    "..rrrrrrrrrrrr..",
    ".rrrrrrrrrrrrrr.",
    "..wwwwwwwwwwww..",
    "..wwwmwmwwwwww..",
    "..wwmmmmmwwggw..",
    "..wmmmwmmmwggw..",
    "..wwmmmmmwwwww..",
    "..wwwmwmwwwddw..",
    "..wwwwwwwwwddw..",
    "..wwwwwwwwwddw..",
    "kkkkkkkkkkkkkkkk",
  ],
};

/** A place on the town map, in the roof colour of its screen. */
export function Place({ kind, roof = "#cf3a33", size = 60 }: { kind: PlaceKind; roof?: string; size?: number }) {
  return <Sprite rows={PLACES[kind]} palette={{ ...PLACE_COLORS, r: roof }} size={size} />;
}
