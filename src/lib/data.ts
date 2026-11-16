// The only file that reads from Supabase. Pages call these and never query directly.
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./config";
import { demoCategories, demoTotals, demoTransactions } from "./demo";
import { shiftMonth } from "./format";
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

/** Which partner line the player picked (a cookie; see choosePartner). */
export async function getPartnerId(): Promise<string | undefined> {
  return (await cookies()).get("partner")?.value;
}
