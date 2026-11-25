// All game rules live here as pure functions over the month_totals rows.
// Nothing about the game is stored in the database, so rules can change freely.
import { shiftMonth } from "./format";
import type { BillStatus } from "./money";
import type { Category, Kind, MonthTotal } from "./types";

export type MonthSummary = {
  income: number;
  expense: number;
  saving: number;
  /** income − expense − saving: what the spreadsheet called "Remaining from Salary". */
  remaining: number;
  /**
   * Everything you hold: opening balances + all income − all expenses up to and
   * including this month. Savings and transfers only move money between accounts.
   */
  balance: number;
};

/** `opening` is the total of your accounts' opening balances (see openingTotal in money.ts). */
export function summarizeMonth(totals: MonthTotal[], month: string, opening = 0): MonthSummary {
  const key = `${month}-01`;
  const s = { income: 0, expense: 0, saving: 0, remaining: 0, balance: opening };
  const next = `${shiftMonth(month, 1)}-01`;
  for (const t of totals) {
    if (t.month === key) s[t.kind] += t.total;
    if (t.month <= key) {
      if (t.kind === "income") s.balance += t.total;
      if (t.kind === "expense") s.balance -= t.total;
    }
    // Pay brought forward from this month is already in hand, though it counts as next month's income.
    else if (t.month === next && t.early) s.balance += t.early;
  }
  s.remaining = s.income - s.expense - s.saving;
  return s;
}

// ---- Pay that lands early ---------------------------------------------------
// Pay often arrives in the last days of a month and is meant for the month after.

/** Income dated on or after this day of the month counts for the next month. */
export const LATE_PAY_DAY = 25;

/** The month (YYYY-MM) an income entry counts for, given the date it landed. */
export const payMonth = (date: string) =>
  Number(date.slice(8, 10)) >= LATE_PAY_DAY ? shiftMonth(date.slice(0, 7), 1) : date.slice(0, 7);

/**
 * Month totals with late income moved to the month it is meant for. The amount moves;
 * the entry still counts in the month it was logged, and `early` records what was
 * brought forward so that "everything you hold" can go by the day the money landed.
 */
export function withLatePay(
  totals: MonthTotal[],
  income: { occurred_on: string; category_id: string; amount: number }[],
): MonthTotal[] {
  const rows = totals.map((t) => ({ ...t }));
  const row = (month: string, category_id: string) => {
    let found = rows.find((t) => t.month === month && t.category_id === category_id);
    if (!found) rows.push((found = { month, category_id, kind: "income", total: 0, entries: 0 }));
    return found;
  };
  for (const e of income) {
    const landed = e.occurred_on.slice(0, 7);
    const counts = payMonth(e.occurred_on);
    if (counts === landed) continue;
    row(`${landed}-01`, e.category_id).total -= e.amount;
    const to = row(`${counts}-01`, e.category_id);
    to.total += e.amount;
    to.early = (to.early ?? 0) + e.amount;
  }
  return rows;
}

/** Hi-score: the finished month (before `current`) that ended with the most left over. */
export function bestMonth(totals: MonthTotal[], current: string): { month: string; left: number } | null {
  const best = months(totals)
    .filter((m) => m.month < current)
    .map((m) => ({ month: m.month, left: m.remaining }))
    .sort((a, b) => b.left - a.left)[0];
  return best ?? null;
}

// ---- XP and levels ---------------------------------------------------------

export const XP_PER_ENTRY = 10; // logging anything
export const PESOS_PER_SAVING_XP = 100; // 1 XP per ₱100 saved

const RANKS = ["Rookie Trainer", "Bug Catcher", "Ace Trainer", "Gym Leader", "Elite Four", "Champion"];

/** Total XP needed to reach a level: 0, 100, 300, 600, 1000… */
const xpForLevel = (level: number) => 50 * level * (level - 1);

export type Player = {
  xp: number;
  level: number;
  rank: string;
  xpIntoLevel: number;
  xpForNext: number;
  entries: number;
  saved: number;
};

export function getPlayer(totals: MonthTotal[]): Player {
  let entries = 0;
  let saved = 0;
  for (const t of totals) {
    entries += t.entries;
    if (t.kind === "saving") saved += t.total;
  }
  return playerAt(entries * XP_PER_ENTRY + Math.floor(saved / PESOS_PER_SAVING_XP), entries, saved);
}

function playerAt(xp: number, entries: number, saved: number): Player {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return {
    xp,
    level,
    rank: RANKS[Math.min(level - 1, RANKS.length - 1)],
    xpIntoLevel: xp - xpForLevel(level),
    xpForNext: xpForLevel(level + 1) - xpForLevel(level),
    entries,
    saved,
  };
}

/** XP one entry is worth. */
export const xpFor = (kind: Kind, amount: number) =>
  XP_PER_ENTRY + (kind === "saving" ? Math.floor(amount / PESOS_PER_SAVING_XP) : 0);

/** The same player with XP added (or removed, to see where they stood before an entry). */
export const withXp = (p: Player, delta: number) => playerAt(Math.max(0, p.xp + delta), p.entries, p.saved);

/** A month summary with one entry added (negative amount removes it). */
export function withEntry(s: MonthSummary, kind: Kind, amount: number): MonthSummary {
  const next = { ...s, [kind]: s[kind] + amount };
  next.remaining = next.income - next.expense - next.saving;
  if (kind === "income") next.balance += amount;
  if (kind === "expense") next.balance -= amount;
  return next;
}

// ---- Quests ------------------------------------------------------------------
// Any category with a monthly target is a quest: a savings goal to reach,
// or a spending budget to stay under.

export type Quest = { category: Category; done: number; target: number; saving: boolean; complete: boolean };

export function getQuests(categories: Category[], totals: MonthTotal[], month: string): Quest[] {
  const rows = totals.filter((t) => t.month === `${month}-01`);
  return categories
    .filter((c) => c.monthly_target != null && c.kind !== "income" && !c.archived_at)
    .map((category) => {
      const done = rows.find((t) => t.category_id === category.id)?.total ?? 0;
      const target = category.monthly_target!;
      const saving = category.kind === "saving";
      return { category, done, target, saving, complete: saving ? done >= target : done <= target };
    });
}

// ---- Monthly challenges --------------------------------------------------------
// Quests every month brings, beside the category ones: pay the bills on time, keep
// logging, and spend less than last month. They do not count towards a shiny month.

/** Days with at least one entry that finish the logging quest. */
export const LOG_DAYS = 15;

export type Challenge = {
  id: "bills" | "days" | "less";
  title: string;
  done: number;
  target: number;
  /** done and target are money (else counts). */
  money: boolean;
  /** Under the target is good (spending), rather than reaching it. */
  lowerIsBetter: boolean;
  complete: boolean;
  /** A word on how it stands, when the figures alone do not say it. */
  status?: string;
};

export function getChallenges({
  bills,
  loggedDays,
  spent,
  lastSpent,
  finished,
}: {
  /** The month's bills and whether each was paid on time (billsFor in money.ts). */
  bills: BillStatus[];
  /** Different days with an entry this month. */
  loggedDays: number;
  /** Spending this month and the month before. */
  spent: number;
  lastSpent: number;
  /** The month is over, so "on track" can become "complete". */
  finished: boolean;
}): Challenge[] {
  const challenges: Challenge[] = [];
  if (bills.length > 0) {
    const onTime = bills.filter((b) => b.state === "paid" && b.onTime).length;
    challenges.push({
      id: "bills",
      title: "Pay every bill on time",
      done: onTime,
      target: bills.length,
      money: false,
      lowerIsBetter: false,
      complete: onTime === bills.length,
    });
  }
  challenges.push({
    id: "days",
    title: `Log on ${LOG_DAYS} different days`,
    done: Math.min(loggedDays, LOG_DAYS),
    target: LOG_DAYS,
    money: false,
    lowerIsBetter: false,
    complete: loggedDays >= LOG_DAYS,
  });
  if (lastSpent > 0) {
    const under = spent < lastSpent;
    challenges.push({
      id: "less",
      title: "Spend less than last month",
      done: spent,
      target: lastSpent,
      money: true,
      lowerIsBetter: true,
      complete: finished && under,
      status: !under ? "Over" : finished ? "Complete!" : "On track",
    });
  }
  return challenges;
}

/** The partner turns shiny for a month once income is logged and every quest is complete. */
export const isShiny = (quests: Quest[], s: MonthSummary) =>
  s.income > 0 && quests.length > 0 && quests.every((q) => q.complete);

// ---- Badges ----------------------------------------------------------------
// Gym badges from the first three regions, eight each. Add one by adding an
// entry; `earned` is given everything it might need. Kanto is the opening
// stretch, Johto asks for steady habits, and Hoenn for staying power.

type BadgeInput = {
  player: Player;
  totals: MonthTotal[];
  categories: Category[];
  /** How many Pokémon have been caught. */
  caught: number;
};

export const REGIONS = ["Kanto", "Johto", "Hoenn"] as const;

export type Badge = {
  id: string;
  region: (typeof REGIONS)[number];
  /** Which badge sprite to show (PokeAPI numbers them 1–24 across the three regions). */
  sprite: number;
  name: string;
  how: string;
  earned: (input: BadgeInput) => boolean;
};

/** Every month with entries, oldest first, with its summary. Pay brought forward into a month is not an entry in it. */
function months(totals: MonthTotal[]) {
  const keys = [...new Set(totals.filter((t) => t.entries > 0).map((t) => t.month.slice(0, 7)))].sort();
  return keys.map((m) => ({ month: m, ...summarizeMonth(totals, m) }));
}

/** The longest run of consecutive months that pass `test`. */
function longestRun(totals: MonthTotal[], test: (m: MonthSummary) => boolean) {
  let run = 0;
  let best = 0;
  for (const m of months(totals)) {
    run = test(m) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const inTheGreen = (m: MonthSummary) => m.income > 0 && m.remaining > 0;

/** Months in which a saving category reached its target. */
const goalMonths = ({ totals, categories }: BadgeInput) =>
  new Set(
    totals
      .filter((t) => {
        const target = categories.find((c) => c.id === t.category_id)?.monthly_target;
        return t.kind === "saving" && target != null && t.total >= target;
      })
      .map((t) => t.month),
  ).size;

/** The most spending categories used in any one month. */
const widestMonth = ({ totals }: BadgeInput) => {
  const perMonth = new Map<string, number>();
  for (const t of totals) if (t.kind === "expense") perMonth.set(t.month, (perMonth.get(t.month) ?? 0) + 1);
  return Math.max(0, ...perMonth.values());
};

export const BADGES: Badge[] = [
  // Kanto
  { id: "boulder", region: "Kanto", sprite: 1, name: "Boulder Badge", how: "Log your first entry", earned: ({ player }) => player.entries >= 1 },
  { id: "cascade", region: "Kanto", sprite: 2, name: "Cascade Badge", how: "Set money aside in any month", earned: ({ player }) => player.saved > 0 },
  { id: "thunder", region: "Kanto", sprite: 3, name: "Thunder Badge", how: "Log 25 entries", earned: ({ player }) => player.entries >= 25 },
  { id: "rainbow", region: "Kanto", sprite: 4, name: "Rainbow Badge", how: "End a month with money left over", earned: ({ totals }) => longestRun(totals, inTheGreen) >= 1 },
  { id: "soul", region: "Kanto", sprite: 5, name: "Soul Badge", how: "Hit a savings goal in a month", earned: (input) => goalMonths(input) >= 1 },
  { id: "marsh", region: "Kanto", sprite: 6, name: "Marsh Badge", how: "Log 100 entries", earned: ({ player }) => player.entries >= 100 },
  { id: "volcano", region: "Kanto", sprite: 7, name: "Volcano Badge", how: "Three months in a row with money left over", earned: ({ totals }) => longestRun(totals, inTheGreen) >= 3 },
  { id: "earth", region: "Kanto", sprite: 8, name: "Earth Badge", how: "Reach level 10", earned: ({ player }) => player.level >= 10 },
  // Johto
  { id: "zephyr", region: "Johto", sprite: 9, name: "Zephyr Badge", how: "Log 50 entries", earned: ({ player }) => player.entries >= 50 },
  { id: "hive", region: "Johto", sprite: 10, name: "Hive Badge", how: "Catch your first Pokémon", earned: ({ caught }) => caught >= 1 },
  { id: "plain", region: "Johto", sprite: 11, name: "Plain Badge", how: "Save ₱10,000 in total", earned: ({ player }) => player.saved >= 10000 },
  { id: "fog", region: "Johto", sprite: 12, name: "Fog Badge", how: "Use five spending categories in one month", earned: (input) => widestMonth(input) >= 5 },
  { id: "storm", region: "Johto", sprite: 13, name: "Storm Badge", how: "Spend under 80% of a month's income", earned: ({ totals }) => months(totals).some((m) => m.income > 0 && m.expense < m.income * 0.8) },
  { id: "mineral", region: "Johto", sprite: 14, name: "Mineral Badge", how: "Log entries in three different months", earned: ({ totals }) => months(totals).length >= 3 },
  { id: "glacier", region: "Johto", sprite: 15, name: "Glacier Badge", how: "Save a fifth of a month's income", earned: ({ totals }) => months(totals).some((m) => m.income > 0 && m.saving >= m.income * 0.2) },
  { id: "rising", region: "Johto", sprite: 16, name: "Rising Badge", how: "Reach level 5", earned: ({ player }) => player.level >= 5 },
  // Hoenn
  { id: "stone", region: "Hoenn", sprite: 17, name: "Stone Badge", how: "Save ₱50,000 in total", earned: ({ player }) => player.saved >= 50000 },
  { id: "knuckle", region: "Hoenn", sprite: 18, name: "Knuckle Badge", how: "Six months in a row with money left over", earned: ({ totals }) => longestRun(totals, inTheGreen) >= 6 },
  { id: "dynamo", region: "Hoenn", sprite: 19, name: "Dynamo Badge", how: "Log 250 entries", earned: ({ player }) => player.entries >= 250 },
  { id: "heat", region: "Hoenn", sprite: 20, name: "Heat Badge", how: "Catch 10 Pokémon", earned: ({ caught }) => caught >= 10 },
  { id: "balance", region: "Hoenn", sprite: 21, name: "Balance Badge", how: "Hit a savings goal in three months", earned: (input) => goalMonths(input) >= 3 },
  { id: "feather", region: "Hoenn", sprite: 22, name: "Feather Badge", how: "Log entries in twelve different months", earned: ({ totals }) => months(totals).length >= 12 },
  { id: "mind", region: "Hoenn", sprite: 23, name: "Mind Badge", how: "Catch 50 Pokémon", earned: ({ caught }) => caught >= 50 },
  { id: "rain", region: "Hoenn", sprite: 24, name: "Rain Badge", how: "Reach level 20", earned: ({ player }) => player.level >= 20 },
];

// ---- Narration -------------------------------------------------------------

/** Share of this month's income still unspent, 0–1. Drives the wallet HP bar. */
export function walletHp(s: MonthSummary): number {
  if (s.income <= 0) return 0;
  return Math.max(0, Math.min(1, s.remaining / s.income));
}
