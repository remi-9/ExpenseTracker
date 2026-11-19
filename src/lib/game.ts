// All game rules live here as pure functions over the month_totals rows.
// Nothing about the game is stored in the database, so rules can change freely.
import type { Category, Kind, MonthTotal } from "./types";

export type MonthSummary = {
  income: number;
  expense: number;
  saving: number;
  /** income − expense − saving: what the spreadsheet called "Remaining from Salary". */
  remaining: number;
  /** All income − all expenses up to and including this month. Savings stay in the bank. */
  balance: number;
};

export function summarizeMonth(totals: MonthTotal[], month: string): MonthSummary {
  const key = `${month}-01`;
  const s = { income: 0, expense: 0, saving: 0, remaining: 0, balance: 0 };
  for (const t of totals) {
    if (t.month === key) s[t.kind] += t.total;
    if (t.month <= key) {
      if (t.kind === "income") s.balance += t.total;
      if (t.kind === "expense") s.balance -= t.total;
    }
  }
  s.remaining = s.income - s.expense - s.saving;
  return s;
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

/** The partner turns shiny for a month once income is logged and every quest is complete. */
export const isShiny = (quests: Quest[], s: MonthSummary) =>
  s.income > 0 && quests.length > 0 && quests.every((q) => q.complete);

// ---- Badges ----------------------------------------------------------------
// Add a badge by adding an entry here. `earned` gets everything it might need.

type BadgeInput = {
  player: Player;
  totals: MonthTotal[];
  categories: Category[];
};

export type Badge = {
  id: string;
  /** Which Kanto gym badge sprite to show, 1–8. */
  sprite: number;
  name: string;
  how: string;
  earned: (input: BadgeInput) => boolean;
};

/** Months, oldest first, with their summaries. */
function months(totals: MonthTotal[]) {
  const keys = [...new Set(totals.map((t) => t.month.slice(0, 7)))].sort();
  return keys.map((m) => summarizeMonth(totals, m));
}

export const BADGES: Badge[] = [
  { id: "boulder", sprite: 1, name: "Boulder Badge", how: "Log your first entry", earned: ({ player }) => player.entries >= 1 },
  { id: "cascade", sprite: 2, name: "Cascade Badge", how: "Set money aside in any month", earned: ({ player }) => player.saved > 0 },
  { id: "thunder", sprite: 3, name: "Thunder Badge", how: "Log 25 entries", earned: ({ player }) => player.entries >= 25 },
  {
    id: "rainbow",
    sprite: 4,
    name: "Rainbow Badge",
    how: "End a month with money left over",
    earned: ({ totals }) => months(totals).some((m) => m.income > 0 && m.remaining > 0),
  },
  {
    id: "soul",
    sprite: 5,
    name: "Soul Badge",
    how: "Hit a savings goal in a month",
    earned: ({ totals, categories }) =>
      totals.some((t) => {
        const target = categories.find((c) => c.id === t.category_id)?.monthly_target;
        return t.kind === "saving" && target != null && t.total >= target;
      }),
  },
  { id: "marsh", sprite: 6, name: "Marsh Badge", how: "Log 100 entries", earned: ({ player }) => player.entries >= 100 },
  {
    id: "volcano",
    sprite: 7,
    name: "Volcano Badge",
    how: "Three months in a row with money left over",
    earned: ({ totals }) => {
      let run = 0;
      return months(totals).some((m) => (run = m.income > 0 && m.remaining > 0 ? run + 1 : 0) >= 3);
    },
  },
  { id: "earth", sprite: 8, name: "Earth Badge", how: "Reach level 10", earned: ({ player }) => player.level >= 10 },
];

// ---- Narration -------------------------------------------------------------

/** Share of this month's income still unspent, 0–1. Drives the wallet HP bar. */
export function walletHp(s: MonthSummary): number {
  if (s.income <= 0) return 0;
  return Math.max(0, Math.min(1, s.remaining / s.income));
}
