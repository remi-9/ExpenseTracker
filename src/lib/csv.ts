// Reading and writing CSV, and turning an imported file into entries.
// Pure functions: the server action in actions.ts does the saving.
import { parseAmount } from "./format";
import type { Kind } from "./types";

/** Rows of cells. Quoted cells may hold commas, line breaks and doubled quotes. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") endRow();
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

export type ImportEntry = {
  occurred_on: string;
  /** The category's name as it is, or will be, stored. */
  category: string;
  amount: number;
  note: string | null;
  account: string | null;
};

export type ImportPlan = {
  entries: ImportEntry[];
  newCategories: { name: string; kind: Kind }[];
  newAccounts: string[];
  skipped: { line: number; why: string }[];
  error?: string;
};

/** YYYY-MM-DD, or MM/DD/YYYY as spreadsheets here write it. Null if it is not a real date. */
function readDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]].map(Number) : us ? [us[3], us[1], us[2]].map(Number) : [0, 0, 0];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const readKind = (text: string): Kind => {
  const t = text.trim().toLowerCase();
  return t.startsWith("inc") || t.startsWith("earn") ? "income" : t.startsWith("sav") ? "saving" : "expense";
};

/**
 * Work out what an import would do, without doing it. The first row names the
 * columns: date, category and amount are needed; note, account and kind are optional.
 * Categories and accounts are matched by name; ones that do not exist are listed to be created.
 */
export function planImport(
  rows: string[][],
  categories: { name: string; kind: Kind }[],
  accounts: { name: string }[],
): ImportPlan {
  const plan: ImportPlan = { entries: [], newCategories: [], newAccounts: [], skipped: [] };
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [date, category, amount, note, account, kind] = ["date", "category", "amount", "note", "account", "kind"].map(col);
  if (date < 0 || category < 0 || amount < 0) {
    return { ...plan, error: "The first row needs the columns date, category and amount." };
  }

  // Names as they are stored, looked up without regard to case.
  const categoryNames = new Map(categories.map((c) => [c.name.toLowerCase(), c.name]));
  const accountNames = new Map(accounts.map((a) => [a.name.toLowerCase(), a.name]));
  const cellOf = (row: string[], at: number) => (at >= 0 ? (row[at] ?? "").trim() : "");

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const occurred_on = readDate(cellOf(row, date));
    const value = parseAmount(cellOf(row, amount));
    const categoryName = cellOf(row, category);
    if (!occurred_on) return plan.skipped.push({ line, why: "the date is not one I can read" });
    if (!categoryName) return plan.skipped.push({ line, why: "there is no category" });
    if (value === null || value <= 0) return plan.skipped.push({ line, why: "the amount is not a number above zero" });

    if (!categoryNames.has(categoryName.toLowerCase())) {
      categoryNames.set(categoryName.toLowerCase(), categoryName);
      plan.newCategories.push({ name: categoryName, kind: readKind(cellOf(row, kind)) });
    }
    const accountName = cellOf(row, account);
    if (accountName && !accountNames.has(accountName.toLowerCase())) {
      accountNames.set(accountName.toLowerCase(), accountName);
      plan.newAccounts.push(accountName);
    }
    plan.entries.push({
      occurred_on,
      category: categoryNames.get(categoryName.toLowerCase())!,
      amount: value,
      note: cellOf(row, note) || null,
      account: accountName ? accountNames.get(accountName.toLowerCase())! : null,
    });
  });
  return plan;
}
