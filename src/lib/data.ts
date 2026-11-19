// The only file that reads from Supabase. Pages call these and never query directly.
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured } from "./config";
import { demoCategories, demoTotals, demoTransactions, NO_EDITS, type DemoEdits } from "./demo";
import type { BattleData, Species } from "./fight";
import { shiftMonth } from "./format";
import { PATTERNS, TONES, type Pattern, type Tone } from "./backdrop";
import { DEFAULT_OPTIONS, FRAMES, SPEEDS, type Speed } from "./options";
import { DEFAULT_TRAINER, MAX_DEX, TRAINERS } from "./partners";
import { createClient } from "./supabase/server";
import type { Category, MonthTotal, Transaction } from "./types";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Demo mode only: the entries added and removed in this browser (see demo.ts). */
async function loadDemoEdits(): Promise<DemoEdits> {
  try {
    const raw = (await cookies()).get("demo")?.value;
    return raw ? { ...NO_EDITS, ...(JSON.parse(raw) as DemoEdits) } : NO_EDITS;
  } catch {
    return NO_EDITS;
  }
}

async function loadCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured) return demoCategories;
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("categories")
      .select("id, name, kind, icon, is_fixed, monthly_target, sort_order, archived_at")
      .order("sort_order")
      .order("name"),
  );
  return rows.map((r) => ({
    ...r,
    monthly_target: r.monthly_target == null ? null : Number(r.monthly_target),
  })) as Category[];
}

/** Every month × category total. Small (rows ≈ months × categories), so we load it all. */
async function loadMonthTotals(): Promise<MonthTotal[]> {
  if (!isSupabaseConfigured) return demoTotals(demoTransactions(await getDemoEdits()));
  const supabase = await createClient();
  const rows = check(
    await supabase.from("month_totals").select("month, category_id, kind, total, entries"),
  );
  return rows.map((r) => ({ ...r, total: Number(r.total) })) as MonthTotal[];
}

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
      .select("id, category_id, amount, occurred_on, note, category:categories(name, kind, icon)")
      .gte("occurred_on", from)
      .lt("occurred_on", to)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) })) as unknown as Transaction[];
}

/** Which partner the player picked (a cookie; see choosePartner). */
async function loadPartnerId(): Promise<string | undefined> {
  return (await cookies()).get("partner")?.value;
}

/** Which trainer sprite the player picked (a cookie; see chooseTrainer). */
async function loadTrainerId(): Promise<string> {
  const id = (await cookies()).get("trainer")?.value;
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

/** Up to five caught Pokémon that travel with your partner (a cookie; see toggleTeam). */
async function loadTeam(): Promise<number[]> {
  const raw = (await cookies()).get("team")?.value ?? "";
  const caught = await getCaught();
  return raw
    .split(".")
    .map(Number)
    .filter((n) => caught.includes(n))
    .slice(0, 5);
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

/**
 * Types, base stats and the type chart for dex 1–649, built from three small
 * PokeAPI data files and cached for a month. Returns null if they can't be reached.
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
    return { species, chart };
  } catch {
    return null;
  }
}

/** Everything chosen on the Options screen (cookies; see setOption). */
async function loadOptions(): Promise<{ frame: string; speed: Speed; tone: Tone; pattern: Pattern }> {
  const jar = await cookies();
  const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const value = jar.get(name)?.value as T;
    return allowed.includes(value) ? value : fallback;
  };
  return {
    frame: pick("frame", FRAMES, DEFAULT_OPTIONS.frame),
    speed: pick("speed", SPEEDS, DEFAULT_OPTIONS.speed),
    tone: pick("tone", TONES, DEFAULT_OPTIONS.tone),
    pattern: pick("pattern", PATTERNS, DEFAULT_OPTIONS.pattern),
  };
}

// Each read runs at most once per request, however many components ask for it
// (the layout's start menu and the page often want the same data).
export const getDemoEdits = cache(loadDemoEdits);
export const getCategories = cache(loadCategories);
export const getMonthTotals = cache(loadMonthTotals);
export const getTransactions = cache(loadTransactions);
export const getPartnerId = cache(loadPartnerId);
export const getTrainerId = cache(loadTrainerId);
export const getCaught = cache(loadCaught);
export const getPokemonNames = cache(loadPokemonNames);
export const getTeam = cache(loadTeam);
export const getBattleData = cache(loadBattleData);
export const getOptions = cache(loadOptions);
