// Reading a bank or e-wallet statement and working out what to log from it.
// Pure functions: the server action in actions.ts does the saving.
import type { Account, Category, Transaction, Transfer } from "./types";

/** One line of a statement. */
export type StatementLine = {
  /** Where it sits in the file, counting from 1. */
  line: number;
  occurred_on: string; // YYYY-MM-DD
  description: string;
  /** Above zero is money in; below zero is money out. */
  amount: number;
  /** The running balance printed on the line, when the file has one. */
  balance: number | null;
};

export type Statement = {
  lines: StatementLine[];
  skipped: { line: number; why: string }[];
  /** The balance after the latest line, and that line's date. Null when the file has no balance column. */
  closing: { balance: number; on: string } | null;
  /** What the account held before the earliest line. Null when the file has no balance column. */
  opening: number | null;
  error?: string;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const centavos = (n: number) => Math.round(n * 100);

/**
 * A date as banks write it: 2026-11-20, 11/20/2026 (month first, unless the first
 * number can only be a day, or `dayFirst` says the file writes them that way),
 * 20 Nov 2026 or Nov 20, 2026, with or without a time after it. Null if it is not a real date.
 */
export function readDay(text: string, dayFirst = false): string | null {
  const t = text.trim();
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let y = 0;
  let m = 0;
  let d = 0;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(t);
  const numbers = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/.exec(t);
  const dayThenMonth = /^(\d{1,2})[- ]([A-Za-z]{3,9})[-, ]+(\d{4}|\d{2})(?!\d)/.exec(t);
  const monthFirst = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})(?!\d)/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (numbers) {
    const [a, b] = [Number(numbers[1]), Number(numbers[2])];
    [m, d] = dayFirst || (a > 12 && b <= 12) ? [b, a] : [a, b];
    y = year(numbers[3]);
  } else if (dayThenMonth) [y, m, d] = [year(dayThenMonth[3]), MONTHS.indexOf(dayThenMonth[2].slice(0, 3).toLowerCase()) + 1, Number(dayThenMonth[1])];
  else if (monthFirst) [y, m, d] = [Number(monthFirst[3]), MONTHS.indexOf(monthFirst[1].slice(0, 3).toLowerCase()) + 1, Number(monthFirst[2])];

  const date = new Date(Date.UTC(y, m - 1, d));
  if (!y || m < 1 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** An amount as a statement prints it: "1,250.50", "(150.00)", "-50", "PHP 75.25", "500.00 DR". */
function readMoney(text: string): number | null {
  let t = text.trim().toUpperCase();
  if (!t) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) [sign, t] = [-1, t.slice(1, -1)];
  if (/\bDR$/.test(t)) sign = -1;
  t = t.replace(/\b(DR|CR)$/, "").replace(/PHP|[₱P\s,]/g, "");
  if (/^-|-$/.test(t)) sign = -sign;
  t = t.replace(/^[+-]|-$/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return (sign * centavos(Number(t))) / 100;
}

type Columns = { date: number; description: number; debit: number; credit: number; amount: number; type: number; balance: number };

/** Which column is which, going by the names a row gives them. Null if the row is not a header. */
function readHeader(row: string[]): Columns | null {
  const names = row.map((cell) => cell.trim().toLowerCase());
  const find = (test: (name: string) => boolean) => names.findIndex(test);
  const has = (...words: string[]) => (name: string) => words.some((w) => name.includes(w));
  const out = has("debit", "withdraw", "money out", "paid out");
  const into = has("credit", "deposit", "money in", "paid in");
  const columns: Columns = {
    date: find(has("date")),
    description: find(has("description", "detail", "particular", "remark", "narrat", "memo")),
    debit: find((n) => out(n) && !into(n)),
    credit: find((n) => into(n) && !out(n)),
    amount: find((n) => n.includes("amount") && !out(n) && !into(n)),
    type: find((n) => n === "type" || n.includes("dr/cr") || (out(n) && into(n))),
    balance: find(has("balance")),
  };
  const hasAmount = columns.amount >= 0 || columns.debit >= 0 || columns.credit >= 0;
  return columns.date >= 0 && hasAmount ? columns : null;
}

/**
 * Read the rows of a statement saved as CSV. The row that names the columns can sit
 * under a few lines of account details. Money out and money in may be two columns,
 * or one signed column, or one column with a debit or credit column beside it.
 */
export function readStatement(rows: string[][]): Statement {
  const statement: Statement = { lines: [], skipped: [], closing: null, opening: null };
  const headerAt = rows.slice(0, 40).findIndex((row) => readHeader(row));
  if (headerAt < 0) {
    return { ...statement, error: "I could not find a row naming the columns. It needs a date column and an amount, or debit and credit." };
  }
  const col = readHeader(rows[headerAt])!;
  const cellOf = (row: string[], at: number) => (at >= 0 ? (row[at] ?? "").trim() : "");

  rows.slice(headerAt + 1).forEach((row, i) => {
    const line = headerAt + i + 2;
    const dateText = cellOf(row, col.date);
    if (!dateText) return; // totals and footers
    const occurred_on = readDay(dateText);
    if (!occurred_on) return statement.skipped.push({ line, why: "the date is not one I can read" });

    let amount: number | null;
    if (col.debit >= 0 || col.credit >= 0) {
      const [out, into] = [readMoney(cellOf(row, col.debit)), readMoney(cellOf(row, col.credit))];
      amount = out === null && into === null ? null : Math.abs(into ?? 0) - Math.abs(out ?? 0);
    } else {
      amount = readMoney(cellOf(row, col.amount));
      const type = cellOf(row, col.type).toLowerCase();
      if (amount !== null && /^(d|w|out)/.test(type)) amount = -Math.abs(amount);
      if (amount !== null && /^(c|in)/.test(type)) amount = Math.abs(amount);
    }
    if (!amount) return statement.skipped.push({ line, why: "there is no amount" });

    statement.lines.push({
      line,
      occurred_on,
      description: cellOf(row, col.description).replace(/\s+/g, " "),
      amount,
      balance: readMoney(cellOf(row, col.balance)),
    });
  });

  return { ...statement, ...balanceEnds(statement.lines) };
}

/** The balance after the latest line and before the earliest. The file may run oldest first or newest first. */
function balanceEnds(lines: StatementLine[]): Pick<Statement, "closing" | "opening"> {
  const withBalance = lines.filter((l) => l.balance !== null);
  if (withBalance.length === 0) return { closing: null, opening: null };
  // Each balance is the one before it plus the line's amount, read in the right direction.
  let forward = 0;
  let backward = 0;
  for (let i = 1; i < withBalance.length; i++) {
    const [a, b] = [withBalance[i - 1], withBalance[i]];
    if (centavos(a.balance! + b.amount) === centavos(b.balance!)) forward++;
    if (centavos(b.balance! + a.amount) === centavos(a.balance!)) backward++;
  }
  const first = withBalance[0];
  const last = withBalance[withBalance.length - 1];
  const newestFirst = forward === backward ? first.occurred_on > last.occurred_on : backward > forward;
  const [latest, earliest] = newestFirst ? [first, last] : [last, first];
  return {
    closing: { balance: latest.balance!, on: latest.occurred_on },
    opening: centavos(earliest.balance! - earliest.amount) / 100,
  };
}

// ---- PDF ---------------------------------------------------------------------------

/** A piece of text on a PDF page: where it starts, how wide it is, what it says. */
export type PdfCell = { x: number; w: number; s: string };
/** The text that shares a baseline. `y` grows up the page, as in a PDF. */
export type PdfRow = { y: number; cells: PdfCell[] };

/** A run of text as a PDF library reports it: `transform[4]` and `[5]` are where it starts. */
export type PdfItem = { str: string; width: number; transform: number[] };

/** Gather the text of one page into rows, top of the page first, by the baseline each piece sits on. */
export function groupRows(items: PdfItem[]): PdfRow[] {
  const rows: PdfRow[] = [];
  const placed = items.filter((item) => item.str.trim()).sort((a, b) => b.transform[5] - a.transform[5]);
  for (const item of placed) {
    const y = item.transform[5];
    const cell = { x: Math.round(item.transform[4]), w: Math.round(item.width), s: item.str };
    const row = rows[rows.length - 1];
    if (row && row.y - y <= 2.5) row.cells.push(cell);
    else rows.push({ y, cells: [cell] });
  }
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * In a PDF that stores each word on its own, words this close together are one cell;
 * columns are further apart. A PDF that stores whole phrases is left as it is.
 */
const WORD_GAP = 6;
/** A row this far below the one before it belongs to something else. */
const ROW_GAP = 16;
/** An amount sits within this distance of the edge or middle of its column heading. */
const COLUMN_REACH = 45;

const MONTH_NAMES = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
/** Some PDFs put a space after every glyph ("B a l a n c e"). */
const SPACED_OUT = /^(\S )+\S$/;
const isMoney = (text: string) => /^[-+(]?(PHP ?|₱ ?)?[\d,]*\d\.\d{2}\)?-?( ?(DR|CR))?$/i.test(text);
const isTime = (text: string) => /^\d{1,2}:\d{2}(:\d{2})?( ?[AP]M)?$/i.test(text);

/** Rows from the top of the page down, each with its words joined into cells. */
function tidyPage(page: PdfRow[], spacedOut: boolean, wordGap: number): PdfRow[] {
  const closeUp = (text: string) => (spacedOut && SPACED_OUT.test(text.trim()) ? text.replace(/ /g, "") : text.trim());
  return [...page]
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const cells: PdfCell[] = [];
      for (const raw of [...row.cells].sort((a, b) => a.x - b.x)) {
        const s = closeUp(raw.s);
        if (!s) continue;
        const last = cells[cells.length - 1];
        if (last && raw.x - (last.x + last.w) <= wordGap) {
          last.s = `${last.s} ${s}`;
          last.w = Math.max(last.w, raw.x + raw.w - last.x);
        } else cells.push({ x: raw.x, w: raw.w, s });
      }
      return { y: row.y, cells };
    })
    .filter((row) => row.cells.length > 0);
}

/** How far a cell is from sitting under a heading: by left edge, right edge or middle, whichever is closest. */
const offBy = (cell: PdfCell, heading: PdfCell) =>
  Math.min(
    Math.abs(cell.x - heading.x),
    Math.abs(cell.x + cell.w - (heading.x + heading.w)),
    Math.abs(cell.x + cell.w / 2 - (heading.x + heading.w / 2)),
  );
const overlaps = (a: PdfCell, b: PdfCell) => a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * Read a statement from the text of a PDF, laid out as it is on the page. The table
 * is found by the row that names its columns. A transaction starts at a row with a
 * date and may run over the next rows; amounts are told apart by the heading they
 * sit under. Dates with no year take it from the statement period printed above.
 */
export function readPdfStatement(pages: PdfRow[][]): Statement {
  const statement: Statement = { lines: [], skipped: [], closing: null, opening: null };
  // Spaced-out glyphs are closed up only when the whole file is written that way.
  const longer = pages.flatMap((page) => page.flatMap((row) => row.cells.map((c) => c.s.trim()))).filter((text) => text.length >= 5);
  const spacedOut = longer.length > 0 && longer.filter((text) => SPACED_OUT.test(text)).length > longer.length / 2;
  // Words are joined into cells only when the file stores them one by one.
  const all = pages.flatMap((page) => page.flatMap((row) => row.cells.map((c) => c.s.trim()))).filter(Boolean);
  const phrases = all.filter((text) => !SPACED_OUT.test(text) && text.includes(" ")).length;
  const wordGap = spacedOut || phrases < all.length / 20 ? WORD_GAP : 0;
  const tidy = pages.map((page) => tidyPage(page, spacedOut, wordGap));
  const headerOf = (row: PdfRow) => readHeader(row.cells.map((c) => c.s));
  const firstPage = tidy.findIndex((page) => page.some(headerOf));
  if (firstPage < 0) {
    return { ...statement, error: "I could not find the row naming the columns: a date, and an amount or debit and credit." };
  }

  // The year for dates that have none: the end of the period printed before the table.
  const dated = new RegExp(`(${MONTH_NAMES})[a-z]*\\.? ?(\\d{1,2}), ?(\\d{4})`, "gi");
  const headerRow = tidy[firstPage].findIndex(headerOf);
  const preamble = [...tidy.slice(0, firstPage).flat(), ...tidy[firstPage].slice(0, headerRow)];
  const periods = preamble.flatMap((row) => [...row.cells.map((c) => c.s).join(" ").matchAll(dated)]);
  const end = periods.at(-1);
  const periodEnd = end ? { month: MONTHS.indexOf(end[1].toLowerCase()) + 1, day: Number(end[2]), year: Number(end[3]) } : null;
  const short = new RegExp(`^(${MONTH_NAMES})[a-z]*\\.? (\\d{1,2})$`, "i");
  // A date at the start of a row's first cell: "Nov 30", "11/30/2026", "30-Nov-26". Text may follow it.
  const leadingDate = new RegExp(
    `^(?:(?:${MONTH_NAMES})[a-z]*\\.? \\d{1,2}(?:,? \\d{4})?|\\d{1,4}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}[- ][A-Za-z]{3,9}[- ,]+\\d{2,4})(?=\\s|$)`,
    "i",
  );

  // Blocks: a row that starts with a date, and the rows that follow close under it.
  type Block = { date: string; rows: PdfRow[]; headings: PdfCell[] };
  const blocks: Block[] = [];
  let columns: Columns | null = null;
  let headings: PdfCell[] = [];
  for (const page of tidy.slice(firstPage)) {
    const at = page.findIndex(headerOf);
    if (at >= 0) {
      columns = headerOf(page[at])!;
      headings = page[at].cells;
    }
    let open: Block | null = null;
    const body = page.slice(at + 1);
    const dateOf = (row: PdfRow | undefined) =>
      row && Math.abs(row.cells[0].x - headings[columns!.date].x) <= 20 ? leadingDate.exec(row.cells[0].s)?.[0] : undefined;
    const hasMoney = (row: PdfRow) => row.cells.some((c) => isMoney(c.s));
    // A long description can start on the line above its dated row: closer to it than to the row
    // before. Sometimes the amounts sit up there with it, and the dated row has none of its own.
    const startsNext = (i: number) => {
      const [before, row, next] = [body[i - 1], body[i], body[i + 1]];
      if (dateOf(row) || !dateOf(next) || (hasMoney(row) && hasMoney(next))) return false;
      const below = row.y - next.y;
      return below <= ROW_GAP / 2 && (!before || below < before.y - row.y);
    };
    let above: PdfRow[] = [];
    for (const [i, row] of body.entries()) {
      const lead = row.cells[0];
      const date = dateOf(row);
      if (date) {
        // Anything after the date in the same cell (a time, the start of the description) stays in the row.
        const after = lead.s.slice(date.length).trim();
        const rest = after ? [{ ...lead, s: after }] : [];
        open = { date, rows: [...above, { y: row.y, cells: [...rest, ...row.cells.slice(1)] }], headings };
        above = [];
        blocks.push(open);
      } else if (startsNext(i)) {
        above = [row];
      } else if (open) {
        const moneyBefore = open.rows.some(hasMoney);
        const close = open.rows[open.rows.length - 1].y - row.y <= ROW_GAP;
        if (close && !(moneyBefore && hasMoney(row))) open.rows.push(row);
        else open = null;
      }
    }
  }
  const col = columns!;

  // Numeric dates: once one can only be day first, they all are.
  const dayFirst = blocks.some((b) => {
    const numbers = /^(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}/.exec(b.date);
    return numbers !== null && Number(numbers[1]) > 12 && Number(numbers[2]) <= 12;
  });
  let noYear = false;
  const dayOf = (text: string): string | null => {
    const yearless = short.exec(text);
    if (!yearless) return readDay(text, dayFirst);
    if (!periodEnd) {
      noYear = true;
      return null;
    }
    const [month, day] = [MONTHS.indexOf(yearless[1].toLowerCase()) + 1, Number(yearless[2])];
    const later = month > periodEnd.month || (month === periodEnd.month && day > periodEnd.day);
    return readDay(`${later ? periodEnd.year - 1 : periodEnd.year}-${month}-${day}`);
  };

  blocks.forEach((block, i) => {
    const line = i + 1;
    const occurred_on = dayOf(block.date);
    if (!occurred_on) return statement.skipped.push({ line, why: "the date is not one I can read" });
    const heading = (at: number) => (at >= 0 ? block.headings[at] : undefined);
    const money = [heading(col.debit), heading(col.credit), heading(col.amount), heading(col.balance)];
    const aside = block.headings.filter((h) => /\bref|cheque|check|branch|code|trace|seq/i.test(h.s));
    const words: string[] = [];
    let amount: number | null = null;
    let balance: number | null = null;
    for (const cell of block.rows.flatMap((r) => r.cells)) {
      if (aside.some((h) => overlaps(cell, h)) || isTime(cell.s) || /^(null|-+|n\/a)$/i.test(cell.s)) continue;
      const under = isMoney(cell.s)
        ? money.reduce<PdfCell | undefined>((best, h) => (h && offBy(cell, h) <= COLUMN_REACH && (!best || offBy(cell, h) < offBy(cell, best)) ? h : best), undefined)
        : undefined;
      if (!under) words.push(cell.s);
      else if (under === heading(col.balance)) balance = readMoney(cell.s);
      else if (under === heading(col.debit)) amount = -Math.abs(readMoney(cell.s) ?? 0);
      else if (under === heading(col.credit)) amount = Math.abs(readMoney(cell.s) ?? 0);
      else amount = readMoney(cell.s);
    }
    if (!amount) return statement.skipped.push({ line, why: "there is no amount" });
    statement.lines.push({ line, occurred_on, description: words.join(" ").replace(/\s+/g, " "), amount, balance });
  });

  if (noYear && statement.lines.length === 0) {
    return { ...statement, error: "The dates have no year, and I could not find the statement period that gives it." };
  }
  return { ...statement, ...balanceEnds(statement.lines) };
}

// ---- Planning --------------------------------------------------------------------

/** What a line would be logged as: an entry in a category, or a transfer with another account. */
export type Choice = { type: "category"; id: string } | { type: "account"; id: string };

export type PlannedLine = StatementLine & {
  /** Something with this amount is already logged on the account around this date. */
  logged: boolean;
  suggestion: Choice | null;
};

type KnownEntry = Pick<Transaction, "amount" | "occurred_on" | "note" | "account_id" | "to_account_id" | "category_id"> & {
  category: Pick<Category, "kind">;
};
type KnownTransfer = Pick<Transfer, "from_account" | "to_account" | "amount" | "occurred_on">;

export type Known = {
  entries: KnownEntry[];
  transfers: KnownTransfer[];
  accounts: Pick<Account, "id" | "name" | "kind">[];
  categories: Pick<Category, "id" | "kind">[];
};

/** A bank can post a card payment a few days after you made it. */
const POSTING_DAYS = 3;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** What is already logged on one account, as signed amounts: above zero came in, below zero went out. */
function movementsOn(accountId: string, entries: KnownEntry[], transfers: KnownTransfer[]) {
  const moves: { occurred_on: string; amount: number; used: boolean }[] = [];
  const add = (occurred_on: string, amount: number) => moves.push({ occurred_on, amount, used: false });
  for (const e of entries) {
    const { kind } = e.category;
    if (e.account_id === accountId) {
      if (kind === "income") add(e.occurred_on, e.amount);
      else if (kind === "expense" || e.to_account_id) add(e.occurred_on, -e.amount);
    }
    if (kind === "saving" && e.to_account_id === accountId) add(e.occurred_on, e.amount);
  }
  for (const t of transfers) {
    if (t.from_account === accountId) add(t.occurred_on, -t.amount);
    if (t.to_account === accountId) add(t.occurred_on, t.amount);
  }
  return moves;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tidy = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Compare a statement with what is already logged on its account, and suggest what
 * each new line is: a transfer when it names another of your accounts (or is an ATM
 * withdrawal and you keep a cash account), else the category last used with the same note.
 */
export function planStatement(lines: StatementLine[], accountId: string, known: Known): PlannedLine[] {
  // Already logged: the same day first, then within a few days either way.
  const moves = movementsOn(accountId, known.entries, known.transfers);
  const logged = lines.map(() => false);
  for (const reach of [0, POSTING_DAYS]) {
    lines.forEach((line, i) => {
      if (logged[i]) return;
      const match = moves.find(
        (m) =>
          !m.used &&
          centavos(m.amount) === centavos(line.amount) &&
          Math.abs(dayNumber(m.occurred_on) - dayNumber(line.occurred_on)) <= reach,
      );
      if (match) {
        match.used = true;
        logged[i] = true;
      }
    });
  }

  const others = known.accounts
    .filter((a) => a.id !== accountId && a.name.trim().length >= 3)
    .map((a) => ({ id: a.id, named: new RegExp(`(^|[^a-z0-9])${escapeRegex(tidy(a.name))}($|[^a-z0-9])`) }));
  const cash = known.accounts.find((a) => a.kind === "cash" && a.id !== accountId);
  const kindOf = new Map(known.categories.map((c) => [c.id, c.kind]));
  // Notes used before, most recent first.
  const notes = known.entries
    .filter((e) => e.note && tidy(e.note).length >= 4 && kindOf.has(e.category_id))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
    .map((e) => ({ note: tidy(e.note!), category_id: e.category_id }));

  const suggest = (line: StatementLine): Choice | null => {
    const text = tidy(line.description);
    const other = others.find((a) => a.named.test(text));
    if (other) return { type: "account", id: other.id };
    if (cash && line.amount < 0 && /\batm\b|\bwithdraw/.test(text)) return { type: "account", id: cash.id };
    const fits = (categoryId: string) => (kindOf.get(categoryId) === "income") === line.amount > 0;
    const hint = notes.find((n) => fits(n.category_id) && (text.includes(n.note) || (text.length >= 4 && n.note.includes(text))));
    return hint ? { type: "category", id: hint.category_id } : null;
  };

  return lines.map((line, i) => ({ ...line, logged: logged[i], suggestion: suggest(line) }));
}

/** How a choice travels in a form field: "c:<category id>", "a:<account id>", or empty to leave the line for later. */
export const choiceValue = (choice: Choice | null) => (choice ? `${choice.type === "category" ? "c" : "a"}:${choice.id}` : "");

export type Decided = {
  entries: { category_id: string; amount: number; occurred_on: string; note: string | null; account_id: string }[];
  transfers: { from_account: string; to_account: string; amount: number; occurred_on: string; note: string | null }[];
  /** Lines with no choice: nothing is saved for them, so they show up again next time. */
  left: number;
  problems: string[];
};

/** Turn the choice made for each line into the entries and transfers to save. */
export function decide(
  lines: PlannedLine[],
  choices: (string | undefined)[],
  accountId: string,
  categories: Pick<Category, "id" | "kind">[],
  accounts: Pick<Account, "id">[],
): Decided {
  const decided: Decided = { entries: [], transfers: [], left: 0, problems: [] };
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  lines.forEach((line, i) => {
    const choice = choices[i] ?? "";
    const id = choice.slice(2);
    const amount = Math.abs(line.amount);
    const note = line.description.slice(0, 200) || null;
    if (choice.startsWith("c:")) {
      const kind = kindOf.get(id);
      if (!kind) return decided.problems.push(`Line ${line.line}: that category is gone.`);
      if ((kind === "income") !== line.amount > 0) {
        return decided.problems.push(
          `Line ${line.line}: money ${line.amount > 0 ? "coming in needs an income category" : "going out needs a spending or savings category"}.`,
        );
      }
      decided.entries.push({ category_id: id, amount, occurred_on: line.occurred_on, note, account_id: accountId });
    } else if (choice.startsWith("a:")) {
      if (id === accountId || !accounts.some((a) => a.id === id)) {
        return decided.problems.push(`Line ${line.line}: pick another of your accounts for a transfer.`);
      }
      const [from_account, to_account] = line.amount < 0 ? [accountId, id] : [id, accountId];
      decided.transfers.push({ from_account, to_account, amount, occurred_on: line.occurred_on, note });
    } else decided.left++;
  });
  return decided;
}
