// A small seeded random number generator (mulberry32). The seed lives on whatever
// object is passed in and moves forward with every draw, so a saved battle or run
// carries its own randomness: reloading the page cannot re-roll anything.

export type Seeded = { seed: number };

/** The next number in [0, 1), moving `holder.seed` forward. */
export function draw(holder: Seeded): number {
  holder.seed = (holder.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(holder.seed ^ (holder.seed >>> 15), 1 | holder.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A whole number from 0 up to, not including, `n`. */
export const drawInt = (holder: Seeded, n: number) => Math.floor(draw(holder) * n);

/** One item of a list. */
export const drawOne = <T>(holder: Seeded, list: readonly T[]): T => list[drawInt(holder, list.length)];

/** `count` different items of a list, in random order. */
export function drawSome<T>(holder: Seeded, list: readonly T[], count: number): T[] {
  const pool = [...list];
  const picks: T[] = [];
  while (picks.length < count && pool.length > 0) picks.push(...pool.splice(drawInt(holder, pool.length), 1));
  return picks;
}

/** A fresh seed for a new battle or run. */
export const newSeed = () => (Math.random() * 0x7fffffff) | 0;
