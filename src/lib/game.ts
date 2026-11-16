// All game rules live here as pure functions over the month_totals rows.
// Nothing about the game is stored in the database, so rules can change freely.
import type { Category, MonthTotal } from "./types";

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

const RANKS = ["Rookie", "Coin Scout", "Budget Ranger", "Ledger Knight", "Vault Keeper", "Money Master"];

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
  const xp = entries * XP_PER_ENTRY + Math.floor(saved / PESOS_PER_SAVING_XP);
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

// ---- Badges ----------------------------------------------------------------
// Add a badge by adding an entry here. `earned` gets everything it might need.

type BadgeInput = {
  player: Player;
  totals: MonthTotal[];
  categories: Category[];
};

export type Badge = {
  id: string;
  icon: string;
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
  {
    id: "first-log",
    icon: "📝",
    name: "First entry",
    how: "Log your first entry",
    earned: ({ player }) => player.entries >= 1,
  },
  {
    id: "scribe",
    icon: "📚",
    name: "Scribe",
    how: "Log 25 entries",
    earned: ({ player }) => player.entries >= 25,
  },
  {
    id: "piggy",
    icon: "🐷",
    name: "Piggy bank",
    how: "Set money aside in any month",
    earned: ({ player }) => player.saved > 0,
  },
  {
    id: "goal",
    icon: "🎯",
    name: "Goal getter",
    how: "Hit a savings goal in a month",
    earned: ({ totals, categories }) =>
      totals.some((t) => {
        const target = categories.find((c) => c.id === t.category_id)?.monthly_target;
        return t.kind === "saving" && target != null && t.total >= target;
      }),
  },
  {
    id: "in-the-green",
    icon: "🌿",
    name: "In the green",
    how: "End a month with money left over",
    earned: ({ totals }) => months(totals).some((m) => m.income > 0 && m.remaining > 0),
  },
  {
    id: "hat-trick",
    icon: "🏆",
    name: "Hat trick",
    how: "Three months in a row with money left over",
    earned: ({ totals }) => {
      let run = 0;
      return months(totals).some((m) => (run = m.income > 0 && m.remaining > 0 ? run + 1 : 0) >= 3);
    },
  },
];

// ---- Narration -------------------------------------------------------------

/** Share of this month's income still unspent, 0–1. Drives the wallet HP bar. */
export function walletHp(s: MonthSummary): number {
  if (s.income <= 0) return 0;
  return Math.max(0, Math.min(1, s.remaining / s.income));
}
