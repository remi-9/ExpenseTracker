"use server";
// The only file that writes to Supabase. Forms post straight to these.
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./config";
import { parseCsv, planImport } from "./csv";
import { parseAmount, today, yesterday } from "./format";
import {
  getAccounts,
  getAllTransactions,
  getAllTransfers,
  getBills,
  getCaught,
  getCategories,
  getDemoEdits,
  getMonthTotals,
  getTeam,
} from "./data";
import { DEMO_LIMIT, DEMO_TRANSFER_LIMIT, encodeEdits, type DemoEdits } from "./demo";
import { PATTERNS, TONES } from "./backdrop";
import { balanceGap, balanceOn, dueDate } from "./money";
import { FRAMES, SPEEDS } from "./options";
import { DEFAULT_ICON, MAX_DEX, PARTNERS, PRESETS, TRAINERS } from "./partners";
import type { Run, RunSummary } from "./run";
import { decide, planStatement, readPdfStatement, readStatement, type PdfRow, type PlannedLine } from "./statement";
import type { AccountKind, Kind } from "./types";
import { createClient } from "./supabase/server";

const fail = (path: string, message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);

async function db(path: string) {
  if (!isSupabaseConfigured) fail(path, "Demo mode: connect Supabase to save changes.");
  return createClient();
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const YEAR = 60 * 60 * 24 * 365;
/** A short id for something added in demo mode. */
const demoId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

type Entry = {
  category_id: string;
  amount: number;
  occurred_on: string;
  note: string | null;
  account_id: string | null;
  to_account_id: string | null;
  bill_id: string | null;
};

const writeDemo = async (edits: DemoEdits) =>
  (await cookies()).set("demo", encodeEdits(edits), { maxAge: YEAR, sameSite: "lax" });

/** Reads the entry form. Sends the user back with a message if something is missing. */
async function readEntry(form: FormData, back: string): Promise<Entry> {
  const kind = text(form, "kind");
  // The form has one list of categories per kind; the checked one for the chosen kind counts.
  const category_id = text(form, `category_${kind}`) || text(form, "category_id");
  const amount = parseAmount(text(form, "amount"));
  if (!category_id) fail(back, "Pick a category.");
  if (amount === null) fail(back, "Enter an amount, like 1500 or 1200+350.");
  if (amount! <= 0) fail(back, "The amount has to be above zero.");

  const when = text(form, "when");
  const occurred_on = when === "yesterday" ? yesterday() : when === "today" ? today() : text(form, "occurred_on") || today();
  if (!isDate(occurred_on)) fail(back, "That date is not one I can read.");
  const account_id = text(form, "account") || null;
  // Savings can be moved to another account; anything else stays with the one account.
  const to = kind === "saving" ? text(form, "to_account") : "";
  return {
    category_id,
    amount: amount!,
    occurred_on,
    note: text(form, "note") || null,
    account_id,
    to_account_id: to && to !== account_id ? to : null,
    bill_id: text(form, "bill_id") || null,
  };
}

/** Saves a new entry and returns its id. Demo mode keeps it in a cookie instead. */
async function insertEntry(entry: Entry, back: string): Promise<string> {
  if (!isSupabaseConfigured) {
    const edits = await getDemoEdits();
    const id = demoId("mine");
    await writeDemo({ ...edits, added: [...edits.added, { id, ...entry }].slice(-DEMO_LIMIT) });
    return id;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions").insert(entry).select("id").single();
  if (error) fail(back, error.message);
  revalidatePath("/", "layout");
  return data!.id as string;
}

async function removeEntry(id: string, back: string) {
  if (!isSupabaseConfigured) {
    const edits = await getDemoEdits();
    const mine = edits.added.some((e) => e.id === id);
    return writeDemo({
      ...edits,
      added: edits.added.filter((e) => e.id !== id),
      removed: mine ? edits.removed : [...edits.removed, id],
    });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) fail(back, error.message);
  revalidatePath("/", "layout");
}

/**
 * Where to land after a save, with what the page needs to play the result and keep
 * your choices. Entries logged from Home play their result there; the rest on Log.
 */
async function afterSave(entry: Entry, id: string, from?: string): Promise<never> {
  const kind = (await getCategories()).find((c) => c.id === entry.category_id)?.kind ?? "expense";
  const result = new URLSearchParams({
    m: entry.occurred_on.slice(0, 7),
    kind,
    cat: entry.category_id,
    saved: String(entry.amount),
    id,
    t: String(Date.now()),
  });
  if (entry.account_id) result.set("acct", entry.account_id);
  return redirect(`${from === "home" ? "/" : "/log"}?${result}`);
}

export async function addTransaction(form: FormData) {
  const from = text(form, "from");
  const back = from === "home" ? "/" : "/log";
  const entry = await readEntry(form, back);
  return afterSave(entry, await insertEntry(entry, back), from);
}

/** Pay a bill from the bills list: its category and account, the amount typed, on the date chosen. */
export async function payBill(form: FormData) {
  const month = text(form, "m");
  const back = `/log?m=${month}`;
  const bill = (await getBills()).find((b) => b.id === text(form, "bill_id"));
  if (!bill) fail(back, "That bill no longer exists.");
  const amount = parseAmount(text(form, "amount"));
  if (amount === null || amount <= 0) fail(back, "Enter an amount, like 1500.");
  const typed = text(form, "occurred_on");
  const entry: Entry = {
    category_id: bill!.category_id,
    amount: amount!,
    // Today when paying this month's bill; its due date when catching up on another month.
    occurred_on: isDate(typed) ? typed : today().startsWith(month) || !month ? today() : dueDate(bill!, month),
    note: bill!.name,
    account_id: text(form, "account") || bill!.account_id,
    to_account_id: null,
    bill_id: bill!.id,
  };
  return afterSave(entry, await insertEntry(entry, back));
}

export async function updateTransaction(form: FormData) {
  const id = text(form, "id");
  const back = `/log?m=${text(form, "m")}&edit=${id}`;
  const entry = await readEntry(form, back);
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("transactions").update(entry).eq("id", id);
    if (error) fail(back, error.message);
    revalidatePath("/", "layout");
  } else {
    // Demo entries live in a cookie: swap the old one for the edited one.
    const edits = await getDemoEdits();
    const mine = edits.added.some((e) => e.id === id);
    await writeDemo({
      ...edits,
      added: [...edits.added.filter((e) => e.id !== id), { id: demoId("mine"), ...entry }].slice(-DEMO_LIMIT),
      removed: mine ? edits.removed : [...edits.removed, id],
    });
  }
  redirect(`/log?m=${entry.occurred_on.slice(0, 7)}&done=updated`);
}

/** Toss an entry. `undo=1` is the Undo button right after a save, which lands back where it was logged. */
export async function deleteTransaction(form: FormData) {
  const month = text(form, "m");
  const home = text(form, "from") === "home";
  await removeEntry(text(form, "id"), home ? "/" : `/log?m=${month}`);
  redirect(home ? "/" : `/log?m=${month}&done=${form.get("undo") ? "undone" : "tossed"}`);
}

// ---- Categories --------------------------------------------------------------------

export async function addCategory(form: FormData) {
  const supabase = await db("/setup");
  const name = text(form, "name");
  const target = text(form, "monthly_target");
  if (!name) fail("/setup", "Give the category a name.");

  const kind = text(form, "kind") as Kind;
  const { error } = await supabase.from("categories").insert({
    name,
    kind,
    icon: text(form, "emoji") || text(form, "icon") || DEFAULT_ICON[kind],
    monthly_target: target ? Number(target) : null,
  });
  if (error) {
    fail("/setup", error.code === "23505" ? `"${name}" already exists.` : error.message);
  }
  revalidatePath("/", "layout");
  redirect("/setup");
}

/** One-tap category from the PRESETS list. */
export async function addPreset(form: FormData) {
  const supabase = await db("/setup");
  const preset = PRESETS[Number(text(form, "preset"))];
  if (!preset) fail("/setup", "That preset no longer exists.");
  const { error } = await supabase.from("categories").insert({ ...preset });
  if (error) fail("/setup", error.code === "23505" ? `"${preset.name}" already exists.` : error.message);
  revalidatePath("/", "layout");
  redirect("/setup");
}

/** Archive hides a category from forms but keeps its history. Unarchive brings it back. */
export async function setCategoryArchived(form: FormData) {
  const supabase = await db("/setup");
  const { error } = await supabase
    .from("categories")
    .update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null })
    .eq("id", text(form, "id"));
  if (error) fail("/setup", error.message);
  revalidatePath("/", "layout");
  redirect("/setup");
}

// ---- Accounts and transfers ----------------------------------------------------------

const ACCOUNT_KINDS: AccountKind[] = ["bank", "ewallet", "cash", "card"];
const DEFAULT_ACCOUNT_ICON: Record<AccountKind, string> = {
  bank: "pkmn-143",
  ewallet: "pkmn-137",
  cash: "pkmn-52",
  card: "pkmn-352",
};

/** Add an account, or change one when the form carries its id. */
export async function saveAccount(form: FormData) {
  const supabase = await db("/accounts");
  const id = text(form, "id");
  const back = id ? `/accounts?a=${id}` : "/accounts?new=1";
  const name = text(form, "name");
  if (!name) fail(back, "Give the account a name.");
  const kind = ACCOUNT_KINDS.find((k) => k === text(form, "kind")) ?? "bank";
  // An opening balance can be negative: a credit card that already carries a debt.
  const opening = Number(text(form, "opening_balance").replace(/[\s,₱]/g, "") || 0);
  if (!Number.isFinite(opening)) fail(back, "The opening balance has to be a number.");

  const row = { name, kind, icon: text(form, "icon") || DEFAULT_ACCOUNT_ICON[kind], opening_balance: opening };
  const { error } = id
    ? await supabase.from("accounts").update(row).eq("id", id)
    : await supabase.from("accounts").insert(row);
  if (error) fail(back, error.code === "23505" ? `"${name}" already exists.` : error.message);
  revalidatePath("/", "layout");
  redirect(id ? `/accounts?a=${id}` : "/accounts");
}

/** Archive hides an account from forms but keeps its history and balance. */
export async function setAccountArchived(form: FormData) {
  const supabase = await db("/accounts");
  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null })
    .eq("id", text(form, "id"));
  if (error) fail("/accounts", error.message);
  revalidatePath("/", "layout");
  redirect("/accounts");
}

/** Move money between two of your accounts. */
export async function addTransfer(form: FormData) {
  const back = "/accounts?move=1";
  const from_account = text(form, "from_account");
  const to_account = text(form, "to_account");
  const amount = parseAmount(text(form, "amount"));
  const occurred_on = text(form, "occurred_on") || today();
  if (!from_account || !to_account) fail(back, "Pick the account to move from and the one to move to.");
  if (from_account === to_account) fail(back, "Pick two different accounts.");
  if (amount === null || amount <= 0) fail(back, "Enter an amount above zero.");
  if (!isDate(occurred_on)) fail(back, "That date is not one I can read.");
  const transfer = { from_account, to_account, amount: amount!, occurred_on, note: text(form, "note") || null };

  if (!isSupabaseConfigured) {
    const edits = await getDemoEdits();
    await writeDemo({ ...edits, transfers: [...edits.transfers, { id: demoId("tr"), ...transfer }].slice(-DEMO_TRANSFER_LIMIT) });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("transfers").insert(transfer);
    if (error) fail(back, error.message);
    revalidatePath("/", "layout");
  }
  redirect("/accounts?done=moved");
}

export async function deleteTransfer(form: FormData) {
  const id = text(form, "id");
  if (!isSupabaseConfigured) {
    const edits = await getDemoEdits();
    await writeDemo({ ...edits, transfers: edits.transfers.filter((t) => t.id !== id) });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("transfers").delete().eq("id", id);
    if (error) fail("/accounts", error.message);
    revalidatePath("/", "layout");
  }
  redirect("/accounts?done=unmoved");
}

/**
 * Log the difference between what an account really holds and what the entries add
 * up to, as one entry: spending when it holds less, income when it holds more.
 */
export async function logBalanceGap(form: FormData) {
  const id = text(form, "account");
  const typed = text(form, "actual");
  const on = text(form, "on") || today();
  const back = `/accounts?a=${id}&check=1&actual=${encodeURIComponent(typed)}&on=${on}`;
  const actual = parseAmount(typed.replace(/^-/, ""));
  if (actual === null || !isDate(on)) fail(`/accounts?a=${id}&check=1`, "Enter what the account holds, and a date.");
  const [accounts, categories, entries, transfers] = await Promise.all([
    getAccounts(),
    getCategories(),
    getAllTransactions(),
    getAllTransfers(),
  ]);
  const account = accounts.find((a) => a.id === id);
  if (!account) fail("/accounts", "That account is gone.");
  const gap = balanceGap(balanceOn(account!, entries, transfers, on), typed.startsWith("-") ? -actual! : actual!);
  if (gap.state === "match") redirect(`/accounts?a=${id}&done=matches`);

  const category = categories.find((c) => c.id === text(form, "category_id"));
  const kind = gap.state === "short" ? "expense" : "income";
  if (category?.kind !== kind) fail(back, `Pick ${kind === "expense" ? "a spending" : "an income"} category for the difference.`);
  await insertEntry(
    { category_id: category!.id, amount: gap.amount, occurred_on: on, note: "Balance check", account_id: id, to_account_id: null, bill_id: null },
    back,
  );
  redirect(`/accounts?a=${id}&done=checked`);
}

// ---- Bills -------------------------------------------------------------------------

/** Add a bill, or change one when the form carries its id. */
export async function saveBill(form: FormData) {
  const supabase = await db("/bills");
  const id = text(form, "id");
  const back = id ? `/bills?b=${id}` : "/bills?new=1";
  const name = text(form, "name");
  const category_id = text(form, "category_id");
  const typed = text(form, "amount");
  const amount = typed ? parseAmount(typed) : null;
  const due_day = Number(text(form, "due_day"));
  const yearly = text(form, "cadence") === "yearly";
  const due_month = Number(text(form, "due_month"));
  if (!name) fail(back, "Give the bill a name.");
  if (!category_id) fail(back, "Pick the category it is logged under.");
  if (typed && (amount === null || amount <= 0)) fail(back, "Enter an amount above zero, or leave it empty if it varies.");
  if (!(due_day >= 1 && due_day <= 31)) fail(back, "The due day is a day of the month, 1 to 31.");
  if (yearly && !(due_month >= 1 && due_month <= 12)) fail(back, "Pick the month a yearly bill falls due.");

  const row = {
    name,
    category_id,
    account_id: text(form, "account") || null,
    amount,
    due_day,
    cadence: yearly ? "yearly" : "monthly",
    due_month: yearly ? due_month : null,
  };
  const { error } = id ? await supabase.from("bills").update(row).eq("id", id) : await supabase.from("bills").insert(row);
  if (error) fail(back, error.message);
  revalidatePath("/", "layout");
  redirect("/bills");
}

/** Archive takes a bill off the list but keeps the entries that paid it. */
export async function setBillArchived(form: FormData) {
  const supabase = await db("/bills");
  const { error } = await supabase
    .from("bills")
    .update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null })
    .eq("id", text(form, "id"));
  if (error) fail("/bills", error.message);
  revalidatePath("/", "layout");
  redirect("/bills");
}

// ---- Import ------------------------------------------------------------------------

export type ImportResult = {
  /** What was found, or what went wrong. */
  message: string;
  ok: boolean;
  /** Lines that were left out, each with the reason. */
  skipped: string[];
  /** Entries were saved, so the form can clear. */
  imported?: boolean;
};

/**
 * Check a CSV file, or import it when the form's `mode` is "import". Categories and
 * accounts named in the file that do not exist yet are created along the way.
 */
export async function importCsv(_: ImportResult | null, form: FormData): Promise<ImportResult> {
  const [categories, accounts] = await Promise.all([getCategories(), getAccounts()]);
  const plan = planImport(parseCsv(text(form, "csv")), categories, accounts);
  const skipped = plan.skipped.slice(0, 20).map((s) => `Line ${s.line}: ${s.why}.`);
  if (plan.error) return { ok: false, message: plan.error, skipped };
  if (plan.entries.length === 0) return { ok: false, message: "There are no entries to import in that file.", skipped };

  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const extras = [
    plan.newCategories.length > 0 && `${count(plan.newCategories.length, "new category", "new categories")} (${plan.newCategories.map((c) => c.name).join(", ")})`,
    plan.newAccounts.length > 0 && `${count(plan.newAccounts.length, "new account")} (${plan.newAccounts.join(", ")})`,
    plan.skipped.length > 0 && `${count(plan.skipped.length, "line")} skipped`,
  ].filter(Boolean);
  const found = `${count(plan.entries.length, "entry", "entries")}${extras.length ? `, ${extras.join(", ")}` : ""}`;

  if (text(form, "mode") !== "import") return { ok: true, message: `Ready to import: ${found}.`, skipped };
  if (!isSupabaseConfigured) return { ok: false, message: "Demo mode: connect Supabase to import entries.", skipped };

  const supabase = await createClient();
  if (plan.newCategories.length > 0) {
    const { error } = await supabase
      .from("categories")
      .insert(plan.newCategories.map((c) => ({ ...c, icon: DEFAULT_ICON[c.kind] })));
    if (error) return { ok: false, message: error.message, skipped };
  }
  if (plan.newAccounts.length > 0) {
    const { error } = await supabase.from("accounts").insert(plan.newAccounts.map((name) => ({ name })));
    if (error) return { ok: false, message: error.message, skipped };
  }
  const [cats, accts] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase.from("accounts").select("id, name"),
  ]);
  if (cats.error || accts.error) return { ok: false, message: (cats.error ?? accts.error)!.message, skipped };
  const categoryId = new Map(cats.data.map((c) => [c.name as string, c.id as string]));
  const accountId = new Map(accts.data.map((a) => [a.name as string, a.id as string]));

  const rows = plan.entries.map((e) => ({
    category_id: categoryId.get(e.category)!,
    amount: e.amount,
    occurred_on: e.occurred_on,
    note: e.note,
    account_id: e.account ? (accountId.get(e.account) ?? null) : null,
  }));
  for (let at = 0; at < rows.length; at += 500) {
    const { error } = await supabase.from("transactions").insert(rows.slice(at, at + 500));
    if (error) {
      return { ok: false, message: `Stopped after ${at} entries: ${error.message}`, skipped };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, imported: true, message: `Imported ${found}.`, skipped };
}

export type StatementResult = {
  message: string;
  ok: boolean;
  /** Lines that could not be read, each with the reason. */
  skipped: string[];
  /** The statement set against what is logged, for choosing what each line is. */
  lines?: PlannedLine[];
  /** Tells one reading of a file from the next, so choices are kept while it is the same reading. */
  token?: string;
  /** Where the statement ends, and what the entries add up to for that day. */
  closing?: { balance: number; on: string; expected: number };
  imported?: boolean;
};

/**
 * Read a statement for one account and set it against what is already logged, or,
 * when the form's `mode` is "import", save the lines that were given a category or
 * an account. Lines left without a choice are not saved and show up again next time.
 */
export async function importStatement(_: StatementResult | null, form: FormData): Promise<StatementResult> {
  const accountId = text(form, "account");
  const [categories, accounts, entries, transfers] = await Promise.all([
    getCategories(),
    getAccounts(),
    getAllTransactions(),
    getAllTransfers(),
  ]);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, message: "That account is gone.", skipped: [] };

  // A PDF arrives as the text of its pages, already taken out of the file in the browser.
  const pdf = text(form, "pdf");
  let pages: PdfRow[][] | null = null;
  if (pdf) {
    try {
      const parsed: unknown = JSON.parse(pdf);
      const isPage = (page: unknown) =>
        Array.isArray(page) && page.every((row) => typeof row?.y === "number" && Array.isArray(row?.cells) && row.cells.every((c: PdfRow["cells"][number]) => typeof c?.x === "number" && typeof c?.w === "number" && typeof c?.s === "string"));
      if (Array.isArray(parsed) && parsed.every(isPage)) pages = parsed as PdfRow[][];
    } catch {
      // Falls through to the message below.
    }
    if (!pages) return { ok: false, message: "That PDF could not be read. Choose the file again.", skipped: [] };
  }
  const statement = pages ? readPdfStatement(pages) : readStatement(parseCsv(text(form, "csv")));
  const skipped = statement.skipped.slice(0, 20).map((s) => `Line ${s.line}: ${s.why}.`);
  if (statement.error) return { ok: false, message: statement.error, skipped };
  if (statement.lines.length === 0) return { ok: false, message: "There are no lines with a date and an amount in that file.", skipped };

  const usable = { categories: categories.filter((c) => !c.archived_at), accounts: accounts.filter((a) => !a.archived_at) };
  const lines = planStatement(statement.lines, accountId, { entries, transfers, ...usable });
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const fresh = lines.filter((l) => !l.logged).length;
  /** The statement's last balance beside what the entries, and anything about to be saved, add up to that day. */
  const closingWith = (more: Pick<ReturnType<typeof decide>, "entries" | "transfers">) => {
    if (!statement.closing) return undefined;
    const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
    const added = more.entries.map((e) => ({ ...e, to_account_id: null, category: { kind: kindOf.get(e.category_id)! } }));
    const expected = balanceOn(account, [...entries, ...added], [...transfers, ...more.transfers], statement.closing.on);
    return { ...statement.closing, expected };
  };

  if (text(form, "mode") !== "import") {
    return {
      ok: true,
      message: `${count(lines.length, "line")} read: ${fresh} new, ${lines.length - fresh} already logged.`,
      skipped,
      lines,
      token: String(Date.now()),
      closing: fresh === 0 ? closingWith({ entries: [], transfers: [] }) : undefined,
    };
  }

  const token = text(form, "token");
  const choices = lines.map((_, i) => text(form, `choice_${i}`));
  const decided = decide(lines, choices, accountId, usable.categories, usable.accounts);
  const later = lines.filter((line, i) => !line.logged && !choices[i]).length;
  if (decided.problems.length > 0) return { ok: false, message: decided.problems.slice(0, 5).join(" "), skipped, lines, token };
  if (decided.entries.length + decided.transfers.length === 0) {
    return { ok: false, message: "Nothing is chosen yet. Give at least one line a category or an account.", skipped, lines, token };
  }
  if (!isSupabaseConfigured) return { ok: false, message: "Demo mode: connect Supabase to import a statement.", skipped, lines, token };

  const supabase = await createClient();
  for (let at = 0; at < decided.entries.length; at += 500) {
    const { error } = await supabase.from("transactions").insert(decided.entries.slice(at, at + 500));
    if (error) return { ok: false, message: `Stopped after ${at} entries: ${error.message}`, skipped };
  }
  if (decided.transfers.length > 0) {
    const { error } = await supabase.from("transfers").insert(decided.transfers);
    if (error) return { ok: false, message: `The entries were saved, but the transfers were not: ${error.message}`, skipped };
  }
  revalidatePath("/", "layout");
  const saved = [
    decided.entries.length > 0 && count(decided.entries.length, "entry", "entries"),
    decided.transfers.length > 0 && count(decided.transfers.length, "transfer"),
  ].filter(Boolean);
  return {
    ok: true,
    imported: true,
    message: `Imported ${saved.join(" and ")} into ${account.name}.${later > 0 ? ` ${count(later, "new line")} left for later.` : ""}`,
    skipped,
    closing: closingWith(decided),
  };
}

export async function signIn(form: FormData) {
  const supabase = await db("/login");
  const email = text(form, "email").toLowerCase();
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (allowed && email !== allowed) fail("/login", "That email can't sign in here.");

  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) fail("/login", error.message);
  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await db("/");
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Save who you are playing as. It goes to the `players` table so it follows you
 * between devices, and to a cookie, which is all demo mode has.
 */
async function savePlayer(choice: { partner?: string; trainer?: string; team?: number[] }) {
  const jar = await cookies();
  if (choice.partner) jar.set("partner", choice.partner, { maxAge: YEAR, sameSite: "lax" });
  if (choice.trainer) jar.set("trainer", choice.trainer, { maxAge: YEAR, sameSite: "lax" });
  if (choice.team) jar.set("team", choice.team.join("."), { maxAge: YEAR, sameSite: "lax" });
  if (!isSupabaseConfigured) return;
  const supabase = await createClient();
  // The first save carries over whatever this browser had chosen so far.
  const row = {
    partner: choice.partner ?? jar.get("partner")?.value ?? null,
    trainer: choice.trainer ?? jar.get("trainer")?.value ?? null,
    team: choice.team ?? (await getTeam()),
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from("players").select("user_id").maybeSingle();
  if (existing) await supabase.from("players").update({ ...choice, updated_at: row.updated_at }).eq("user_id", existing.user_id);
  else await supabase.from("players").insert(row);
  revalidatePath("/", "layout");
}

export async function choosePartner(form: FormData) {
  const id = text(form, "partner");
  const caught = id.startsWith("dex:") && (await getCaught()).includes(Number(id.slice(4)));
  if (caught || PARTNERS.some((p) => p.id === id)) await savePlayer({ partner: id });
  redirect("/");
}

/** Add a caught Pokémon to the team, or take it off. The team holds five besides your partner. */
export async function toggleTeam(form: FormData) {
  const dex = Number(text(form, "dex"));
  const team = await getTeam();
  const next = team.includes(dex) ? team.filter((d) => d !== dex) : [...team, dex];
  if (next.length > 5) fail("/dex", "Your team is full. Take someone off first.");
  if ((await getCaught()).includes(dex)) await savePlayer({ team: next });
  redirect("/dex");
}

export async function chooseTrainer(form: FormData) {
  const id = text(form, "trainer");
  if (TRAINERS.some((t) => t.id === id)) await savePlayer({ trainer: id });
  redirect("/setup?s=trainer");
}

/** Options screen: each button posts one setting, saved as a cookie of the same name. */
export async function setOption(form: FormData) {
  const allowed: Record<string, readonly string[]> = { frame: FRAMES, speed: SPEEDS, tone: TONES, pattern: PATTERNS };
  const jar = await cookies();
  for (const [name, values] of Object.entries(allowed)) {
    const value = text(form, name);
    if (values.includes(value)) jar.set(name, value, { maxAge: YEAR, sameSite: "lax" });
  }
  redirect("/setup?s=options");
}

/**
 * Catch a wild Pokémon. Every entry you log earns one Poké Ball, so
 * balls left = entries logged − Pokémon caught. Called from the Home scene.
 */
export async function catchPokemon(dex: number): Promise<{ ok: boolean; message?: string }> {
  if (!Number.isInteger(dex) || dex < 1 || dex > MAX_DEX) return { ok: false, message: "It fled!" };

  const [caught, totals] = await Promise.all([getCaught(), getMonthTotals()]);
  if (caught.includes(dex)) return { ok: true };
  const entries = totals.reduce((sum, t) => sum + t.entries, 0);
  if (entries - caught.length <= 0) return { ok: false, message: "No Poké Balls left! Log an entry to earn one." };

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("catches").insert({ dex });
    if (error) return { ok: false, message: error.message };
  } else {
    (await cookies()).set("caught", [...caught, dex].join("."), { maxAge: YEAR, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Save the expedition in progress. Called after every step; demo mode saves in the browser instead. */
export async function saveRun(run: Run): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = await createClient();
  await supabase
    .from("expedition_saves")
    .upsert({ step: run.step, state: run, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/** Record a finished expedition and clear the save. Pass no summary to drop a run without recording it. */
export async function endRun(summary: RunSummary | null): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("expedition_saves").delete().eq("user_id", user.id);
  if (summary) {
    await supabase.from("expedition_runs").insert({
      floor: Math.max(1, Math.floor(summary.floor)),
      wins: Math.max(0, Math.floor(summary.wins)),
      cleared: !!summary.cleared,
      caught: summary.caught.filter((dex) => Number.isInteger(dex) && dex >= 1 && dex <= MAX_DEX),
      party: summary.party.slice(0, 6).map(({ dex, kos }) => ({ dex, kos })),
    });
    revalidatePath("/", "layout");
  }
}
