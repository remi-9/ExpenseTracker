import { describe, expect, test } from "bun:test";
import { decodeEdits, DEMO_LIMIT, demoTotals, demoTransactions, encodeEdits, NO_EDITS, type DemoEdits } from "./demo";
import { today } from "./format";
import { getPlayer, summarizeMonth } from "./game";
import { netByAccount } from "./money";
import { DEMO_TOSSED_LIMIT, entryRow, keptTossed, KEEP_DAYS, restoreInDemo, tossInDemo, type Tossed } from "./tossed";

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const month = today().slice(0, 7);

/** Every figure the app shows that entries or transfers feed into. */
function figures(edits: DemoEdits) {
  const entries = demoTransactions(edits);
  const totals = demoTotals(entries);
  return {
    totals: totals.toSorted((a, b) => `${a.month}${a.category_id}`.localeCompare(`${b.month}${b.category_id}`)),
    month: summarizeMonth(totals, month),
    player: getPlayer(totals),
    net: Object.fromEntries([...netByAccount(entries, edits.transfers)].toSorted()),
  };
}

const mine = { id: "mine-1", category_id: "food", amount: 777, occurred_on: `${month}-02`, note: "Lunch", account_id: "bank", to_account_id: null, bill_id: null };
const move = { id: "tr-1", from_account: "bank", to_account: "cash", amount: 1234, occurred_on: `${month}-03`, note: null };
const start: DemoEdits = { ...NO_EDITS, added: [mine], transfers: [move] };

describe("a tossed entry counts in no total", () => {
  test("an entry added in this browser", () => {
    const tossed = tossInDemo(start, { id: mine.id, kind: "entry", row: mine, tossed_at: daysAgo(0) });
    expect(demoTransactions(tossed).some((t) => t.id === mine.id)).toBe(false);
    expect(figures(tossed)).toEqual(figures({ ...start, added: [] }));
  });

  test("a sample entry", () => {
    const sample = demoTransactions(NO_EDITS).find((t) => t.category.kind === "expense")!;
    const row = entryRow(sample);
    const tossed = tossInDemo(NO_EDITS, { id: row.id, kind: "entry", row, tossed_at: daysAgo(0) });
    const before = figures(NO_EDITS);
    const after = figures(tossed);
    expect(after.player.entries).toBe(before.player.entries - 1);
    expect(after.net[sample.account_id!]).toBe(before.net[sample.account_id!] + sample.amount);
  });

  test("a transfer", () => {
    const tossed = tossInDemo(start, { id: move.id, kind: "transfer", row: move, tossed_at: daysAgo(0) });
    expect(tossed.transfers).toEqual([]);
    expect(figures(tossed)).toEqual(figures({ ...start, transfers: [] }));
  });
});

describe("restoring puts everything back as it was", () => {
  test("an entry added in this browser", () => {
    const tossed = tossInDemo(start, { id: mine.id, kind: "entry", row: mine, tossed_at: daysAgo(0) });
    const back = restoreInDemo(tossed, mine.id);
    expect(figures(back)).toEqual(figures(start));
    expect(back.tossed).toEqual([]);
  });

  test("a sample entry", () => {
    const row = entryRow(demoTransactions(NO_EDITS)[0]);
    const back = restoreInDemo(tossInDemo(NO_EDITS, { id: row.id, kind: "entry", row, tossed_at: daysAgo(0) }), row.id);
    expect(figures(back)).toEqual(figures(NO_EDITS));
    expect(back.removed).toEqual([]);
  });

  test("a transfer", () => {
    const back = restoreInDemo(tossInDemo(start, { id: move.id, kind: "transfer", row: move, tossed_at: daysAgo(0) }), move.id);
    expect(figures(back)).toEqual(figures(start));
  });

  test("restoring something no longer kept changes nothing", () => {
    expect(restoreInDemo(start, "nope")).toEqual(start);
  });
});

describe("keptTossed", () => {
  const row = (id: string, at: string): Tossed => ({ id, kind: "transfer", row: { ...move, id }, tossed_at: at });

  test("lists the newest toss first", () => {
    expect(keptTossed([row("a", daysAgo(3)), row("b", daysAgo(1))], NOW).map((t) => t.id)).toEqual(["b", "a"]);
  });

  test(`keeps ${KEEP_DAYS} days`, () => {
    const kept = keptTossed([row("in", daysAgo(KEEP_DAYS - 0.5)), row("out", daysAgo(KEEP_DAYS + 0.5))], NOW);
    expect(kept.map((t) => t.id)).toEqual(["in"]);
  });
});

describe("the demo cookie keeps what was tossed", () => {
  test("round-trips tossed entries and transfers", () => {
    const edits = tossInDemo(tossInDemo(start, { id: mine.id, kind: "entry", row: mine, tossed_at: daysAgo(1) }), {
      id: move.id,
      kind: "transfer",
      row: move,
      tossed_at: daysAgo(0),
    });
    expect(decodeEdits(encodeEdits(edits))).toEqual(edits);
  });

  test("keeps only the latest few, so the cookie stays small", () => {
    let edits = start;
    for (let i = 0; i < DEMO_TOSSED_LIMIT + 3; i++) {
      edits = tossInDemo(edits, { id: `x${i}`, kind: "entry", row: { ...mine, id: `x${i}` }, tossed_at: daysAgo(0) });
    }
    expect(edits.tossed).toHaveLength(DEMO_TOSSED_LIMIT);
    expect(edits.tossed[0].id).toBe(`x${DEMO_TOSSED_LIMIT + 2}`);
  });

  test("a full cookie, tossed rows included, stays under the 4 KB a browser keeps", () => {
    const note = "A typical note here";
    const full: DemoEdits = {
      ...NO_EDITS,
      added: Array.from({ length: DEMO_LIMIT }, (_, i) => ({ ...mine, id: `mine-${(1763600000000 + i).toString(36)}`, note })),
      tossed: Array.from({ length: DEMO_TOSSED_LIMIT }, (_, i) => {
        const row = { ...mine, id: `mine-${(1763700000000 + i).toString(36)}`, note };
        return { id: row.id, kind: "entry" as const, row, tossed_at: new Date(1763700000000 + i).toISOString() };
      }),
    };
    expect(`demo=${encodeURIComponent(encodeEdits(full))}`.length).toBeLessThan(4000);
  });

  test("an older cookie without tossed rows still reads", () => {
    const old = "v2*mine-1~food~777~2026-11-02~bank~~~Lunch**";
    expect(decodeEdits(old).added).toHaveLength(1);
    expect(decodeEdits(old).tossed).toEqual([]);
  });
});
