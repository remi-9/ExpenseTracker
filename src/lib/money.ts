// Accounts and bills: pure functions over rows, like game.ts. Nothing here is stored;
// balances and bill states are worked out from entries, transfers and bills.
import { dayLabel, shiftMonth } from "./format";
import type { Account, Bill, Category, Kind, Transaction, Transfer } from "./types";

// ---- Accounts ----------------------------------------------------------------------

type Movement = Pick<Transaction, "amount" | "account_id" | "to_account_id"> & { category: { kind: Kind } };

/**
 * How much each account has gained or lost. Income adds, spending subtracts, and
 * savings stay where they are unless they name an account to move to. A transfer
 * takes from one account and gives to another. (The `account_totals` view does the same in SQL.)
 */
export function netByAccount(
  entries: Movement[],
  transfers: Pick<Transfer, "from_account" | "to_account" | "amount">[],
): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string | null, delta: number) => {
    if (id) net.set(id, (net.get(id) ?? 0) + delta);
  };
  for (const e of entries) {
    const { kind } = e.category;
    if (kind === "income") add(e.account_id, e.amount);
    else if (kind === "expense") add(e.account_id, -e.amount);
    else if (e.to_account_id) {
      add(e.account_id, -e.amount);
      add(e.to_account_id, e.amount);
    }
  }
  for (const t of transfers) {
    add(t.from_account, -t.amount);
    add(t.to_account, t.amount);
  }
  return net;
}

export type Balance = { account: Account; balance: number };

export const accountBalances = (accounts: Account[], net: Map<string, number>): Balance[] =>
  accounts.map((account) => ({ account, balance: account.opening_balance + (net.get(account.id) ?? 0) }));

export type AccountHealth = Balance & {
  /** Spent from the account in the month looked at. */
  spent: number;
  /** HP, 0 to 1: the share left of what the account held before that spending. */
  ratio: number;
};

/** Each account as a party member: its balance, and an HP bar that drains as the month's spending comes out of it. */
export function accountHealth(balances: Balance[], monthEntries: Movement[]): AccountHealth[] {
  return balances.map((b) => {
    const spent = monthEntries
      .filter((e) => e.category.kind === "expense" && e.account_id === b.account.id)
      .reduce((sum, e) => sum + e.amount, 0);
    const ratio = b.balance <= 0 ? 0 : b.balance / (b.balance + spent);
    return { ...b, spent, ratio };
  });
}

// ---- One account's month --------------------------------------------------------------

type DatedMovement = Movement & { occurred_on: string };
type DatedTransfer = Pick<Transfer, "from_account" | "to_account" | "amount" | "occurred_on">;

export type AccountMonth = {
  /** Spent from the account. */
  spent: number;
  /** Set aside from the account, whether the money stayed there or was moved on. */
  saved: number;
  /** Income paid into the account. */
  cameIn: number;
  /** Transfers, and savings moved between accounts: neither income nor spending. */
  movedIn: number;
  movedOut: number;
  /** The account's spending by category, largest first. */
  went: { category_id: string; total: number }[];
};

/**
 * What happened in one account, from a month's entries and transfers. Pass null for
 * every account together: then moving money between them is not a movement at all.
 */
export function accountMonth(
  accountId: string | null,
  entries: (Movement & { category_id: string })[],
  transfers: Pick<Transfer, "from_account" | "to_account" | "amount">[],
): AccountMonth {
  const month: AccountMonth = { spent: 0, saved: 0, cameIn: 0, movedIn: 0, movedOut: 0, went: [] };
  const byCategory = new Map<string, number>();
  for (const e of entries) {
    const { kind } = e.category;
    if (accountId === null || e.account_id === accountId) {
      if (kind === "income") month.cameIn += e.amount;
      else if (kind === "saving") month.saved += e.amount;
      else {
        month.spent += e.amount;
        byCategory.set(e.category_id, (byCategory.get(e.category_id) ?? 0) + e.amount);
      }
    }
    if (accountId !== null && kind === "saving" && e.to_account_id) {
      if (e.account_id === accountId) month.movedOut += e.amount;
      if (e.to_account_id === accountId) month.movedIn += e.amount;
    }
  }
  if (accountId !== null) {
    for (const t of transfers) {
      if (t.from_account === accountId) month.movedOut += t.amount;
      if (t.to_account === accountId) month.movedIn += t.amount;
    }
  }
  month.went = [...byCategory].map(([category_id, total]) => ({ category_id, total })).sort((a, b) => b.total - a.total);
  return month;
}

/**
 * Each dated change to an account's balance: money in is positive, money out negative.
 * Pass null for every account together, where only income and spending change the total.
 */
export function accountDeltas(
  accountId: string | null,
  entries: DatedMovement[],
  transfers: DatedTransfer[],
): { occurred_on: string; delta: number }[] {
  const deltas: { occurred_on: string; delta: number }[] = [];
  const add = (occurred_on: string, delta: number) => deltas.push({ occurred_on, delta });
  for (const e of entries) {
    const { kind } = e.category;
    const mine = accountId === null || e.account_id === accountId;
    if (kind === "income" && mine) add(e.occurred_on, e.amount);
    else if (kind === "expense" && mine) add(e.occurred_on, -e.amount);
    else if (kind === "saving" && accountId !== null && e.to_account_id) {
      if (e.account_id === accountId) add(e.occurred_on, -e.amount);
      if (e.to_account_id === accountId) add(e.occurred_on, e.amount);
    }
  }
  if (accountId !== null) {
    for (const t of transfers) {
      if (t.from_account === accountId) add(t.occurred_on, -t.amount);
      if (t.to_account === accountId) add(t.occurred_on, t.amount);
    }
  }
  return deltas;
}

/**
 * The balance at the end of each day of `month` (YYYY-MM), up to `today`, worked back
 * from what the account holds now. `deltas` are its changes from the first of the month onwards.
 */
export function dailyBalances(
  closing: number,
  deltas: { occurred_on: string; delta: number }[],
  month: string,
  today: string,
): { opening: number; days: { date: string; balance: number }[] } {
  const centavos = (n: number) => Math.round(n * 100);
  const first = `${month}-01`;
  const since = deltas.filter((d) => d.occurred_on >= first);
  const opening = centavos(closing) - since.reduce((sum, d) => sum + centavos(d.delta), 0);
  const days: { date: string; balance: number }[] = [];
  let running = opening;
  for (let day = 1; day <= daysIn(month); day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (date > today) break;
    for (const d of since) if (d.occurred_on === date) running += centavos(d.delta);
    days.push({ date, balance: running / 100 });
  }
  return { opening: opening / 100, days };
}

/** The total of every account's opening balance: the starting point for "Money". */
export const openingTotal = (accounts: Account[]) => accounts.reduce((sum, a) => sum + a.opening_balance, 0);

/** What an account held at the end of a day: its opening balance and everything logged up to then. */
export function balanceOn(
  account: Pick<Account, "id" | "opening_balance">,
  entries: (Movement & { occurred_on: string })[],
  transfers: Pick<Transfer, "from_account" | "to_account" | "amount" | "occurred_on">[],
  day: string,
): number {
  const upTo = <T extends { occurred_on: string }>(rows: T[]) => rows.filter((r) => r.occurred_on <= day);
  const total = account.opening_balance + (netByAccount(upTo(entries), upTo(transfers)).get(account.id) ?? 0);
  return Math.round(total * 100) / 100;
}

/** How an account's real balance compares with what the entries add up to. */
export type BalanceGap = { state: "match" } | { state: "short" | "over"; amount: number };

/** Short: it holds less than the entries say, so something was spent and not logged. Over: the other way round. */
export function balanceGap(expected: number, actual: number): BalanceGap {
  const centavos = Math.round(actual * 100) - Math.round(expected * 100);
  if (centavos === 0) return { state: "match" };
  return { state: centavos < 0 ? "short" : "over", amount: Math.abs(centavos) / 100 };
}

/** The category a balance difference is logged under unless you pick another: a catch-all if there is one. */
export const gapCategory = (categories: Pick<Category, "id" | "name" | "kind">[], kind: Kind): string | undefined => {
  const fitting = categories.filter((c) => c.kind === kind);
  return (fitting.find((c) => /not itemi[sz]ed|untracked|adjust|other|misc/i.test(c.name)) ?? fitting[0])?.id;
};

// ---- Bills -------------------------------------------------------------------------

function daysIn(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The date a bill falls due in a month (YYYY-MM). Day 31 becomes the last day of a shorter month. */
export const dueDate = (bill: Pick<Bill, "due_day">, month: string) =>
  `${month}-${String(Math.min(bill.due_day, daysIn(month))).padStart(2, "0")}`;

/** Whole days from one date to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const at = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

export type BillPayment = { bill_id: string; occurred_on: string; amount: number };

/** A bill paid up to this many days before it falls due counts for that due date, not the one before. */
const EARLY_DAYS = 10;
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * Whether a payment counts towards the bill's due date in `month`. It does when it is
 * made in that month, or in the ten days before that due date at the end of the month
 * before: paying on the 30th for a bill due on the 1st settles the month that follows.
 */
function countsFor(bill: Pick<Bill, "due_day" | "cadence">, month: string, paidOn: string): boolean {
  const earlyFor = (m: string) => !paidOn.startsWith(m) && paidOn < dueDate(bill, m) && paidOn >= addDays(dueDate(bill, m), -EARLY_DAYS);
  if (earlyFor(month)) return true;
  return paidOn.startsWith(month) && !(bill.cadence === "monthly" && earlyFor(shiftMonth(month, 1)));
}

export type BillStatus = {
  bill: Bill;
  /** The due date in the month asked about. */
  due: string;
  /** "soon" is due today or within a week. */
  state: "paid" | "overdue" | "soon" | "later";
  /** What has been paid towards this due date. */
  paid: number;
  /** The date of the first payment towards it. */
  paidOn: string | null;
  /** Paid on or before the due date. */
  onTime: boolean;
};

/** Every bill that falls due in `month`, soonest first, with whether it has been paid. */
export function billsFor(month: string, bills: Bill[], payments: BillPayment[], today: string): BillStatus[] {
  const monthNumber = Number(month.slice(5));
  return bills
    .filter((b) => !b.archived_at && (b.cadence === "monthly" || b.due_month === monthNumber))
    .map((bill): BillStatus => {
      const due = dueDate(bill, month);
      const mine = payments.filter((p) => p.bill_id === bill.id && countsFor(bill, month, p.occurred_on));
      const paid = mine.reduce((sum, p) => sum + p.amount, 0);
      const paidOn = mine.map((p) => p.occurred_on).sort()[0] ?? null;
      const wait = daysBetween(today, due);
      const state = paidOn ? "paid" : wait < 0 ? "overdue" : wait <= 7 ? "soon" : "later";
      return { bill, due, state, paid, paidOn, onTime: !!paidOn && paidOn <= due };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.bill.name.localeCompare(b.bill.name));
}

/** "Due in 3 days", "Overdue by 2 days", "Paid Nov 4". */
export function dueLabel(status: BillStatus, today: string): string {
  if (status.paidOn) return `Paid ${dayLabel(status.paidOn)}`;
  const wait = daysBetween(today, status.due);
  if (wait < 0) return `Overdue by ${-wait} ${wait === -1 ? "day" : "days"}`;
  if (wait === 0) return "Due today";
  if (wait === 1) return "Due tomorrow";
  return wait <= 7 ? `Due in ${wait} days` : `Due ${dayLabel(status.due)}`;
}

/**
 * What is left of the month's income once the bills still to pay are set aside.
 * Expected income is not counted until it arrives, and bills with no set amount are skipped.
 */
export function leftAfterBills(remaining: number, statuses: BillStatus[], kindOf: Map<string, Kind>): number {
  const owed = statuses
    .filter((s) => s.state !== "paid" && s.bill.amount != null && kindOf.get(s.bill.category_id) !== "income")
    .reduce((sum, s) => sum + s.bill.amount!, 0);
  return remaining - owed;
}

/** Unpaid bills that are overdue or due within a week: what Home should mention. */
export const needsPaying = (statuses: BillStatus[]) => statuses.filter((s) => s.state === "overdue" || s.state === "soon");

/**
 * The expedition's Amulet Coin: at least one bill paid this month, every payment
 * on time, and nothing overdue.
 */
export const amuletEarned = (statuses: BillStatus[]) =>
  statuses.some((s) => s.state === "paid") &&
  statuses.every((s) => s.state !== "overdue" && (s.state !== "paid" || s.onTime));
