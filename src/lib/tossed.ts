// Entries and transfers you toss are kept for a while so they can be restored.
// With Supabase they move to the `tossed` table (0004_tossed.sql); in demo mode they
// move into the demo cookie. Either way they leave the lists every total is worked
// out from, so a tossed entry counts in no total anywhere.
import type { DemoEdits, DemoEntry } from "./demo";
import type { Transaction, Transfer } from "./types";

/** How long a tossed row is kept. The same figure is in 0004_tossed.sql. */
export const KEEP_DAYS = 30;
/** Demo mode keeps its tossed rows in the cookie, which holds about 4 KB. */
export const DEMO_TOSSED_LIMIT = 8;

export type Tossed =
  | { id: string; kind: "entry"; row: DemoEntry; tossed_at: string }
  | { id: string; kind: "transfer"; row: Transfer; tossed_at: string };

/** An entry as it is stored, without the category details joined on for display. */
export const entryRow = (t: Transaction): DemoEntry => ({
  id: t.id,
  category_id: t.category_id,
  amount: t.amount,
  occurred_on: t.occurred_on,
  note: t.note,
  account_id: t.account_id,
  to_account_id: t.to_account_id,
  bill_id: t.bill_id,
});

/** What is still kept, newest toss first. */
export function keptTossed(rows: Tossed[], now: Date): Tossed[] {
  const since = now.getTime() - KEEP_DAYS * 86_400_000;
  return rows.filter((t) => new Date(t.tossed_at).getTime() >= since).toSorted((a, b) => b.tossed_at.localeCompare(a.tossed_at));
}

/** Demo mode: take an entry or transfer out of what counts, and keep it among the tossed. */
export function tossInDemo(edits: DemoEdits, item: Tossed): DemoEdits {
  const tossed = [item, ...edits.tossed.filter((t) => t.id !== item.id)].slice(0, DEMO_TOSSED_LIMIT);
  if (item.kind === "transfer") return { ...edits, transfers: edits.transfers.filter((t) => t.id !== item.id), tossed };
  // An entry added in this browser leaves the cookie; a sample entry is listed as removed.
  const mine = edits.added.some((e) => e.id === item.id);
  return {
    ...edits,
    added: edits.added.filter((e) => e.id !== item.id),
    removed: mine ? edits.removed : [...edits.removed, item.id],
    tossed,
  };
}

/** Demo mode: put a tossed entry or transfer back as it was. */
export function restoreInDemo(edits: DemoEdits, id: string): DemoEdits {
  const item = edits.tossed.find((t) => t.id === id);
  if (!item) return edits;
  const tossed = edits.tossed.filter((t) => t.id !== id);
  if (item.kind === "transfer") return { ...edits, transfers: [...edits.transfers, item.row], tossed };
  if (edits.removed.includes(id)) return { ...edits, removed: edits.removed.filter((r) => r !== id), tossed };
  return { ...edits, added: [...edits.added, item.row], tossed };
}
