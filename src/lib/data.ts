// The only file that reads from Supabase. Pages call these and never query directly.
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./config";
import { demoCategories, demoTotals, demoTransactions } from "./demo";
import { shiftMonth } from "./format";
import { DEFAULT_TRAINER, MAX_DEX, TRAINERS } from "./partners";
import { createClient } from "./supabase/server";
import type { Category, MonthTotal, Transaction } from "./types";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function getCategories(): Promise<Category[]> {
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
export async function getMonthTotals(): Promise<MonthTotal[]> {
  if (!isSupabaseConfigured) return demoTotals();
  const supabase = await createClient();
  const rows = check(
    await supabase.from("month_totals").select("month, category_id, kind, total, entries"),
  );
  return rows.map((r) => ({ ...r, total: Number(r.total) })) as MonthTotal[];
}

/** Entries for one month (YYYY-MM), newest first. */
export async function getTransactions(month: string): Promise<Transaction[]> {
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  if (!isSupabaseConfigured) {
    return demoTransactions().filter((t) => t.occurred_on >= from && t.occurred_on < to);
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
export async function getPartnerId(): Promise<string | undefined> {
  return (await cookies()).get("partner")?.value;
}

/** Which trainer sprite the player picked (a cookie; see chooseTrainer). */
export async function getTrainerId(): Promise<string> {
  const id = (await cookies()).get("trainer")?.value;
  return TRAINERS.some((t) => t.id === id) ? id! : DEFAULT_TRAINER;
}

/** Dex numbers of every Pokémon caught, oldest first. Demo mode keeps them in a cookie. */
export async function getCaught(): Promise<number[]> {
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
export async function getPokemonNames(): Promise<string[]> {
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
