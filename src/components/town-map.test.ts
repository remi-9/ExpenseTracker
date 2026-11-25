import { describe, expect, test } from "bun:test";
import { PLACES, type PlaceKind } from "./sprite";
import { TOWNS } from "./town-map";

describe.each(Object.entries(TOWNS))("the %s town", (_name, town) => {
  const width = town.tiles[0].length;
  const kinds = Object.keys(PLACES) as PlaceKind[];

  test("is a rectangle of known tiles inside a border of trees", () => {
    for (const row of town.tiles) {
      expect(row.length).toBe(width);
      expect(row).toMatch(/^[T.*=~,B]+$/);
      expect(row[0]).toBe("T");
      expect(row.at(-1)).toBe("T");
    }
    // The top is all trees; the bottom has one gap, the road out of town.
    expect(town.tiles[0]).toBe("T".repeat(width));
    expect([...town.tiles.at(-1)!].filter((c) => c === "=").length).toBe(1);
  });

  test("has every place", () => {
    expect(Object.keys(town.places).sort()).toEqual([...kinds].sort());
  });

  test.each(kinds.filter((k) => k !== "grass"))("%s stands on building ground with its door on a path", (kind) => {
    const [col, row, w, h] = town.places[kind];
    for (let y = row; y < row + h; y++) expect(town.tiles[y].slice(col, col + w)).toBe("B".repeat(w));
    // The door is in the middle of the bottom edge; the tile in front of it is path.
    expect(town.tiles[row + h][col + Math.floor(w / 2)]).toBe("=");
  });

  test("Battle is a patch of tall grass", () => {
    const [col, row, w, h] = town.places.grass;
    for (let y = row; y < row + h; y++) expect(town.tiles[y].slice(col, col + w)).toBe(",".repeat(w));
  });

  test("every building tile belongs to a building", () => {
    const covered = new Set<string>();
    for (const kind of kinds) {
      const [col, row, w, h] = town.places[kind];
      for (let y = row; y < row + h; y++) for (let x = col; x < col + w; x++) covered.add(`${x},${y}`);
    }
    town.tiles.forEach((line, y) => [...line].forEach((c, x) => c === "B" && expect(covered.has(`${x},${y}`)).toBe(true)));
  });
});
