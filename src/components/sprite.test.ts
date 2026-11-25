import { describe, expect, test } from "bun:test";
import { PLACE_COLORS, PLACES, type PlaceKind } from "./sprite";

describe("town map places", () => {
  const kinds = Object.keys(PLACES) as PlaceKind[];

  test("there are ten, all different", () => {
    expect(kinds.length).toBe(10);
    expect(new Set(kinds.map((k) => PLACES[k].join("/"))).size).toBe(10);
  });

  test.each(kinds)("%s is a 16 by 14 grid", (kind) => {
    expect(PLACES[kind].length).toBe(14);
    for (const row of PLACES[kind]) expect(row.length).toBe(16);
  });

  test.each(kinds)("%s uses only defined colours, the roof colour and transparency", (kind) => {
    const allowed = new Set([...Object.keys(PLACE_COLORS), "r", "."]);
    for (const row of PLACES[kind]) for (const c of row) expect(allowed.has(c)).toBe(true);
  });

  test.each(kinds)("%s stands on the ground line", (kind) => {
    expect(PLACES[kind].at(-1)).toBe("k".repeat(16));
  });
});
