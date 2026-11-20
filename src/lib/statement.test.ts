import { describe, expect, test } from "bun:test";
import { parseCsv } from "./csv";
import { choiceValue, decide, groupRows, planStatement, readDay, readPdfStatement, readStatement, type PlannedLine } from "./statement";

const read = (csv: string) => readStatement(parseCsv(csv));

describe("reading a date as banks write it", () => {
  test.each([
    ["2026-11-20", "2026-11-20"],
    ["2026-11-20 10:33:05", "2026-11-20"],
    ["11/20/2026", "2026-11-20"],
    ["11/20/2026 10:33 AM", "2026-11-20"],
    ["11/03/26", "2026-11-03"],
    ["20/11/2026", "2026-11-20"],
    ["20 Nov 2026", "2026-11-20"],
    ["20-Nov-26", "2026-11-20"],
    ["Nov 20, 2026", "2026-11-20"],
    ["November 3 2026", "2026-11-03"],
  ])("%s", (text, day) => {
    expect(readDay(text)).toBe(day);
  });

  test("turns down what is not a real date", () => {
    expect(readDay("02/30/2026")).toBeNull();
    expect(readDay("Total")).toBeNull();
    expect(readDay("")).toBeNull();
  });
});

describe("reading a statement", () => {
  test("finds the header under the lines a bank puts first, and reads debit and credit columns", () => {
    const s = read(
      [
        "Account Name,SAMPLE HOLDER",
        "Period,11/01/2026 to 11/30/2026",
        "Date,Description,Debit,Credit,Balance",
        '11/03/2026,POS PURCHASE GROCER,"1,250.50",,"8,749.50"',
        '11/05/2026,SALARY CREDIT,,"20,000.00","28,749.50"',
      ].join("\n"),
    );
    expect(s.error).toBeUndefined();
    expect(s.lines).toEqual([
      { line: 4, occurred_on: "2026-11-03", description: "POS PURCHASE GROCER", amount: -1250.5, balance: 8749.5 },
      { line: 5, occurred_on: "2026-11-05", description: "SALARY CREDIT", amount: 20000, balance: 28749.5 },
    ]);
  });

  test("reads one signed amount column, with brackets or a minus for money out", () => {
    const s = read("Transaction Date,Details,Amount\n2026-11-03,Coffee,(150.00)\n2026-11-04,Fare,-50\n2026-11-05,Refund,PHP 75.25");
    expect(s.lines.map((l) => l.amount)).toEqual([-150, -50, 75.25]);
    expect(s.lines.every((l) => l.balance === null)).toBe(true);
  });

  test("uses a type column to tell money in from money out", () => {
    const s = read("Date,Particulars,Amount,Type\n11/03/2026,Bills payment,500.00,Debit\n11/04/2026,Cash in,900.00,Credit");
    expect(s.lines.map((l) => l.amount)).toEqual([-500, 900]);
  });

  test("reads DR and CR written after the amount", () => {
    const s = read("Date,Description,Amount\n11/03/2026,Groceries,500.00 DR\n11/04/2026,Interest,1.25 CR");
    expect(s.lines.map((l) => l.amount)).toEqual([-500, 1.25]);
  });

  test("says so when no row names the columns", () => {
    expect(read("just,some,cells\n1,2,3").error).toMatch(/date/i);
  });

  test("lists lines it cannot read and passes over totals", () => {
    const s = read("Date,Description,Debit,Credit\nsoon,Mystery,10,\n11/03/2026,Nothing,,\n11/04/2026,Lunch,120,\n,Total,130,");
    expect(s.lines.map((l) => l.description)).toEqual(["Lunch"]);
    expect(s.skipped).toEqual([
      { line: 2, why: "the date is not one I can read" },
      { line: 3, why: "there is no amount" },
    ]);
  });

  test("takes the closing balance from the last line of a file that runs oldest first", () => {
    const s = read("Date,Description,Debit,Credit,Balance\n11/03/2026,A,100,,900\n11/03/2026,B,50,,850");
    expect(s.closing).toEqual({ balance: 850, on: "2026-11-03" });
  });

  test("takes the closing balance from the first line of a file that runs newest first", () => {
    const s = read("Date,Description,Debit,Credit,Balance\n11/03/2026,B,50,,850\n11/03/2026,A,100,,900");
    expect(s.closing).toEqual({ balance: 850, on: "2026-11-03" });
  });

  test("has no closing balance when the file has no balance column", () => {
    expect(read("Date,Description,Amount\n11/03/2026,A,-100").closing).toBeNull();
  });
});

describe("planning a statement import", () => {
  const accounts = [
    { id: "bank", name: "Main Bank", kind: "bank" as const },
    { id: "wallet", name: "PayWallet", kind: "ewallet" as const },
    { id: "cash", name: "Cash", kind: "cash" as const },
  ];
  const categories = [
    { id: "food", kind: "expense" as const },
    { id: "pay", kind: "income" as const },
    { id: "goal", kind: "saving" as const },
  ];
  const entry = (occurred_on: string, amount: number, category_id: string, note: string | null = null, account_id = "bank") => ({
    occurred_on,
    amount,
    category_id,
    note,
    account_id,
    to_account_id: null,
    category: { kind: categories.find((c) => c.id === category_id)!.kind },
  });
  const line = (occurred_on: string, amount: number, description = "Something") => ({ line: 2, occurred_on, description, amount, balance: null });
  const plan = (lines: ReturnType<typeof line>[], known: Partial<Parameters<typeof planStatement>[2]> = {}) =>
    planStatement(lines, "bank", { entries: [], transfers: [], accounts, categories, ...known });

  test("marks a line that is already logged on the account", () => {
    const [a, b] = plan([line("2026-11-03", -120), line("2026-11-04", -80)], { entries: [entry("2026-11-03", 120, "food")] });
    expect([a.logged, b.logged]).toEqual([true, false]);
  });

  test("an entry on another account does not count", () => {
    const [a] = plan([line("2026-11-03", -120)], { entries: [entry("2026-11-03", 120, "food", null, "cash")] });
    expect(a.logged).toBe(false);
  });

  test("one logged entry covers only one of two identical lines", () => {
    const planned = plan([line("2026-11-03", -50), line("2026-11-03", -50)], { entries: [entry("2026-11-03", 50, "food")] });
    expect(planned.map((l) => l.logged)).toEqual([true, false]);
  });

  test("income logged as income matches money in, not money out", () => {
    const planned = plan([line("2026-11-05", 20000), line("2026-11-05", -20000)], { entries: [entry("2026-11-05", 20000, "pay")] });
    expect(planned.map((l) => l.logged)).toEqual([true, false]);
  });

  test("matches an entry logged up to three days before the bank posted it", () => {
    const planned = plan([line("2026-11-06", -120), line("2026-11-20", -300)], {
      entries: [entry("2026-11-03", 120, "food"), entry("2026-11-10", 300, "food")],
    });
    expect(planned.map((l) => l.logged)).toEqual([true, false]);
  });

  test("a transfer logged from the other account counts as logged here", () => {
    const transfers = [{ from_account: "wallet", to_account: "bank", amount: 1000, occurred_on: "2026-11-03" }];
    const planned = plan([line("2026-11-03", 1000), line("2026-11-03", -1000)], { transfers });
    expect(planned.map((l) => l.logged)).toEqual([true, false]);
  });

  test("suggests a transfer when the line names another of your accounts", () => {
    const [out, into] = plan([line("2026-11-03", -500, "FUND TRANSFER TO PAYWALLET 0917"), line("2026-11-04", 200, "From paywallet")]);
    expect(out.suggestion).toEqual({ type: "account", id: "wallet" });
    expect(into.suggestion).toEqual({ type: "account", id: "wallet" });
  });

  test("does not read an account name inside a longer word", () => {
    const [a] = plan([line("2026-11-03", -500, "CASHIER CHEQUE FEE")]);
    expect(a.suggestion).toBeNull();
  });

  test("suggests the cash account for an ATM withdrawal", () => {
    const [a, b] = plan([line("2026-11-03", -2000, "ATM WITHDRAWAL 1234"), line("2026-11-03", 2000, "ATM REVERSAL")]);
    expect(a.suggestion).toEqual({ type: "account", id: "cash" });
    expect(b.suggestion).toBeNull();
  });

  test("suggests the category last used with the same note", () => {
    const entries = [entry("2026-10-01", 90, "goal", "Corner Cafe"), entry("2026-10-09", 95, "food", "Corner Cafe")];
    const [a] = plan([line("2026-11-03", -110, "POS CORNER CAFE MNL")], { entries });
    expect(a.suggestion).toEqual({ type: "category", id: "food" });
  });

  test("only suggests a category that fits the direction of the money", () => {
    const entries = [entry("2026-10-09", 95, "food", "Corner Cafe")];
    const [a] = plan([line("2026-11-03", 110, "CORNER CAFE REFUND")], { entries });
    expect(a.suggestion).toBeNull();
  });

  test("leaves a line it knows nothing about without a suggestion", () => {
    expect(plan([line("2026-11-03", -110, "UNKNOWN MERCHANT")])[0].suggestion).toBeNull();
  });

  describe("turning choices into what to save", () => {
    const planned = (occurred_on: string, amount: number, description: string): PlannedLine => ({
      ...line(occurred_on, amount, description),
      logged: false,
      suggestion: null,
    });
    const lines = [
      planned("2026-11-03", -110, "Lunch"),
      planned("2026-11-04", 20000, "Pay"),
      planned("2026-11-05", -500, "To wallet"),
      planned("2026-11-06", 300, "From wallet"),
      planned("2026-11-07", -40, "Later"),
    ];

    test("makes entries and transfers, and counts what is left for later", () => {
      const d = decide(lines, ["c:food", "c:pay", "a:wallet", "a:wallet", ""], "bank", categories, accounts);
      expect(d.problems).toEqual([]);
      expect(d.entries).toEqual([
        { category_id: "food", amount: 110, occurred_on: "2026-11-03", note: "Lunch", account_id: "bank" },
        { category_id: "pay", amount: 20000, occurred_on: "2026-11-04", note: "Pay", account_id: "bank" },
      ]);
      expect(d.transfers).toEqual([
        { from_account: "bank", to_account: "wallet", amount: 500, occurred_on: "2026-11-05", note: "To wallet" },
        { from_account: "wallet", to_account: "bank", amount: 300, occurred_on: "2026-11-06", note: "From wallet" },
      ]);
      expect(d.left).toBe(1);
    });

    test("turns down a category that does not fit the direction of the money", () => {
      const d = decide(lines.slice(0, 2), ["c:pay", "c:food"], "bank", categories, accounts);
      expect(d.entries).toEqual([]);
      expect(d.problems).toHaveLength(2);
    });

    test("turns down a transfer to the same account or to one that is not yours", () => {
      const d = decide(lines.slice(0, 2), ["a:bank", "a:nowhere"], "bank", categories, accounts);
      expect(d.transfers).toEqual([]);
      expect(d.problems).toHaveLength(2);
    });

    test("writes a suggestion the way a choice is sent", () => {
      expect(choiceValue({ type: "category", id: "food" })).toBe("c:food");
      expect(choiceValue({ type: "account", id: "wallet" })).toBe("a:wallet");
      expect(choiceValue(null)).toBe("");
    });
  });
});

describe("reading a statement saved as PDF", () => {
  // A piece of text at x, three units a character wide; or ending at a right edge, as amounts do.
  const cell = (x: number, s: string, right?: number) => {
    const w = s.replace(/ /g, "").length * 3;
    return { x: right === undefined ? x : right - w, w, s };
  };
  const row = (y: number, ...cells: ReturnType<typeof cell>[]) => ({ y, cells });
  const spaced = (text: string) => text.split("").join(" ");

  // One row a transaction, amounts set right under their headings, a date with no year,
  // every glyph followed by a space, and the heading repeated on each page.
  const oneRowHeader = (y: number) =>
    row(y, cell(36, spaced("DATE")), cell(97, spaced("DESCRIPTION")), cell(200, spaced("REF")), cell(266, spaced("DETAILS")),
      cell(376, spaced("DEBITAMOUNT")), cell(445, spaced("CREDITAMOUNT")), cell(522, spaced("BALANCE")));
  const oneRow = (y: number, month: string, day: string, what: string[], ref: string, details: string, debit: string, credit: string, balance: string) =>
    row(y, cell(36, spaced(month)), cell(50, spaced(day)), ...what.map((w, i) => cell(65 + i * 40, spaced(w))), cell(202, spaced(ref)), cell(223, spaced(details)),
      ...(debit ? [cell(0, spaced(debit), 431)] : []), ...(credit ? [cell(0, spaced(credit), 502)] : []), cell(0, spaced(balance), 574));
  const oneRowPages = [
    [
      row(700, cell(36, spaced("ACCOUNTSUMMARYFORTHEPERIOD")), cell(232, spaced("NOV")), cell(256, spaced("28,")), cell(273, spaced("2026")),
        cell(298, spaced("-JAN")), cell(329, spaced("05,")), cell(346, spaced("2027"))),
      row(650, cell(43, spaced("BeginningBalance")), cell(0, spaced("100.00"), 337)),
    ],
    [
      row(660, cell(36, spaced("SAMPLEBRANCH")), cell(518, spaced("Page")), cell(536, "2")),
      oneRowHeader(628),
      row(598, cell(65, spaced("BEGINNINGBALANCE")), cell(0, spaced("100.00"), 574)),
      oneRow(582, "Nov", "30", ["0123", "PAYROLL"], "001", "INTER-BANK", "", "20,000.00", "20,100.00"),
      oneRow(574, "Dec", "02", ["Bills", "Payment"], "0456", "TO:POWERCO", "1,500.50", "", "18,599.50"),
    ],
    [
      row(660, cell(36, spaced("SAMPLEBRANCH")), cell(518, spaced("Page")), cell(536, "3")),
      oneRowHeader(628),
      oneRow(582, "Jan", "03", ["WITHDRAWAL"], "789", "ATM", "2,000.00", "", "16,599.50"),
      row(558, cell(65, spaced("ENDINGBALANCE")), cell(0, spaced("16,599.50"), 574)),
      row(542, cell(65, spaced("TOTAL")), cell(90, spaced("DEBIT")), cell(0, spaced("3,500.50"), 431)),
      row(534, cell(65, spaced("TOTAL")), cell(90, spaced("CREDIT")), cell(0, spaced("20,000.00"), 502)),
    ],
  ];

  test("reads a table with one row a transaction, closing up spaced-out letters", () => {
    const s = readPdfStatement(oneRowPages);
    expect(s.error).toBeUndefined();
    expect(s.lines).toEqual([
      { line: 1, occurred_on: "2026-11-30", description: "0123 PAYROLL INTER-BANK", amount: 20000, balance: 20100 },
      { line: 2, occurred_on: "2026-12-02", description: "Bills Payment TO:POWERCO", amount: -1500.5, balance: 18599.5 },
      { line: 3, occurred_on: "2027-01-03", description: "WITHDRAWAL ATM", amount: -2000, balance: 16599.5 },
    ]);
    expect(s.skipped).toEqual([]);
  });

  test("takes the year from the statement period when the dates have none, across a new year", () => {
    expect(readPdfStatement(oneRowPages).lines.map((l) => l.occurred_on.slice(0, 4))).toEqual(["2026", "2026", "2027"]);
  });

  test("leaves out beginning balance, ending balance and totals, and finds the closing balance", () => {
    const s = readPdfStatement(oneRowPages);
    expect(s.lines).toHaveLength(3);
    expect(s.closing).toEqual({ balance: 16599.5, on: "2027-01-03" });
    expect(s.opening).toBe(100);
  });

  // Three rows a transaction: the date and the start of the description, then the amounts
  // with "null" in the empty column, then the time and the rest of the description.
  // Amounts start where their headings start. Later pages have no heading. Newest first.
  const threeRows = (y: number, date: string, time: string, what: [string, string], debit: string, credit: string, balance: string) => [
    row(y, cell(38, date), ...(what[0] ? [cell(146, what[0])] : [])),
    row(y - 10, ...(what[0] ? [] : [cell(146, what[1])]), cell(254, debit), cell(362, credit), cell(470, balance)),
    row(y - 18, cell(38, time), ...(what[0] ? [cell(146, what[1])] : [])),
  ];
  const threeRowPages = [
    [
      row(738, cell(36, "Account Statement")),
      row(598, cell(36, "Account No:"), cell(98, "0000000000")),
      row(510, cell(38, "Date"), cell(146, "Description"), cell(254, "Debit"), cell(362, "Credit"), cell(470, "Balance")),
      ...threeRows(486, "25/11/2026", "14:02:11", ["ONLINE", "PAYMENT SHOP"], "250.00", "null", "9750.00"),
      ...threeRows(444, "14/11/2026", "09:15:40", ["", "POS STORE"], "1000.00", "null", "10000.00"),
    ],
    [...threeRows(736, "05/11/2026", "08:00:00", ["ATM PAYROLL", "CR"], "null", "11000.00", "11000.00")],
  ];

  test("reads a table with three rows a transaction, day before month", () => {
    const s = readPdfStatement(threeRowPages);
    expect(s.error).toBeUndefined();
    expect(s.lines).toEqual([
      { line: 1, occurred_on: "2026-11-25", description: "ONLINE PAYMENT SHOP", amount: -250, balance: 9750 },
      { line: 2, occurred_on: "2026-11-14", description: "POS STORE", amount: -1000, balance: 10000 },
      { line: 3, occurred_on: "2026-11-05", description: "ATM PAYROLL CR", amount: 11000, balance: 11000 },
    ]);
  });

  test("reads every date day first once one date can only be read that way", () => {
    expect(readPdfStatement(threeRowPages).lines[2].occurred_on).toBe("2026-11-05");
  });

  test("finds the closing and opening balance of a statement that runs newest first", () => {
    const s = readPdfStatement(threeRowPages);
    expect(s.closing).toEqual({ balance: 9750, on: "2026-11-25" });
    expect(s.opening).toBe(0);
  });

  test("does not take text far below the last transaction as part of it", () => {
    const pages = [[...threeRowPages[0], row(60, cell(38, "Page 1 of 2"))], threeRowPages[1]];
    expect(readPdfStatement(pages).lines[1].description).toBe("POS STORE");
  });

  test("reads a date that runs straight into the description", () => {
    const pages = [[
      row(510, cell(38, "Date and Time"), cell(146, "Description"), cell(362, "Amount"), cell(470, "Balance")),
      row(486, cell(38, "2026-11-25 02:15 PM Send Money"), cell(362, "-250.00"), cell(470, "750.00")),
    ]];
    expect(readPdfStatement(pages).lines).toEqual([
      { line: 1, occurred_on: "2026-11-25", description: "02:15 PM Send Money", amount: -250, balance: 750 },
    ]);
  });

  test("reads a description that wraps onto the line above the dated row as well as below", () => {
    const head = row(748, cell(50, "Date and Time"), cell(211, "Description"), cell(341, "Reference No."), cell(427, "Debit"), cell(476, "Credit"), cell(524, "Balance"));
    const pages = [[
      head,
      row(738, cell(126, "STARTING BALANCE"), cell(0, "100.00", 543)),
      row(728, cell(50, "2026-11-03 09:15 AM"), cell(126, "Buy Load"), cell(329, "1234567890123"), cell(0, "50.00", 440), cell(0, "50.00", 543)),
      row(706, cell(126, "Received money from Sample Bank account ending in")),
      row(702, cell(50, "2026-11-03 02:40 PM"), cell(329, "1234567890124"), cell(0, "1000.00", 492), cell(0, "1050.00", 543)),
      row(698, cell(126, "4321")),
      row(688, cell(50, "2026-11-04 08:00 AM"), cell(126, "Payment to Store"), cell(329, "1234567890125"), cell(0, "20.00", 440), cell(0, "1030.00", 543)),
      row(676, cell(126, "ENDING BALANCE"), cell(0, "1030.00", 543)),
      row(666, cell(126, "Total Debit"), cell(0, "70.00", 440)),
    ]];
    expect(readPdfStatement(pages).lines).toEqual([
      { line: 1, occurred_on: "2026-11-03", description: "Buy Load", amount: -50, balance: 50 },
      { line: 2, occurred_on: "2026-11-03", description: "Received money from Sample Bank account ending in 4321", amount: 1000, balance: 1050 },
      { line: 3, occurred_on: "2026-11-04", description: "Payment to Store", amount: -20, balance: 1030 },
    ]);
  });

  const walletHead = row(748, cell(50, "Date and Time"), cell(211, "Description"), cell(341, "Reference No."), cell(427, "Debit"), cell(476, "Credit"), cell(524, "Balance"));

  test("keeps a description that ends right beside the reference number", () => {
    const long = "Payment to Store, Merchant Transaction Number: A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
    const pages = [[
      walletHead,
      row(728, cell(50, "2026-11-03 09:15 AM"), { x: 126, w: 200, s: long }, cell(329, "1234567890123"), cell(0, "50.00", 440), cell(0, "50.00", 543)),
    ]];
    expect(readPdfStatement(pages).lines[0].description).toBe(long);
  });

  test("reads amounts printed on the line just above the date", () => {
    const pages = [[
      walletHead,
      row(293, cell(50, "2026-11-03 09:15 AM"), cell(126, "Buy Load"), cell(329, "1234567890123"), cell(0, "50.00", 440), cell(0, "950.00", 543)),
      row(282.4, cell(126, "Payment to Store, Merchant Transaction Number:"), cell(329, "1234567890124"), cell(0, "120.00", 440), cell(0, "830.00", 543)),
      row(278.2, cell(50, "2026-11-03 09:20 AM")),
      row(275.1, cell(126, "A1b2C3")),
      row(262.5, cell(50, "2026-11-03 09:30 AM"), cell(126, "Buy Load"), cell(329, "1234567890125"), cell(0, "30.00", 440), cell(0, "800.00", 543)),
    ]];
    const s = readPdfStatement(pages);
    expect(s.skipped).toEqual([]);
    expect(s.lines.map((l) => [l.description, l.amount, l.balance])).toEqual([
      ["Buy Load", -50, 950],
      ["Payment to Store, Merchant Transaction Number: A1b2C3", -120, 830],
      ["Buy Load", -30, 800],
    ]);
  });

  test("groups the text of a page into rows by its baseline", () => {
    const item = (x: number, y: number, str: string) => ({ str, width: str.length * 3, transform: [1, 0, 0, 1, x, y] });
    const rows = groupRows([item(146, 485.6, "ONLINE"), item(38, 486, "25/11/2026"), item(38, 468, "14:02:11"), item(300, 468.4, " "), item(254, 476, "250.00")]);
    expect(rows.map((r) => r.cells.map((c) => c.s))).toEqual([["25/11/2026", "ONLINE"], ["250.00"], ["14:02:11"]]);
    expect(rows[0].cells[0]).toEqual({ x: 38, w: 30, s: "25/11/2026" });
  });

  test("says so when no page has a row naming the columns", () => {
    expect(readPdfStatement([[row(700, cell(36, "Some letter")), row(680, cell(36, "with no table"))]]).error).toMatch(/columns/i);
  });

  test("says so when the dates have no year and the statement does not give one", () => {
    const pages = [[oneRowHeader(628), oneRow(582, "Nov", "30", ["PAYROLL"], "001", "X", "", "5.00", "5.00")]];
    expect(readPdfStatement(pages).error).toMatch(/year/i);
  });
});
