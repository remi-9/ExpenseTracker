"use server";
// The only file that writes to Supabase. Forms post straight to these.
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./config";
import { today } from "./format";
import { getCaught, getMonthTotals } from "./data";
import { DEFAULT_ICON, MAX_DEX, PARTNERS, PRESETS, TRAINERS } from "./partners";
import type { Kind } from "./types";
import { createClient } from "./supabase/server";

const fail = (path: string, message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);

async function db(path: string) {
  if (!isSupabaseConfigured) fail(path, "Demo mode: connect Supabase to save changes.");
  return createClient();
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function addTransaction(form: FormData) {
  const amount = Number(text(form, "amount"));
  const occurred_on = text(form, "occurred_on") || today();
  const category_id = text(form, "category_id");
  if (!category_id) fail("/log", "Pick a category.");
  if (!(amount > 0)) fail("/log", "Enter an amount above zero.");

  // Demo mode skips the insert; the Log page then plays the result as a preview.
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("transactions").insert({
      category_id,
      amount,
      occurred_on,
      note: text(form, "note") || null,
    });
    if (error) fail("/log", error.message);
    revalidatePath("/", "layout");
  }

  // The Log page turns these into the battle-style result (see components/battle.tsx).
  const result = new URLSearchParams({
    m: occurred_on.slice(0, 7),
    kind: text(form, "kind"),
    saved: String(amount),
    cat: category_id,
    t: String(Date.now()),
  });
  redirect(`/log?${result}`);
}

export async function deleteTransaction(form: FormData) {
  const back = `/log?m=${text(form, "m")}`;
  const supabase = await db(back);
  const { error } = await supabase.from("transactions").delete().eq("id", text(form, "id"));
  if (error) fail(back, error.message);
  revalidatePath("/", "layout");
  redirect(back);
}

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
    is_fixed: form.get("is_fixed") === "on",
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

const YEAR = 60 * 60 * 24 * 365;

/** Partner and trainer are cosmetic preferences, so they live in cookies, not the database. */
export async function choosePartner(form: FormData) {
  const id = text(form, "partner");
  const caught = id.startsWith("dex:") && (await getCaught()).includes(Number(id.slice(4)));
  if (caught || PARTNERS.some((p) => p.id === id)) {
    (await cookies()).set("partner", id, { maxAge: YEAR, sameSite: "lax" });
  }
  redirect("/");
}

export async function chooseTrainer(form: FormData) {
  const id = text(form, "trainer");
  if (TRAINERS.some((t) => t.id === id)) {
    (await cookies()).set("trainer", id, { maxAge: YEAR, sameSite: "lax" });
  }
  redirect("/setup");
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
