// Pixel art without image files: each sprite is a grid of characters,
// and each character maps to a colour. "." is transparent.
// Used for the tab icons. To draw a new one, add a grid and render it with <Sprite />.

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
  categories: ["..xxxx..", ".x....x.", "xxxxxxxx", "xxxxxxxx", "xxx..xxx", "xxxxxxxx", "xxxxxxxx", "........"],
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return <Sprite rows={ICONS[name]} palette={{ x: "currentColor" }} size={size} />;
}
