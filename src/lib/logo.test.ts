import { describe, expect, test } from "bun:test";
import { COIN, LOGO_COLORS, logoPixels, placeOnTile } from "./logo";

describe("the coin drawing", () => {
  test("is 16 by 16", () => {
    expect(COIN).toHaveLength(16);
    for (const row of COIN) expect(row).toHaveLength(16);
  });

  test("uses only colours it names", () => {
    for (const row of COIN) for (const ch of row) if (ch !== ".") expect(LOGO_COLORS[ch]).toBeDefined();
  });

  test("leaves the corners see-through, so it reads as round", () => {
    for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) expect(COIN[y][x]).toBe(".");
  });
});

describe("logoPixels", () => {
  test("lists each painted square once, with its colour", () => {
    const pixels = logoPixels();
    const painted = COIN.join("").replaceAll(".", "").length;
    expect(pixels).toHaveLength(painted);
    expect(pixels[0]).toEqual({ x: 5, y: 1, color: LOGO_COLORS.k });
  });
});

describe("placeOnTile", () => {
  test("fills the tile when the size is a multiple of 16", () => {
    expect(placeOnTile(32)).toEqual({ scale: 2, offset: 0 });
    expect(placeOnTile(192)).toEqual({ scale: 12, offset: 0 });
    expect(placeOnTile(512)).toEqual({ scale: 32, offset: 0 });
  });

  test("keeps whole pixels and centres the coin when it is not", () => {
    // 180 / 16 = 11.25: eleven per pixel, 176 wide, 2 spare on each side.
    expect(placeOnTile(180)).toEqual({ scale: 11, offset: 2 });
  });

  test("can leave a margin, for a phone icon that is cut to a rounded square", () => {
    // 85% of 180 is 153: nine per pixel, 144 wide, 18 spare on each side.
    expect(placeOnTile(180, 0.85)).toEqual({ scale: 9, offset: 18 });
  });
});
