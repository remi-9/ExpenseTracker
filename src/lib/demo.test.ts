import { describe, expect, test } from "bun:test";
import { decodeEdits, encodeEdits, NO_EDITS, type DemoEdits } from "./demo";

const edits: DemoEdits = {
  added: [
    { id: "mine-abc", category_id: "food", amount: 250.5, occurred_on: "2026-11-03", note: "Lunch! ~50% off*", account_id: "bank", to_account_id: null, bill_id: null },
    { id: "mine-abd", category_id: "save", amount: 8000, occurred_on: "2026-11-01", note: null, account_id: "bank", to_account_id: "wallet", bill_id: "b-save" },
  ],
  removed: ["2026-11-3", "2026-10-7"],
  transfers: [{ id: "tr-abe", from_account: "bank", to_account: "cash", amount: 2000, occurred_on: "2026-11-05", note: null }],
  tossed: [],
};

describe("the demo cookie", () => {
  test("round-trips every edit", () => {
    expect(decodeEdits(encodeEdits(edits))).toEqual(edits);
  });

  test("reads nothing from an empty or broken cookie", () => {
    expect(decodeEdits(undefined)).toEqual(NO_EDITS);
    expect(decodeEdits("garbage")).toEqual(NO_EDITS);
  });

  test("forty entries fit in one cookie once it is URL-encoded", () => {
    const full: DemoEdits = {
      ...NO_EDITS,
      added: Array.from({ length: 40 }, (_, i) => ({
        ...edits.added[0],
        id: `mine-${(1763600000000 + i).toString(36)}`,
        note: "A typical note here",
      })),
    };
    expect(encodeURIComponent(encodeEdits(full)).length).toBeLessThan(3800);
  });
});
