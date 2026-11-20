// The only file that reads from Supabase. Pages call these and never query directly.
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured } from "./config";
import { decodeEdits, demoAccounts, demoBills, demoCategories, demoTotals, demoTransactions, type DemoEdits } from "./demo";
import { baseTotal, type BattleData, type Species } from "./fight";
import { shiftMonth } from "./format";
import { PATTERNS, TONES, type Pattern, type Tone } from "./backdrop";
import { DEFAULT_OPTIONS, FRAMES, SCENES, SPEEDS, type SceneSize, type Speed } from "./options";
import { DEFAULT_TRAINER, MAX_DEX, TRAINERS } from "./partners";
import { createClient } from "./supabase/server";
import type { Run, RunSummary } from "./run";
import { withLatePay } from "./game";
import { netByAccount, type BillPayment } from "./money";
import { keptTossed, KEEP_DAYS, type Tossed } from "./tossed";
import type { Account, Bill, Category, MonthTotal, Transaction, Transfer } from "./types";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Demo mode only: the entries and transfers added and removed in this browser (see demo.ts). */
async function loadDemoEdits(): Promise<DemoEdits> {
  return decodeEdits((await cookies()).get("demo")?.value);
}

async function loadCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured) return demoCategories;
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("categories")
      .select("id, name, kind, icon, monthly_target, sort_order, archived_at")
      .order("sort_order")
      .order("name"),
  );
  return rows.map((r) => ({
    ...r,
    monthly_target: r.monthly_target == null ? null : Number(r.monthly_target),
  })) as Category[];
}

/**
 * Every month × category total. Small (rows ≈ months × categories), so we load it all.
 * Income that lands late in a month is counted for the month after (see withLatePay),
 * which needs each income entry's date: a handful of rows a month.
 */
async function loadMonthTotals(): Promise<MonthTotal[]> {
  if (!isSupabaseConfigured) {
    const entries = demoTransactions(await getDemoEdits());
    return withLatePay(demoTotals(entries), entries.filter((t) => t.category.kind === "income"));
  }
  const supabase = await createClient();
  const [totals, income] = await Promise.all([
    supabase.from("month_totals").select("month, category_id, kind, total, entries"),
    supabase
      .from("transactions")
      .select("occurred_on, category_id, amount, category:categories!inner(kind)")
      .eq("category.kind", "income")
      .order("occurred_on", { ascending: false })
      .limit(1000),
  ]);
  return withLatePay(
    check(totals).map((r) => ({ ...r, total: Number(r.total) })) as MonthTotal[],
    check(income).map((r) => ({ occurred_on: r.occurred_on as string, category_id: r.category_id as string, amount: Number(r.amount) })),
  );
}

const ENTRY_COLUMNS = "id, category_id, amount, occurred_on, note, account_id, to_account_id, bill_id, category:categories(name, kind, icon)";
const asEntries = (rows: { amount: unknown }[]) =>
  rows.map((r) => ({ ...r, amount: Number(r.amount) })) as unknown as Transaction[];

/** Entries for one month (YYYY-MM), newest first. */
async function loadTransactions(month: string): Promise<Transaction[]> {
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  if (!isSupabaseConfigured) {
    return demoTransactions(await getDemoEdits()).filter((t) => t.occurred_on >= from && t.occurred_on < to);
  }
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("transactions")
      .select(ENTRY_COLUMNS)
      .gte("occurred_on", from)
      .lt("occurred_on", to)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
  );
  return asEntries(rows);
}

/** Entries dated on or after a day (YYYY-MM-DD), newest first: what has moved an account since then. */
async function loadTransactionsFrom(from: string): Promise<Transaction[]> {
  if (!isSupabaseConfigured) return demoTransactions(await getDemoEdits()).filter((t) => t.occurred_on >= from);
  const supabase = await createClient();
  const all: Transaction[] = [];
  for (let at = 0; ; at += 1000) {
    const rows = check(
      await supabase
        .from("transactions")
        .select(ENTRY_COLUMNS)
        .gte("occurred_on", from)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .range(at, at + 999),
    );
    all.push(...asEntries(rows));
    if (rows.length < 1000) return all;
  }
}

/** Entries from any month whose note or category name contains the text, newest first, up to a hundred. */
async function loadSearch(query: string): Promise<Transaction[]> {
  // Keep letters, digits and spaces: the rest has meaning in a filter expression.
  const q = query.replace(/[^\p{L}\p{N} ]/gu, " ").trim().toLowerCase();
  if (!q) return [];
  const named = (await getCategories()).filter((c) => c.name.toLowerCase().includes(q)).map((c) => c.id);
  if (!isSupabaseConfigured) {
    return demoTransactions(await getDemoEdits())
      .filter((t) => named.includes(t.category_id) || t.note?.toLowerCase().includes(q))
      .slice(0, 100);
  }
  const supabase = await createClient();
  const filters = [`note.ilike.%${q}%`, ...(named.length ? [`category_id.in.(${named.join(",")})`] : [])];
  const rows = check(
    await supabase
      .from("transactions")
      .select(ENTRY_COLUMNS)
      .or(filters.join(","))
      .order("occurred_on", { ascending: false })
      .limit(100),
  );
  return asEntries(rows);
}

/** Every entry, oldest first, for the CSV export. */
async function loadAllTransactions(): Promise<Transaction[]> {
  if (!isSupabaseConfigured) return demoTransactions(await getDemoEdits()).reverse();
  const supabase = await createClient();
  const all: Transaction[] = [];
  // Supabase returns at most a thousand rows a request, so read in pages.
  for (let from = 0; ; from += 1000) {
    const rows = check(
      await supabase
        .from("transactions")
        .select(ENTRY_COLUMNS)
        .order("occurred_on")
        .order("created_at")
        .range(from, from + 999),
    );
    all.push(...asEntries(rows));
    if (rows.length < 1000) return all;
  }
}

/**
 * Notes used before, most recent first, each with the category it was last used with.
 * They fill the note suggestions on the Log form, and picking one selects its category.
 */
async function loadNoteHints(): Promise<{ note: string; category_id: string }[]> {
  let rows: { note: string | null; category_id: string }[];
  if (!isSupabaseConfigured) rows = demoTransactions(await getDemoEdits());
  else {
    const supabase = await createClient();
    rows = check(
      await supabase
        .from("transactions")
        .select("note, category_id")
        .not("note", "is", null)
        .order("occurred_on", { ascending: false })
        .limit(400),
    );
  }
  const seen = new Map<string, { note: string; category_id: string }>();
  for (const { note, category_id } of rows) {
    if (note && !seen.has(note.toLowerCase())) seen.set(note.toLowerCase(), { note, category_id });
  }
  return [...seen.values()].slice(0, 80);
}

/** Categories of the latest entries, most recently logged first, each once: what the entry forms start on. */
async function loadRecentCategories(): Promise<string[]> {
  let ids: string[];
  if (!isSupabaseConfigured) {
    // Entries added in this browser are the newest; the sample entries go by date.
    const edits = await getDemoEdits();
    const sample = demoTransactions(edits).toSorted((a, b) => b.occurred_on.localeCompare(a.occurred_on));
    ids = [...edits.added.toReversed(), ...sample].map((t) => t.category_id);
  } else {
    const supabase = await createClient();
    const rows = check(await supabase.from("transactions").select("category_id").order("created_at", { ascending: false }).limit(200));
    ids = rows.map((r) => r.category_id as string);
  }
  return [...new Set(ids)];
}

/** Entries and transfers tossed in the last 30 days, newest toss first (see tossed.ts). */
async function loadTossed(): Promise<Tossed[]> {
  if (!isSupabaseConfigured) return keptTossed((await getDemoEdits()).tossed, new Date());
  const supabase = await createClient();
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const rows = check(
    await supabase.from("tossed").select("id, kind, row, tossed_at").gte("tossed_at", since).order("tossed_at", { ascending: false }).limit(200),
  ) as { id: string; kind: Tossed["kind"]; row: Record<string, unknown>; tossed_at: string }[];
  // The row is kept as it was in its table; amounts come back as numbers or strings.
  return rows.map((t) => ({ ...t, row: { ...t.row, amount: Number(t.row.amount) } }) as Tossed);
}

// ---- Accounts, transfers and bills -------------------------------------------------

async function loadAccounts(): Promise<Account[]> {
  if (!isSupabaseConfigured) return demoAccounts;
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("accounts")
      .select("id, name, kind, icon, opening_balance, sort_order, archived_at")
      .order("sort_order")
      .order("created_at"),
  );
  return rows.map((r) => ({ ...r, opening_balance: Number(r.opening_balance) })) as Account[];
}

/** What each account has gained or lost since its opening balance, by account id. */
async function loadAccountNet(): Promise<Map<string, number>> {
  if (!isSupabaseConfigured) {
    const edits = await getDemoEdits();
    return netByAccount(demoTransactions(edits), edits.transfers);
  }
  const supabase = await createClient();
  const rows = check(await supabase.from("account_totals").select("account_id, net"));
  return new Map(rows.map((r) => [r.account_id as string, Number(r.net)]));
}

/** The latest transfers between accounts, newest first. */
async function loadTransfers(): Promise<Transfer[]> {
  if (!isSupabaseConfigured) return [...(await getDemoEdits()).transfers].reverse();
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("transfers")
      .select("id, from_account, to_account, amount, occurred_on, note")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) })) as Transfer[];
}

/** Transfers dated on or after a day (YYYY-MM-DD). */
async function loadTransfersFrom(from: string): Promise<Transfer[]> {
  if (!isSupabaseConfigured) return (await getDemoEdits()).transfers.filter((t) => t.occurred_on >= from);
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("transfers")
      .select("id, from_account, to_account, amount, occurred_on, note")
      .gte("occurred_on", from)
      .order("occurred_on", { ascending: false })
      .limit(1000),
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) })) as Transfer[];
}

/** Every transfer, oldest first: for comparing a statement with what is logged. */
async function loadAllTransfers(): Promise<Transfer[]> {
  if (!isSupabaseConfigured) return (await getDemoEdits()).transfers;
  const supabase = await createClient();
  const all: Transfer[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(
      await supabase
        .from("transfers")
        .select("id, from_account, to_account, amount, occurred_on, note")
        .order("occurred_on")
        .order("created_at")
        .range(from, from + 999),
    );
    all.push(...(rows.map((r) => ({ ...r, amount: Number(r.amount) })) as Transfer[]));
    if (rows.length < 1000) return all;
  }
}

async function loadBills(): Promise<Bill[]> {
  if (!isSupabaseConfigured) return demoBills;
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("bills")
      .select("id, name, category_id, account_id, amount, due_day, cadence, due_month, archived_at")
      .order("due_day")
      .order("name"),
  );
  return rows.map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) })) as Bill[];
}

/** Entries that pay a bill, for one month (YYYY-MM). */
async function loadBillPayments(month: string): Promise<BillPayment[]> {
  // A bill can be paid a few days before the month starts or after it ends (see billsFor).
  const entries = (await Promise.all([-1, 0, 1].map((n) => getTransactions(shiftMonth(month, n))))).flat();
  return entries.filter((t) => t.bill_id).map((t) => ({ bill_id: t.bill_id!, occurred_on: t.occurred_on, amount: t.amount }));
}

/**
 * The partner, trainer and team chosen, from the `players` table so they follow you
 * between devices. Null in demo mode, or before the first choice is saved there.
 */
async function loadPlayer(): Promise<{ partner: string | null; trainer: string | null; team: number[] } | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  return check(await supabase.from("players").select("partner, trainer, team").maybeSingle()) as Awaited<ReturnType<typeof loadPlayer>>;
}

/** The email of whoever is signed in. Null in demo mode. */
async function loadUserEmail(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  return (await supabase.auth.getUser()).data.user?.email ?? null;
}

/** Which partner the player picked (see choosePartner). This browser's cookie is the fallback. */
async function loadPartnerId(): Promise<string | undefined> {
  return (await getPlayerRow())?.partner ?? (await cookies()).get("partner")?.value;
}

/** Which trainer sprite the player picked (see chooseTrainer). */
async function loadTrainerId(): Promise<string> {
  const id = (await getPlayerRow())?.trainer ?? (await cookies()).get("trainer")?.value;
  return TRAINERS.some((t) => t.id === id) ? id! : DEFAULT_TRAINER;
}

/** Dex numbers of every Pokémon caught, oldest first. Demo mode keeps them in a cookie. */
async function loadCaught(): Promise<number[]> {
  if (!isSupabaseConfigured) {
    const raw = (await cookies()).get("caught")?.value ?? "";
    return raw.split(".").map(Number).filter((n) => n >= 1 && n <= MAX_DEX);
  }
  const supabase = await createClient();
  const rows = check(await supabase.from("catches").select("dex").order("caught_at"));
  return rows.map((r) => r.dex as number);
}

/**
 * Display names for dex numbers 1–649 (index = dex − 1), from the free PokeAPI.
 * Cached for a month. If the API can't be reached the list is empty and
 * callers fall back to "No. 25".
 */
async function loadPokemonNames(): Promise<string[]> {
  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${MAX_DEX}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    const body = (await response.json()) as { results: { name: string }[] };
    return body.results.map(({ name }) =>
      name
        .split("-")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" "),
    );
  } catch {
    return [];
  }
}

/** Up to five caught Pokémon that travel with your partner (see toggleTeam). */
async function loadTeam(): Promise<number[]> {
  const saved = (await getPlayerRow())?.team;
  const raw = (await cookies()).get("team")?.value ?? "";
  const caught = await getCaught();
  return (saved ?? raw.split(".").map(Number)).filter((n) => caught.includes(n)).slice(0, 5);
}

const CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const MONTH = { next: { revalidate: 60 * 60 * 24 * 30 } };

/** Rows of a PokeAPI data file as arrays of numbers, header skipped. */
async function csvRows(file: string): Promise<number[][]> {
  const text = await (await fetch(`${CSV}/${file}.csv`, MONTH)).text();
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(",").map(Number));
}

/** Rows of a PokeAPI data file as objects keyed by column name, so a new column upstream cannot shift them. */
async function csvTable(file: string): Promise<Record<string, number>[]> {
  const text = await (await fetch(`${CSV}/${file}.csv`, MONTH)).text();
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((name, i) => [name, Number(cells[i])]));
  });
}

/**
 * What each species evolves into and at which level. Evolutions that the games tie
 * to a stone, a trade or friendship get a level from how strong the species is.
 * Where a species has several evolutions, the one with the lowest dex number is used.
 */
async function addEvolutions(species: Species[]) {
  const [rows, evolutions] = await Promise.all([csvTable("pokemon_species"), csvTable("pokemon_evolution")]);
  const levelFor = new Map<number, number>();
  for (const e of evolutions) {
    if (e.minimum_level > 0 && !levelFor.has(e.evolved_species_id)) levelFor.set(e.evolved_species_id, e.minimum_level);
  }
  for (const row of rows) {
    const from = row.evolves_from_species_id;
    if (!(row.id >= 1 && row.id <= MAX_DEX && from >= 1 && from <= MAX_DEX) || species[from - 1].e) continue;
    const total = baseTotal(species[from - 1]);
    species[from - 1].e = [row.id, levelFor.get(row.id) ?? (total < 300 ? 18 : total < 420 ? 30 : 40)];
  }
}

/**
 * Types, base stats, evolutions and the type chart for dex 1–649, built from a few
 * small PokeAPI data files and cached for a month. Returns null if they can't be reached.
 */
async function loadBattleData(): Promise<BattleData | null> {
  try {
    const [stats, types, efficacy] = await Promise.all([
      csvRows("pokemon_stats"),
      csvRows("pokemon_types"),
      csvRows("type_efficacy"),
    ]);
    const species: Species[] = Array.from({ length: MAX_DEX }, () => ({ t: [], s: [] }));
    for (const [id, stat, value] of stats) if (id <= MAX_DEX) species[id - 1].s[stat - 1] = value;
    for (const [id, type, slot] of types) if (id <= MAX_DEX) species[id - 1].t[slot - 1] = type;
    const chart: number[][] = Array.from({ length: 19 }, () => Array(19).fill(1));
    for (const [attack, defend, factor] of efficacy) if (attack <= 18 && defend <= 18) chart[attack][defend] = factor / 100;
    if (species.some((s) => s.s.length !== 6 || s.t.length === 0)) return null;
    // Battles work without evolutions, so a failure here is not a reason to refuse them.
    await addEvolutions(species).catch(() => {});
    return { species, chart };
  } catch {
    return null;
  }
}

/** The expedition in progress, if there is one. Demo mode keeps it in the browser instead. */
async function loadSavedRun(): Promise<Run | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const row = check(await supabase.from("expedition_saves").select("state").maybeSingle()) as { state: Run } | null;
  const run = row?.state;
  return run?.v === 3 ? run : null;
}

/** Every finished expedition, newest first. Demo mode keeps them in the browser instead. */
async function loadRunHistory(): Promise<RunSummary[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("expedition_runs")
      .select("floor, wins, cleared, caught, party")
      .order("ended_at", { ascending: false })
      .limit(500),
  );
  return rows as RunSummary[];
}

/** Everything chosen on the Options screen (cookies; see setOption). */
async function loadOptions(): Promise<{ frame: string; speed: Speed; scene: SceneSize; tone: Tone; pattern: Pattern }> {
  const jar = await cookies();
  const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const value = jar.get(name)?.value as T;
    return allowed.includes(value) ? value : fallback;
  };
  return {
    frame: pick("frame", FRAMES, DEFAULT_OPTIONS.frame),
    speed: pick("speed", SPEEDS, DEFAULT_OPTIONS.speed),
    scene: pick("scene", SCENES, DEFAULT_OPTIONS.scene),
    tone: pick("tone", TONES, DEFAULT_OPTIONS.tone),
    pattern: pick("pattern", PATTERNS, DEFAULT_OPTIONS.pattern),
  };
}

// Each read runs at most once per request, however many components ask for it
// (the layout's start menu and the page often want the same data).
export const getDemoEdits = cache(loadDemoEdits);
const getPlayerRow = cache(loadPlayer);
export const getUserEmail = cache(loadUserEmail);
export const getCategories = cache(loadCategories);
export const getMonthTotals = cache(loadMonthTotals);
export const getTransactions = cache(loadTransactions);
export const getTransactionsFrom = cache(loadTransactionsFrom);
export const searchTransactions = cache(loadSearch);
export const getAllTransactions = cache(loadAllTransactions);
export const getNoteHints = cache(loadNoteHints);
export const getRecentCategories = cache(loadRecentCategories);
export const getTossed = cache(loadTossed);
export const getAccounts = cache(loadAccounts);
export const getAccountNet = cache(loadAccountNet);
export const getTransfers = cache(loadTransfers);
export const getTransfersFrom = cache(loadTransfersFrom);
export const getAllTransfers = cache(loadAllTransfers);
export const getBills = cache(loadBills);
export const getBillPayments = cache(loadBillPayments);
export const getPartnerId = cache(loadPartnerId);
export const getTrainerId = cache(loadTrainerId);
export const getCaught = cache(loadCaught);
export const getPokemonNames = cache(loadPokemonNames);
export const getTeam = cache(loadTeam);
export const getBattleData = cache(loadBattleData);
export const getOptions = cache(loadOptions);
export const getSavedRun = cache(loadSavedRun);
export const getRunHistory = cache(loadRunHistory);
