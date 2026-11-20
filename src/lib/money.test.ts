import { describe, expect, test } from "bun:test";
import {
  accountBalances,
  accountDeltas,
  accountHealth,
  accountMonth,
  amuletEarned,
  balanceGap,
  balanceOn,
  billsFor,
  dailyBalances,
  dueDate,
  dueLabel,
  gapCategory,
  leftAfterBills,
  netByAccount,
} from "./money";
import type { Account, Bill, Kind } from "./types";

const entry = (kind: Kind, amount: number, account_id: string | null, to_account_id: string | null = null) => ({
  amount,
  account_id,
  to_account_id,
  category: { kind },
});
const account = (id: string, opening_balance = 0, over: Partial<Account> = {}): Account => ({
  id,
  name: id,
  kind: "bank",
  icon: "pkmn-143",
  opening_balance,
  sort_order: 0,
  archived_at: null,
  ...over,
});
const bill = (id: string, due_day: number, over: Partial<Bill> = {}): Bill => ({
  id,
  name: id,
  category_id: "rent",
  account_id: null,
  amount: 1000,
  due_day,
  cadence: "monthly",
  due_month: null,
  archived_at: null,
  ...over,
});
const paid = (bill_id: string, occurred_on: string, amount = 1000) => ({ bill_id, occurred_on, amount });

describe("what each account holds", () => {
  test("income adds and spending subtracts", () => {
    const net = netByAccount([entry("income", 500, "a"), entry("expense", 120, "a")], []);
    expect(net.get("a")).toBe(380);
  });

  test("savings stay in the account unless they are sent to another", () => {
    const net = netByAccount([entry("saving", 300, "a"), entry("saving", 200, "a", "b")], []);
    expect(net.get("a")).toBe(-200);
    expect(net.get("b")).toBe(200);
  });

  test("a transfer moves money without creating any", () => {
    const net = netByAccount([], [{ from_account: "a", to_account: "b", amount: 75 }]);
    expect(net.get("a")).toBe(-75);
    expect(net.get("b")).toBe(75);
  });

  test("entries with no account touch no account", () => {
    expect(netByAccount([entry("income", 500, null)], []).size).toBe(0);
  });

  test("a balance is the opening balance plus everything since", () => {
    const balances = accountBalances([account("a", 1000), account("b")], new Map([["a", -250]]));
    expect(balances.map((b) => b.balance)).toEqual([750, 0]);
  });
});

describe("when a bill is due", () => {
  test("on its day of the month", () => {
    expect(dueDate(bill("x", 15), "2026-11")).toBe("2026-11-15");
  });

  test("on the last day when the month is too short", () => {
    expect(dueDate(bill("x", 31), "2026-11")).toBe("2026-11-30");
    expect(dueDate(bill("x", 30), "2027-02")).toBe("2027-02-28");
  });
});

describe("the month's bills", () => {
  const today = "2026-11-20";

  test("come in order of due date", () => {
    const list = billsFor("2026-11", [bill("late", 28), bill("early", 3)], [], today);
    expect(list.map((s) => s.bill.id)).toEqual(["early", "late"]);
  });

  test("a yearly bill only appears in its month", () => {
    const yearly = bill("insurance", 10, { cadence: "yearly", due_month: 11 });
    expect(billsFor("2026-11", [yearly], [], today).length).toBe(1);
    expect(billsFor("2026-10", [yearly], [], today).length).toBe(0);
  });

  test("archived bills are left out", () => {
    expect(billsFor("2026-11", [bill("old", 5, { archived_at: "2026-01-01" })], [], today)).toEqual([]);
  });

  test("a payment in the month marks the bill paid", () => {
    const [status] = billsFor("2026-11", [bill("rent", 5)], [paid("rent", "2026-11-04", 1200)], today);
    expect(status.state).toBe("paid");
    expect(status.paid).toBe(1200);
    expect(status.onTime).toBe(true);
  });

  test("a payment after the due date is paid, but not on time", () => {
    const [status] = billsFor("2026-11", [bill("rent", 5)], [paid("rent", "2026-11-09")], today);
    expect(status.state).toBe("paid");
    expect(status.onTime).toBe(false);
  });

  test("last month's payment does not count for this month", () => {
    const [status] = billsFor("2026-11", [bill("rent", 5)], [paid("rent", "2026-10-05")], today);
    expect(status.state).toBe("overdue");
  });

  test("a payment made in the last days of the month before counts for this month", () => {
    const payments = [paid("net", "2026-10-02", 1500), paid("net", "2026-10-30", 1600)];
    const [november] = billsFor("2026-11", [bill("net", 1)], payments, today);
    expect(november).toMatchObject({ state: "paid", paid: 1600, paidOn: "2026-10-30", onTime: true });
    const [october] = billsFor("2026-10", [bill("net", 1)], payments, today);
    expect(october).toMatchObject({ state: "paid", paid: 1500, paidOn: "2026-10-02", onTime: false });
  });

  test("a payment early in a month counts for that month, however late in it the bill falls due", () => {
    const payments = [paid("net", "2026-11-02")];
    expect(billsFor("2026-11", [bill("net", 25)], payments, today)[0]).toMatchObject({ state: "paid", onTime: true });
    expect(billsFor("2026-10", [bill("net", 25)], payments, today)[0].state).toBe("overdue");
  });

  test("a payment more than ten days early belongs to the month it was made in", () => {
    const payments = [paid("net", "2026-10-18")];
    expect(billsFor("2026-11", [bill("net", 1)], payments, today)[0].state).toBe("overdue");
    expect(billsFor("2026-10", [bill("net", 1)], payments, today)[0].state).toBe("paid");
  });

  test("unpaid bills are overdue, due soon or due later", () => {
    const list = billsFor("2026-11", [bill("past", 19), bill("today", 20), bill("week", 27), bill("far", 28)], [], today);
    expect(list.map((s) => s.state)).toEqual(["overdue", "soon", "soon", "later"]);
  });

  test("every unpaid bill of a past month is overdue, and of a future month due later", () => {
    expect(billsFor("2026-10", [bill("x", 28)], [], today)[0].state).toBe("overdue");
    expect(billsFor("2026-12", [bill("x", 1)], [], today)[0].state).toBe("later");
  });
});

describe("how a due date reads", () => {
  const today = "2026-11-20";
  const label = (day: number, payments: ReturnType<typeof paid>[] = []) =>
    dueLabel(billsFor("2026-11", [bill("x", day)], payments, today)[0], today);

  test("counts days either side of today", () => {
    expect(label(20)).toBe("Due today");
    expect(label(21)).toBe("Due tomorrow");
    expect(label(23)).toBe("Due in 3 days");
    expect(label(19)).toBe("Overdue by 1 day");
    expect(label(10)).toBe("Overdue by 10 days");
  });

  test("gives the date when it is more than a week off", () => {
    expect(label(30)).toBe("Due Nov 30");
  });

  test("says when it was paid", () => {
    expect(label(5, [paid("x", "2026-11-04")])).toBe("Paid Nov 4");
  });
});

describe("what is left after bills", () => {
  const kinds = new Map<string, Kind>([
    ["rent", "expense"],
    ["save", "saving"],
    ["salary", "income"],
  ]);
  const today = "2026-11-20";

  test("takes off unpaid spending and saving bills", () => {
    const list = billsFor("2026-11", [bill("rent", 25), bill("fund", 28, { category_id: "save", amount: 500 })], [], today);
    expect(leftAfterBills(5000, list, kinds)).toBe(3500);
  });

  test("ignores bills already paid, expected income, and bills with no set amount", () => {
    const bills = [bill("rent", 5), bill("pay", 30, { category_id: "salary", amount: 9000 }), bill("power", 27, { amount: null })];
    const list = billsFor("2026-11", bills, [paid("rent", "2026-11-05")], today);
    expect(leftAfterBills(5000, list, kinds)).toBe(5000);
  });
});

describe("the Amulet Coin for paying on time", () => {
  const today = "2026-11-20";
  const earned = (bills: Bill[], payments: ReturnType<typeof paid>[]) => amuletEarned(billsFor("2026-11", bills, payments, today));

  test("needs a bill paid this month", () => {
    expect(earned([bill("rent", 25)], [])).toBe(false);
    expect(earned([bill("rent", 25)], [paid("rent", "2026-11-02")])).toBe(true);
  });

  test("is lost to an overdue bill or a late payment", () => {
    expect(earned([bill("rent", 5), bill("net", 10)], [paid("rent", "2026-11-02")])).toBe(false);
    expect(earned([bill("rent", 5)], [paid("rent", "2026-11-12")])).toBe(false);
  });
});

describe("an account's HP", () => {
  const spend = (amount: number, account_id: string) => entry("expense", amount, account_id);

  test("is the share left of what it held before this month's spending", () => {
    const [a] = accountHealth([{ account: account("a"), balance: 750 }], [spend(250, "a"), spend(999, "b")]);
    expect(a.spent).toBe(250);
    expect(a.ratio).toBe(0.75);
  });

  test("is full when nothing was spent from it, and empty when it is overdrawn", () => {
    const [full, empty] = accountHealth(
      [
        { account: account("a"), balance: 500 },
        { account: account("b"), balance: -20 },
      ],
      [spend(100, "b")],
    );
    expect(full.ratio).toBe(1);
    expect(empty.ratio).toBe(0);
  });
});

describe("checking an account against its real balance", () => {
  test("matches when the two agree to the centavo", () => {
    expect(balanceGap(1500.1, 1500.1)).toEqual({ state: "match" });
    expect(balanceGap(0.1 + 0.2, 0.3)).toEqual({ state: "match" });
  });

  test("is short when the account holds less than the entries say", () => {
    expect(balanceGap(5000, 4250.5)).toEqual({ state: "short", amount: 749.5 });
  });

  test("is over when the account holds more than the entries say", () => {
    expect(balanceGap(5000, 5020)).toEqual({ state: "over", amount: 20 });
  });

  const categories = [
    { id: "food", name: "Food", kind: "expense" as const },
    { id: "other", name: "Other", kind: "expense" as const },
    { id: "pay", name: "Salary", kind: "income" as const },
  ];

  test("offers a catch-all category for the difference when there is one", () => {
    expect(gapCategory(categories, "expense")).toBe("other");
  });

  test("falls back to the first category of the kind", () => {
    expect(gapCategory(categories, "income")).toBe("pay");
    expect(gapCategory(categories, "saving")).toBeUndefined();
  });
});

describe("what an account held on a given day", () => {
  const account = { id: "bank", opening_balance: 1000 };
  const entries = [
    { amount: 300, occurred_on: "2026-11-03", account_id: "bank", to_account_id: null, category: { kind: "expense" as const } },
    { amount: 5000, occurred_on: "2026-11-10", account_id: "bank", to_account_id: null, category: { kind: "income" as const } },
  ];
  const transfers = [{ from_account: "bank", to_account: "cash", amount: 200, occurred_on: "2026-11-05" }];

  test("counts entries and transfers up to and including that day", () => {
    expect(balanceOn(account, entries, transfers, "2026-11-02")).toBe(1000);
    expect(balanceOn(account, entries, transfers, "2026-11-03")).toBe(700);
    expect(balanceOn(account, entries, transfers, "2026-11-05")).toBe(500);
    expect(balanceOn(account, entries, transfers, "2026-11-30")).toBe(5500);
  });
});

// ---- One account's month ------------------------------------------------------------

const dated = (
  kind: Kind,
  amount: number,
  occurred_on: string,
  account_id: string | null,
  over: { to_account_id?: string | null; category_id?: string } = {},
) => ({ amount, occurred_on, account_id, to_account_id: over.to_account_id ?? null, category_id: over.category_id ?? kind, category: { kind } });
const moved = (from_account: string, to_account: string, amount: number, occurred_on: string) => ({ from_account, to_account, amount, occurred_on });

describe("accountMonth", () => {
  test("spent is what was spent from the account, not from the others", () => {
    const month = accountMonth("bank", [dated("expense", 300, "2026-11-03", "bank"), dated("expense", 50, "2026-11-04", "cash")], []);
    expect(month.spent).toBe(300);
  });

  test("saved is what was set aside from the account, wherever it went", () => {
    const entries = [
      dated("saving", 1000, "2026-11-05", "bank"),
      dated("saving", 500, "2026-11-06", "bank", { to_account_id: "vault" }),
      dated("saving", 200, "2026-11-06", "cash", { to_account_id: "bank" }),
    ];
    expect(accountMonth("bank", entries, []).saved).toBe(1500);
  });

  test("money in is the income paid into the account", () => {
    const month = accountMonth("bank", [dated("income", 9000, "2026-11-10", "bank"), dated("income", 700, "2026-11-11", "cash")], []);
    expect(month.cameIn).toBe(9000);
  });

  test("moved counts transfers, and savings sent to or from another account", () => {
    const entries = [dated("saving", 500, "2026-11-06", "bank", { to_account_id: "vault" }), dated("saving", 200, "2026-11-06", "cash", { to_account_id: "bank" })];
    const transfers = [moved("bank", "cash", 3000, "2026-11-02"), moved("cash", "bank", 100, "2026-11-09")];
    const month = accountMonth("bank", entries, transfers);
    expect(month.movedOut).toBe(3500);
    expect(month.movedIn).toBe(300);
  });

  test("where it went lists the account's spending by category, largest first", () => {
    const entries = [
      dated("expense", 100, "2026-11-03", "bank", { category_id: "food" }),
      dated("expense", 900, "2026-11-04", "bank", { category_id: "rent" }),
      dated("expense", 150, "2026-11-08", "bank", { category_id: "food" }),
      dated("expense", 999, "2026-11-08", "cash", { category_id: "fun" }),
    ];
    expect(accountMonth("bank", entries, []).went).toEqual([
      { category_id: "rent", total: 900 },
      { category_id: "food", total: 250 },
    ]);
  });

  test("with no account named it covers every account, and nothing counts as moved", () => {
    const entries = [
      dated("expense", 300, "2026-11-03", "bank"),
      dated("expense", 50, "2026-11-04", null),
      dated("saving", 500, "2026-11-06", "bank", { to_account_id: "vault" }),
      dated("income", 9000, "2026-11-10", "cash"),
    ];
    const month = accountMonth(null, entries, [moved("bank", "cash", 3000, "2026-11-02")]);
    expect(month).toMatchObject({ spent: 350, saved: 500, cameIn: 9000, movedIn: 0, movedOut: 0 });
  });
});

describe("accountDeltas", () => {
  test("gives each movement its sign for the account: income in, spending and transfers out", () => {
    const entries = [dated("income", 9000, "2026-11-10", "bank"), dated("expense", 300, "2026-11-03", "bank"), dated("expense", 50, "2026-11-04", "cash")];
    const deltas = accountDeltas("bank", entries, [moved("bank", "cash", 3000, "2026-11-02")]);
    expect(deltas).toEqual([
      { occurred_on: "2026-11-10", delta: 9000 },
      { occurred_on: "2026-11-03", delta: -300 },
      { occurred_on: "2026-11-02", delta: -3000 },
    ]);
  });

  test("a saving that stays in the account does not move its balance", () => {
    expect(accountDeltas("bank", [dated("saving", 1000, "2026-11-05", "bank")], [])).toEqual([]);
  });

  test("for every account together, only income and spending count", () => {
    const entries = [dated("income", 9000, "2026-11-10", "bank"), dated("expense", 50, "2026-11-04", null), dated("saving", 500, "2026-11-06", "bank", { to_account_id: "vault" })];
    const deltas = accountDeltas(null, entries, [moved("bank", "cash", 3000, "2026-11-02")]);
    expect(deltas).toEqual([
      { occurred_on: "2026-11-10", delta: 9000 },
      { occurred_on: "2026-11-04", delta: -50 },
    ]);
  });
});

describe("dailyBalances", () => {
  const deltas = [
    { occurred_on: "2026-11-02", delta: -3000 },
    { occurred_on: "2026-11-02", delta: -200 },
    { occurred_on: "2026-11-04", delta: 500 },
  ];

  test("works back from what the account holds now to what it held as the month began", () => {
    expect(dailyBalances(10000, deltas, "2026-11", "2026-11-05").opening).toBe(12700);
  });

  test("gives the balance at the end of each day, up to today", () => {
    const { days } = dailyBalances(10000, deltas, "2026-11", "2026-11-05");
    expect(days.map((d) => d.balance)).toEqual([12700, 9500, 9500, 10000, 10000]);
    expect(days[4].date).toBe("2026-11-05");
  });

  test("a past month runs to its last day and leaves out what came after it", () => {
    const later = [...deltas, { occurred_on: "2026-12-03", delta: -1000 }];
    const { opening, days } = dailyBalances(9000, later, "2026-11", "2026-12-10");
    expect(opening).toBe(12700);
    expect(days).toHaveLength(30);
    expect(days[29]).toEqual({ date: "2026-11-30", balance: 10000 });
  });

  test("a month that has not begun has no days", () => {
    expect(dailyBalances(10000, [], "2026-12", "2026-11-20").days).toEqual([]);
  });

  test("keeps centavos exact", () => {
    const { days } = dailyBalances(0.3, [{ occurred_on: "2026-11-01", delta: 0.1 }, { occurred_on: "2026-11-01", delta: 0.2 }], "2026-11", "2026-11-01");
    expect(days[0].balance).toBe(0.3);
  });
});
