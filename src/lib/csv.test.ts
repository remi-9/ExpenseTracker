import { describe, expect, test } from "bun:test";
import { parseCsv, planImport, toCsv } from "./csv";

describe("reading a CSV file", () => {
  test("splits rows and cells", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("keeps commas, quotes and line breaks inside quoted cells", () => {
    expect(parseCsv('note\n"Rice, 5kg"\n"He said ""hi"""\n"two\nlines"')).toEqual([
      ["note"],
      ["Rice, 5kg"],
      ['He said "hi"'],
      ["two\nlines"],
    ]);
  });

  test("handles Windows line endings and skips blank lines", () => {
    expect(parseCsv("a,b\r\n\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("planning an import", () => {
  const categories = [
    { id: "c1", name: "Food", kind: "expense" as const },
    { id: "c2", name: "Salary", kind: "income" as const },
  ];
  const accounts = [{ id: "a1", name: "Bank" }];
  const plan = (text: string) => planImport(parseCsv(text), categories, accounts);

  test("matches categories and accounts by name, whatever the case", () => {
    const { entries } = plan("date,category,amount,note,account\n2026-11-03,food,250.50,Lunch,BANK");
    expect(entries).toEqual([
      { occurred_on: "2026-11-03", category: "Food", amount: 250.5, note: "Lunch", account: "Bank" },
    ]);
  });

  test("accepts columns in any order and ignores ones it does not know", () => {
    const { entries } = plan("Amount,Extra,Date,Category\n100,x,2026-11-01,Salary");
    expect(entries).toEqual([{ occurred_on: "2026-11-01", category: "Salary", amount: 100, note: null, account: null }]);
  });

  test("lists categories and accounts that would have to be created", () => {
    const result = plan("date,category,amount,kind,account\n2026-11-01,Gym,900,expense,Wallet\n2026-11-02,Bonus,5000,income,Wallet");
    expect(result.newCategories).toEqual([
      { name: "Gym", kind: "expense" },
      { name: "Bonus", kind: "income" },
    ]);
    expect(result.newAccounts).toEqual(["Wallet"]);
  });

  test("a new category with no kind given counts as spending", () => {
    expect(plan("date,category,amount\n2026-11-01,Misc,10").newCategories).toEqual([{ name: "Misc", kind: "expense" }]);
  });

  test("reads amounts with commas and a peso sign, and dates written with slashes", () => {
    const { entries } = plan('date,category,amount\n11/03/2026,Food,"₱1,250.00"');
    expect(entries[0]).toMatchObject({ occurred_on: "2026-11-03", amount: 1250 });
  });

  test("skips bad rows and says why, by line number", () => {
    const result = plan("date,category,amount\nnot-a-date,Food,10\n2026-11-01,,10\n2026-11-01,Food,zero\n2026-11-01,Food,20");
    expect(result.entries.length).toBe(1);
    expect(result.skipped).toEqual([
      { line: 2, why: "the date is not one I can read" },
      { line: 3, why: "there is no category" },
      { line: 4, why: "the amount is not a number above zero" },
    ]);
  });

  test("refuses a file without the three columns it needs", () => {
    expect(plan("when,what\n1,2").error).toBe("The first row needs the columns date, category and amount.");
  });
});

describe("writing a CSV file", () => {
  test("quotes cells that need it and round-trips through the reader", () => {
    const rows = [
      ["date", "note"],
      ["2026-11-01", 'Rice, 5kg "premium"'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
