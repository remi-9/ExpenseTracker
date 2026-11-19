// Made-up data shown when Supabase isn't connected yet, so the UI can be explored first.
import { shiftMonth, today } from "./format";
import type { Category, MonthTotal, Transaction } from "./types";

const cat = (
  id: string,
  name: string,
  kind: Category["kind"],
  icon: string,
  extra: Partial<Category> = {},
): Category => ({
  id,
  name,
  kind,
  icon,
  is_fixed: false,
  monthly_target: null,
  sort_order: 0,
  archived_at: null,
  ...extra,
});

export const demoCategories: Category[] = [
  cat("salary", "Salary", "income", "nugget", { is_fixed: true }),
  cat("side", "Side gig", "income", "stardust"),
  cat("save", "Save", "saving", "amulet-coin", { monthly_target: 8000, is_fixed: true }),
  cat("rent", "Rent", "expense", "secret-key", { is_fixed: true }),
  cat("internet", "Internet", "expense", "pal-pad", { is_fixed: true }),
  cat("power", "Electricity", "expense", "thunder-stone", { is_fixed: true }),
  cat("food", "Food", "expense", "oran-berry"),
  cat("shopping", "Shopping", "expense", "poke-ball"),
  cat("transport", "Transport", "expense", "bicycle", { monthly_target: 3000 }),
  cat("games", "Games", "expense", "poke-toy"),
  cat("subs", "Subscriptions", "expense", "vs-seeker", { is_fixed: true }),
];

// [category, amount, day of month, note]
const monthPlan: [string, number, number, string | null][] = [
  ["salary", 48000, 1, null],
  ["side", 6500, 5, "Sprite commission"],
  ["save", 8000, 1, null],
  ["rent", 14000, 1, null],
  ["internet", 1500, 2, null],
  ["power", 2100, 3, null],
  ["food", 3200, 4, "Groceries"],
  ["shopping", 2450, 6, "Keyboard switches"],
  ["food", 980, 8, "Ramen night"],
  ["transport", 640, 5, "Train card"],
  ["transport", 380, 9, "Ride home"],
  ["subs", 549, 7, "Music"],
  ["games", 1290, 10, "New cartridge"],
  ["food", 1450, 12, "Groceries"],
  ["food", 420, 14, "Coffee beans"],
  ["transport", 300, 15, null],
];

/**
 * What you have changed in demo mode, kept in a cookie so the app can be tried
 * for real before Supabase is connected: entries added, and ids of entries removed.
 */
export type DemoEdits = {
  added: { id: string; category_id: string; amount: number; occurred_on: string; note: string | null }[];
  removed: string[];
};
export const NO_EDITS: DemoEdits = { added: [], removed: [] };
/** A cookie holds about 4 KB, so the demo keeps the most recent entries only. */
export const DEMO_LIMIT = 40;

export function demoTransactions(edits: DemoEdits = NO_EDITS): Transaction[] {
  const thisMonth = today().slice(0, 7);
  const out: Transaction[] = [];
  for (const offset of [0, -1, -2]) {
    const month = shiftMonth(thisMonth, offset);
    monthPlan.forEach(([category_id, amount, day, note], i) => {
      const category = demoCategories.find((c) => c.id === category_id)!;
      out.push({
        id: `${month}-${i}`,
        category_id,
        amount: amount + offset * 150,
        occurred_on: `${month}-${String(day).padStart(2, "0")}`,
        note,
        category,
      });
    });
  }
  for (const entry of edits.added) {
    const category = demoCategories.find((c) => c.id === entry.category_id);
    if (category) out.push({ ...entry, category });
  }
  return out
    .filter((t) => !edits.removed.includes(t.id))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id));
}

export function demoTotals(transactions: Transaction[]): MonthTotal[] {
  const map = new Map<string, MonthTotal>();
  for (const t of transactions) {
    const month = `${t.occurred_on.slice(0, 7)}-01`;
    const key = `${month}|${t.category_id}`;
    const row = map.get(key) ?? { month, category_id: t.category_id, kind: t.category.kind, total: 0, entries: 0 };
    row.total += t.amount;
    row.entries += 1;
    map.set(key, row);
  }
  return [...map.values()];
}
