// Made-up data shown when Supabase isn't connected yet, so the UI can be explored first.
import { shiftMonth, today } from "./format";
import type { Account, Bill, Category, MonthTotal, Transaction, Transfer } from "./types";

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
  monthly_target: null,
  sort_order: 0,
  archived_at: null,
  ...extra,
});

export const demoCategories: Category[] = [
  cat("salary", "Salary", "income", "nugget"),
  cat("side", "Side gig", "income", "stardust"),
  cat("save", "Save", "saving", "amulet-coin", { monthly_target: 8000 }),
  cat("rent", "Rent", "expense", "secret-key"),
  cat("internet", "Internet", "expense", "pal-pad"),
  cat("power", "Electricity", "expense", "thunder-stone"),
  cat("food", "Food", "expense", "oran-berry"),
  cat("shopping", "Shopping", "expense", "poke-ball"),
  cat("transport", "Transport", "expense", "bicycle", { monthly_target: 3000 }),
  cat("games", "Games", "expense", "poke-toy"),
  cat("subs", "Subscriptions", "expense", "vs-seeker"),
];

const account = (id: string, name: string, kind: Account["kind"], icon: string, opening_balance: number, sort_order: number): Account => ({
  id,
  name,
  kind,
  icon,
  opening_balance,
  sort_order,
  archived_at: null,
});

export const demoAccounts: Account[] = [
  account("bank", "Bank", "bank", "pkmn-143", 60000, 0),
  account("wallet", "E-wallet", "ewallet", "pkmn-137", 3000, 1),
  account("cash", "Cash", "cash", "pkmn-52", 9000, 2),
];

const bill = (id: string, name: string, category_id: string, amount: number | null, due_day: number, account_id = "bank"): Bill => ({
  id,
  name,
  category_id,
  account_id,
  amount,
  due_day,
  cadence: "monthly",
  due_month: null,
  archived_at: null,
});

export const demoBills: Bill[] = [
  bill("b-salary", "Salary", "salary", 48000, 1),
  bill("b-save", "Monthly savings", "save", 8000, 1),
  bill("b-rent", "Rent", "rent", 14000, 1),
  bill("b-internet", "Internet", "internet", 1500, 2),
  bill("b-power", "Electricity", "power", null, 18),
  bill("b-subs", "Music subscription", "subs", 549, 27, "wallet"),
];

// [category, amount, day of month, note, account, bill it pays]
const monthPlan: [string, number, number, string | null, string, string?][] = [
  ["salary", 48000, 1, null, "bank", "b-salary"],
  ["side", 6500, 5, "Sprite commission", "wallet"],
  ["save", 8000, 1, null, "bank", "b-save"],
  ["rent", 14000, 1, null, "bank", "b-rent"],
  ["internet", 1500, 2, null, "bank", "b-internet"],
  ["power", 2100, 3, null, "bank", "b-power"],
  ["food", 3200, 4, "Groceries", "bank"],
  ["shopping", 2450, 6, "Keyboard switches", "wallet"],
  ["food", 980, 8, "Ramen night", "cash"],
  ["transport", 640, 5, "Train card", "wallet"],
  ["transport", 380, 9, "Ride home", "cash"],
  ["subs", 549, 7, "Music", "wallet", "b-subs"],
  ["games", 1290, 10, "New cartridge", "wallet"],
  ["food", 1450, 12, "Groceries", "bank"],
  ["food", 420, 14, "Coffee beans", "cash"],
  ["transport", 300, 15, null, "cash"],
];
/** Left unpaid in the current month, so the bills list has something due. */
const UNPAID_NOW = ["b-power", "b-subs"];

type DemoEntry = Omit<Transaction, "category">;

/**
 * What you have changed in demo mode, kept in a cookie so the app can be tried
 * for real before Supabase is connected: entries and transfers added, and ids of entries removed.
 */
export type DemoEdits = {
  added: DemoEntry[];
  removed: string[];
  transfers: Transfer[];
};
export const NO_EDITS: DemoEdits = { added: [], removed: [], transfers: [] };
/** A cookie holds about 4 KB, so the demo keeps the most recent entries and transfers only. */
export const DEMO_LIMIT = 40;
export const DEMO_TRANSFER_LIMIT = 6;

// The cookie is written as compact text rather than JSON, which triples in size once
// a cookie's quotes and braces are URL-encoded. Fields are joined with "~", rows with
// "!" and the three lists with "*": none of those is touched by URL encoding.
const esc = (text: string | null) => (text ?? "").replace(/[%~!*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
const unesc = (text: string) => text.replace(/%([0-9a-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

export function encodeEdits(edits: DemoEdits): string {
  const added = edits.added.map((e) =>
    [e.id, e.category_id, e.amount, e.occurred_on, e.account_id ?? "", e.to_account_id ?? "", e.bill_id ?? "", esc(e.note)].join("~"),
  );
  const transfers = edits.transfers.map((t) => [t.id, t.from_account, t.to_account, t.amount, t.occurred_on, esc(t.note)].join("~"));
  return ["v2", added.join("!"), edits.removed.join("!"), transfers.join("!")].join("*");
}

export function decodeEdits(raw: string | undefined): DemoEdits {
  const [version, added = "", removed = "", transfers = ""] = (raw ?? "").split("*");
  if (version !== "v2") return NO_EDITS;
  const rows = (text: string) => (text ? text.split("!").map((row) => row.split("~")) : []);
  return {
    added: rows(added).map(([id, category_id, amount, occurred_on, account_id, to_account_id, bill_id, note]) => ({
      id,
      category_id,
      amount: Number(amount),
      occurred_on,
      note: note ? unesc(note) : null,
      account_id: account_id || null,
      to_account_id: to_account_id || null,
      bill_id: bill_id || null,
    })),
    removed: removed ? removed.split("!") : [],
    transfers: rows(transfers).map(([id, from_account, to_account, amount, occurred_on, note]) => ({
      id,
      from_account,
      to_account,
      amount: Number(amount),
      occurred_on,
      note: note ? unesc(note) : null,
    })),
  };
}

export function demoTransactions(edits: DemoEdits = NO_EDITS): Transaction[] {
  const thisMonth = today().slice(0, 7);
  const out: Transaction[] = [];
  for (const offset of [0, -1, -2]) {
    const month = shiftMonth(thisMonth, offset);
    monthPlan.forEach(([category_id, amount, day, note, account_id, bill_id], i) => {
      if (offset === 0 && bill_id && UNPAID_NOW.includes(bill_id)) return;
      const category = demoCategories.find((c) => c.id === category_id)!;
      out.push({
        id: `${month}-${i}`,
        category_id,
        amount: amount + offset * 150,
        occurred_on: `${month}-${String(day).padStart(2, "0")}`,
        note,
        account_id,
        to_account_id: null,
        bill_id: bill_id ?? null,
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
