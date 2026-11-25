import { describe, expect, test } from "bun:test";
import type { BillStatus } from "./money";
import { BADGES, bestMonth, getChallenges, getPlayer, LOG_DAYS, payMonth, summarizeMonth, withLatePay } from "./game";
import type { Kind, MonthTotal } from "./types";

const total = (month: string, kind: Kind, amount: number, entries = 1, category_id: string = kind): MonthTotal => ({
  month: `${month}-01`,
  category_id,
  kind,
  total: amount,
  entries,
});
const pay = (occurred_on: string, amount: number, category_id = "income") => ({ occurred_on, amount, category_id });

describe("payMonth", () => {
  test("income counts for the month it lands in", () => {
    expect(payMonth("2026-11-24")).toBe("2026-11");
  });

  test("income dated from the 25th counts for the month after", () => {
    expect(payMonth("2026-11-25")).toBe("2026-12");
    expect(payMonth("2026-12-30")).toBe("2027-01");
  });
});

describe("withLatePay", () => {
  // Pay lands on 30 October and is meant for November.
  const totals = [total("2026-10", "income", 40000, 2), total("2026-10", "expense", 9000, 5), total("2026-11", "expense", 7000, 4)];
  const shifted = withLatePay(totals, [pay("2026-10-12", 2000), pay("2026-10-30", 38000)]);

  test("late pay is income of the month after", () => {
    expect(summarizeMonth(shifted, "2026-11").income).toBe(38000);
    expect(summarizeMonth(shifted, "2026-11").remaining).toBe(31000);
  });

  test("and no longer income of the month it landed in", () => {
    expect(summarizeMonth(shifted, "2026-10").income).toBe(2000);
  });

  test("what you hold still goes by the day the money landed", () => {
    expect(summarizeMonth(shifted, "2026-10", 1000).balance).toBe(1000 + 40000 - 9000);
    expect(summarizeMonth(shifted, "2026-11", 1000).balance).toBe(1000 + 40000 - 9000 - 7000);
  });

  test("the entry still counts once, in the month it was logged", () => {
    expect(getPlayer(shifted).entries).toBe(getPlayer(totals).entries);
  });

  test("leaves the totals it was given untouched", () => {
    expect(totals[0].total).toBe(40000);
  });
});

describe("bestMonth", () => {
  const totals = [
    total("2026-09", "income", 30000),
    total("2026-09", "expense", 20000),
    total("2026-10", "income", 30000),
    total("2026-10", "expense", 12000),
    total("2026-11", "income", 38000),
  ];

  test("is the finished month with the most left over", () => {
    expect(bestMonth(totals, "2026-11")).toEqual({ month: "2026-10", left: 18000 });
  });

  test("the month still running does not count, however much of its pay is left", () => {
    expect(bestMonth(totals, "2026-11")?.month).not.toBe("2026-11");
  });

  test("there is none before the first month is over", () => {
    expect(bestMonth(totals, "2026-09")).toBeNull();
  });
});

describe("badges", () => {
  test("a month that only holds pay brought forward is not a month with entries", () => {
    // October and November have entries. December only has the pay that landed on 28 November.
    const logged = [total("2026-10", "income", 38000), total("2026-11", "expense", 500), total("2026-11", "income", 100)];
    const totals = withLatePay(logged, [pay("2026-10-30", 38000), pay("2026-11-28", 100)]);
    const threeMonths = BADGES.find((b) => b.id === "mineral")!;
    expect(threeMonths.earned({ player: getPlayer(totals), totals, categories: [], caught: 0 })).toBe(false);
  });
});

describe("getChallenges", () => {
  const bill = (state: BillStatus["state"], onTime = state === "paid"): BillStatus => ({
    bill: { id: state + onTime, name: "Bill" } as BillStatus["bill"],
    due: "2026-11-10",
    state,
    paid: state === "paid" ? 100 : 0,
    paidOn: state === "paid" ? "2026-11-09" : null,
    onTime,
  });
  const base = { bills: [] as BillStatus[], loggedDays: 0, spent: 0, lastSpent: 0, finished: false };

  test("a month with no bills and nothing spent last month has only the logging quest", () => {
    expect(getChallenges(base).map((c) => c.id)).toEqual(["days"]);
  });

  test("the bills quest counts bills paid on time, and late ones do not finish it", () => {
    const [bills] = getChallenges({ ...base, bills: [bill("paid"), bill("paid", false), bill("soon")] });
    expect(bills).toMatchObject({ id: "bills", done: 1, target: 3, complete: false });
    expect(getChallenges({ ...base, bills: [bill("paid"), bill("paid")] })[0].complete).toBe(true);
  });

  test(`logging on ${LOG_DAYS} different days finishes the logging quest`, () => {
    const days = (n: number) => getChallenges({ ...base, loggedDays: n }).find((c) => c.id === "days")!;
    expect(days(LOG_DAYS - 1).complete).toBe(false);
    expect(days(LOG_DAYS)).toMatchObject({ done: LOG_DAYS, target: LOG_DAYS, complete: true });
  });

  test("spending less than last month is on track until the month ends, then complete", () => {
    const less = (spent: number, finished: boolean) =>
      getChallenges({ ...base, spent, lastSpent: 1000, finished }).find((c) => c.id === "less")!;
    expect(less(800, false)).toMatchObject({ complete: false, status: "On track", lowerIsBetter: true });
    expect(less(800, true)).toMatchObject({ complete: true, status: "Complete!" });
    expect(less(1200, true)).toMatchObject({ complete: false, status: "Over" });
  });
});
