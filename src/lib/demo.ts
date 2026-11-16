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
  cat("salary", "Salary", "income", "💼"),
  cat("side", "Side gig", "income", "🎮"),
  cat("save", "Save", "saving", "🐷", { monthly_target: 8000 }),
  cat("rent", "Rent", "expense", "🏠", { is_fixed: true }),
  cat("internet", "Internet", "expense", "📡", { is_fixed: true }),
  cat("power", "Electricity", "expense", "⚡", { is_fixed: true }),
  cat("food", "Food", "expense", "🍜"),
  cat("shopping", "Shopping", "expense", "🛒"),
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
];

export function demoTransactions(): Transaction[] {
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
  return out.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
}

export function demoTotals(): MonthTotal[] {
  const map = new Map<string, MonthTotal>();
  for (const t of demoTransactions()) {
    const month = `${t.occurred_on.slice(0, 7)}-01`;
    const key = `${month}|${t.category_id}`;
    const row = map.get(key) ?? { month, category_id: t.category_id, kind: t.category.kind, total: 0, entries: 0 };
    row.total += t.amount;
    row.entries += 1;
    map.set(key, row);
  }
  return [...map.values()];
}
