/* The town map in the start menu: each screen is a building in a small town of grass,
   paths, trees and a pond, drawn from a grid of tiles like a map in a handheld game.
   Wide windows get a wide town; phones a tall one, so the buildings stay large. */
import type { ReactNode } from "react";
import type { PlaceKind } from "./sprite";

// Tiles: T tree, . grass, * flowers, = path, ~ water, , tall grass, B under a building.
export type TownLayout = {
  tiles: string[];
  /** Where each place stands: column, row, width and height in tiles. */
  places: Record<PlaceKind, [col: number, row: number, w: number, h: number]>;
};

export const TOWNS: Record<"wide" | "tall", TownLayout> = {
  wide: {
    tiles: [
      "TTTTTTTTTTTTTTTTTTTTTTTTTT",
      "T..*......*.....*.....*..T",
      "T.BBB..BBB..BBB..BBB.BBB.T",
      "T.BBB..BBB..BBB..BBB.BBB.T",
      "T.BBB..BBB..BBB..BBB.BBB.T",
      "T========================T",
      "T..*......=......*...,,,,T",
      "T.........=..........,,,,T",
      "T.BBB..BBB=.BBB..BBB.,,,,T",
      "T.BBB..BBB=.BBB..BBB.,,,,T",
      "T.BBB..BBB=.BBB..BBB.,,,,T",
      "T====================,,,,T",
      "T.~~~~....=..*.......*...T",
      "T.~~~~....=..............T",
      "TTTTTTTTTT=TTTTTTTTTTTTTTT",
    ],
    places: {
      home: [2, 2, 3, 3],
      mart: [7, 2, 3, 3],
      bank: [12, 2, 3, 3],
      pc: [17, 2, 3, 3],
      tower: [21, 2, 3, 3],
      arena: [2, 8, 3, 3],
      library: [7, 8, 3, 3],
      tent: [12, 8, 3, 3],
      workshop: [17, 8, 3, 3],
      grass: [21, 6, 4, 6],
    },
  },
  tall: {
    tiles: [
      "TTTTTTTTTTTTT",
      "TBBB.BBB.BBBT",
      "TBBB.BBB.BBBT",
      "TBBB.BBB.BBBT",
      "T===========T",
      "TBBB.BBB.BBBT",
      "TBBB.BBB.BBBT",
      "TBBB.BBB.BBBT",
      "T===========T",
      "TBBB.BBB.BBBT",
      "TBBB.BBB.BBBT",
      "TBBB.BBB.BBBT",
      "T===========T",
      "T~~~*.=.,,,,T",
      "T~~~..=.,,,,T",
      "T.*...=.....T",
      "TTTTTT=TTTTTT",
    ],
    places: {
      home: [1, 1, 3, 3],
      mart: [5, 1, 3, 3],
      bank: [9, 1, 3, 3],
      pc: [1, 5, 3, 3],
      tower: [5, 5, 3, 3],
      arena: [9, 5, 3, 3],
      library: [1, 9, 3, 3],
      tent: [5, 9, 3, 3],
      workshop: [9, 9, 3, 3],
      grass: [8, 13, 4, 2],
    },
  },
};

// ---- The ground ----------------------------------------------------------------
// Each tile is 8 by 8 map pixels.

const GROUND = {
  grass: "#74c05a",
  tuft: "#5aa648",
  path: "#e6cf98",
  speck: "#cdb47a",
  water: "#4b8fd6",
  wave: "#9cccf4",
  leaf: "#2f7d3b",
  leafLight: "#4a9a4c",
  trunk: "#6a4020",
  tall: "#3f9a4a",
  blade: "#2a6e33",
  tip: "#8fd468",
  flowers: ["#e8505b", "#fff6c8", "#f2b632"],
};

function tile(c: string, x: number, y: number, key: string): ReactNode[] {
  const px = x * 8;
  const py = y * 8;
  const r = (dx: number, dy: number, w: number, h: number, fill: string, k: string) => (
    <rect key={`${key}${k}`} x={px + dx} y={py + dy} width={w} height={h} fill={fill} />
  );
  const odd = (x + y) % 2 === 1;
  switch (c) {
    case "=":
      return [r(0, 0, 8, 8, GROUND.path, "p"), r(odd ? 2 : 5, odd ? 5 : 2, 1, 1, GROUND.speck, "s")];
    case "~":
      return [r(0, 0, 8, 8, GROUND.water, "w"), r(y % 2 ? 1 : 4, 2, 3, 1, GROUND.wave, "a"), r(y % 2 ? 5 : 0, 6, 2, 1, GROUND.wave, "b")];
    case "T":
      return [
        r(0, 0, 8, 8, GROUND.grass, "g"),
        r(1, 0, 6, 6, GROUND.leaf, "c"),
        r(0, 1, 8, 4, GROUND.leaf, "d"),
        r(2, 1, 2, 2, GROUND.leafLight, "l"),
        r(3, 6, 2, 2, GROUND.trunk, "t"),
      ];
    case ",":
      return [
        r(0, 0, 8, 8, GROUND.tall, "g"),
        r(1, 2, 1, 4, GROUND.blade, "a"),
        r(4, 1, 1, 4, GROUND.blade, "b"),
        r(6, 3, 1, 4, GROUND.blade, "c"),
        r(1, 1, 1, 1, GROUND.tip, "d"),
        r(4, 0, 1, 1, GROUND.tip, "e"),
        r(6, 2, 1, 1, GROUND.tip, "f"),
      ];
    case "*":
      return [
        r(0, 0, 8, 8, GROUND.grass, "g"),
        r(1, 2, 2, 2, GROUND.flowers[(x + y) % 3], "a"),
        r(5, 5, 2, 2, GROUND.flowers[(x + y + 1) % 3], "b"),
      ];
    default:
      return [r(0, 0, 8, 8, GROUND.grass, "g"), r(odd ? 1 : 5, odd ? 5 : 1, 1, 2, GROUND.tuft, "t"), r(odd ? 5 : 2, odd ? 2 : 6, 1, 1, GROUND.tuft, "u")];
  }
}

/** The tiles of a town as one pixel-art picture. */
export function TownGround({ tiles }: { tiles: string[] }) {
  return (
    <svg
      className="town-ground"
      viewBox={`0 0 ${tiles[0].length * 8} ${tiles.length * 8}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {tiles.flatMap((row, y) => [...row].flatMap((c, x) => tile(c, x, y, `${x}-${y}-`)))}
    </svg>
  );
}
