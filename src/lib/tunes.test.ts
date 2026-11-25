import { describe, expect, test } from "bun:test";
import { loopLength, noteEvents, TUNES, tuneFor, type TuneName } from "./tunes";

describe("tuneFor", () => {
  test("mornings play the route theme", () => {
    expect([5, 8, 10].map(tuneFor)).toEqual(["route", "route", "route"]);
  });
  test("afternoons play the cafe tune", () => {
    expect([11, 14, 17].map(tuneFor)).toEqual(["cafe", "cafe", "cafe"]);
  });
  test("evenings and nights play the waltz", () => {
    expect([18, 21, 23, 0, 4].map(tuneFor)).toEqual(["waltz", "waltz", "waltz", "waltz", "waltz"]);
  });
});

describe("tunes", () => {
  const names = Object.keys(TUNES) as TuneName[];

  test("there are the three day tunes and the battle tune", () => {
    expect(names.sort()).toEqual(["battle", "cafe", "route", "waltz"]);
  });

  test("each loop is a whole number of bars", () => {
    expect(loopLength(TUNES.cafe)).toBeCloseTo(25.6);
    expect(loopLength(TUNES.waltz)).toBeCloseTo(30);
    expect(loopLength(TUNES.route)).toBeCloseTo(32);
    expect(loopLength(TUNES.battle)).toBeCloseTo(9.6);
  });

  test.each(names)("%s has a melody bar for every chord", (name) => {
    expect(TUNES[name].melody.length).toBe(TUNES[name].chords.length);
  });

  test.each(names)("every note of %s starts inside the loop and lasts", (name) => {
    const tune = TUNES[name];
    const events = noteEvents(tune);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(e.at).toBeLessThan(loopLength(tune));
      expect(e.len).toBeGreaterThan(0);
      expect(e.vol).toBeGreaterThan(0);
    }
  });

  test("swung eighths land late: the cafe's off-beat falls at 62% of the beat", () => {
    const offBeat = noteEvents(TUNES.cafe).find((e) => e.instrument === "bell" && e.bar === 0 && e.slot === 3);
    // Bar 0, slot 3: beat 1 (0.8 s) plus 62% of a beat.
    expect(offBeat?.at).toBeCloseTo(0.8 + 0.8 * 0.62);
  });

  test("straight tunes keep half slots even (the battle arpeggio in sixteenths)", () => {
    const arp = noteEvents(TUNES.battle).filter((e) => e.instrument === "arp" && e.bar === 0);
    expect(arp[1].at - arp[0].at).toBeCloseTo(0.075);
  });
});
