// The Home scene: your partner runs through a loop of environments.
// Each environment is three scrolling layers (far, mid, ground) drawn as character
// grids, the same way as the tab icons. Add an environment by adding an entry to ENVS.
import type { CSSProperties, ReactNode } from "react";

type Grid = { rows: string[]; colors: Record<string, string>; cell: number };

/** Turn a character grid into a repeating background tile. */
function tile({ rows, colors, cell }: Grid) {
  const width = Math.max(...rows.map((r) => r.length));
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (colors[c]) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colors[c]}"/>`;
      x = end;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>`;
  return {
    url: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    w: width * cell,
    h: rows.length * cell,
  };
}

const SPECKS = ["x.......", "....x...", "........", "..x....."];

type Env = { name: string; sky: string; ground: string; speck: string; far: Grid; mid: Grid };

const ENVS: Env[] = [
  {
    name: "Meadow",
    sky: "#8fd0f0",
    ground: "#7fbf5a",
    speck: "#5a9a3e",
    far: {
      cell: 6,
      colors: { w: "#f4fbff" },
      rows: ["........................", "...ww..........www......", "..wwww........wwwww.....", ".wwwwww......wwwwwww....", ...Array(9).fill("........................")],
    },
    mid: {
      cell: 8,
      colors: { h: "#5fae4c", d: "#4f9a40" },
      rows: ["......hhhh......", "....hhhhhhhh....", "..hhhhhdhhhhhh..", ".hhhhhhhhhhdhhh.", "hhhdhhhhhhhhhhhh"],
    },
  },
  {
    name: "Forest",
    sky: "#bfe3c0",
    ground: "#4f8f4a",
    speck: "#3b7038",
    far: {
      cell: 6,
      colors: { f: "#6fa878" },
      rows: [".....f......", "....fff.....", "...fffff....", "....fff.....", "...fffff....", "..fffffff...", ".....f......"],
    },
    mid: {
      cell: 8,
      colors: { g: "#2f7a3c", G: "#3f9a4c", b: "#6a4a2c" },
      rows: ["......gg......", ".....gggg.....", "....gggggg....", "...ggGGgggg...", "....gggggg....", "...gggggggg...", "..ggGGGggggg..", ".gggggggggggg.", "......bb......", "......bb......"],
    },
  },
  {
    name: "Beach",
    sky: "#9fe0f5",
    ground: "#f0dc9a",
    speck: "#d9bf72",
    far: {
      cell: 6,
      colors: { s: "#3f8fd0", w: "#bfe6ff" },
      rows: ["ssssssssssssssss", "sswwsssssssswwss", "ssssssssssssssss", "sssssswwssssssss", "ssssssssssssssss"],
    },
    mid: {
      cell: 8,
      colors: { p: "#2f9a4c", t: "#8a5a2c" },
      rows: ["...ppp.ppp..", "..ppppppppp.", ".pp..ppp..pp", ".p....t....p", "......t.....", ".....tt.....", ".....t......", ".....t......", ".....t......"],
    },
  },
  {
    name: "Cave",
    sky: "#3a3048",
    ground: "#5a4a66",
    speck: "#43364f",
    far: {
      cell: 6,
      colors: { r: "#4a3d5a" },
      rows: ["....rr......", "...rrrr.....", "..rrrrrr..rr", ".rrrrrrrrrrr", "rrrrrrrrrrrr", "rrrrrrrrrrrr"],
    },
    mid: {
      cell: 8,
      colors: { c: "#4fc9d9", C: "#c8f6ff", k: "#2e2438" },
      rows: ["......c.......", ".....cCc......", ".....cCc...c..", "..kk.cCc..cCc.", ".kkkkcCckkcCck", "kkkkkkkkkkkkkk"],
    },
  },
  {
    name: "Town",
    sky: "#f5b78a",
    ground: "#b9a58a",
    speck: "#9a876e",
    far: {
      cell: 6,
      colors: { b: "#7a5a7a", y: "#ffe08a" },
      rows: ["....bbbb............", "....bybb.....bbbbb..", ".bbbbbbb.....bybyb..", ".bybbybb..bbbbbbbb..", ".bbbbbbb..bybbybyb..", ".bybbybbbbbbbbbbbbb.", ".bbbbbbbbbybbybbybb.", "bbbbbbbbbbbbbbbbbbbb"],
    },
    mid: {
      cell: 8,
      colors: { l: "#3b2a40", y: "#fff2b0", f: "#5a4058" },
      rows: ["..yy........", "..ll........", "..l.........", "..l..f..f..f", "..l.ffffffff", "..l..f..f..f"],
    },
  },
  {
    name: "Snowfield",
    sky: "#cfe6f5",
    ground: "#f4faff",
    speck: "#c9dceb",
    far: {
      cell: 6,
      colors: { m: "#8fa6c0", w: "#ffffff" },
      rows: [".......w........", "......www.......", ".....mwwmm......", "....mmmmmmm....w", "...mmmmmmmmm..ww", "..mmmmmmmmmmmmmm", "mmmmmmmmmmmmmmmm"],
    },
    mid: {
      cell: 8,
      colors: { g: "#3a7a5a", w: "#ffffff", b: "#6a4a2c" },
      rows: [".....w......", "....wgw.....", "...wgggw....", "....ggg.....", "...wgggw....", "..wgggggw...", ".ggggggggg..", ".....b......"],
    },
  },
];

/** Seconds each environment stays on screen. */
const SLOT = 9;

function Layer({ grid, className, seconds }: { grid: Grid; className: string; seconds: number }) {
  const t = tile(grid);
  return (
    <div
      className={`layer ${className}`}
      style={
        {
          backgroundImage: t.url,
          backgroundSize: `${t.w}px ${t.h}px`,
          height: t.h,
          "--w": `${t.w}px`,
          animationDuration: `${seconds}s`,
        } as CSSProperties
      }
    />
  );
}

export function Scene({ paused, children }: { paused?: boolean; children: ReactNode }) {
  const n = ENVS.length;
  const share = 100 / n;
  // Each environment fades in, holds for its slot, then fades out; delays stagger them.
  const keyframes = `@keyframes env-cycle{0%{opacity:0}2%{opacity:1}${share}%{opacity:1}${share + 2}%{opacity:0}100%{opacity:0}}`;
  return (
    <div className={`scene ${paused ? "paused" : ""}`} style={{ background: ENVS[0].sky }}>
      <style>{keyframes}</style>
      {ENVS.map((env, i) => (
        <div
          key={env.name}
          className="env"
          style={{ background: env.sky, animationDuration: `${n * SLOT}s`, animationDelay: `${i * SLOT}s` }}
        >
          <Layer grid={env.far} className="far" seconds={40} />
          <Layer grid={env.mid} className="mid" seconds={12} />
          <div className="ground" style={{ backgroundColor: env.ground }}>
            <Layer grid={{ rows: SPECKS, colors: { x: env.speck }, cell: 8 }} className="specks" seconds={2.5} />
          </div>
        </div>
      ))}
      {children}
    </div>
  );
}
