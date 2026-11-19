"use server";
// The only file that writes to Supabase. Forms post straight to these.
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./config";
import { parseAmount, today, yesterday } from "./format";
import { getCaught, getCategories, getDemoEdits, getMonthTotals, getTeam } from "./data";
import { DEMO_LIMIT, type DemoEdits } from "./demo";
import { PATTERNS, TONES } from "./backdrop";
import { FRAMES, SPEEDS } from "./options";
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

type Entry = { category_id: string; amount: number; occurred_on: string; note: string | null };

const writeDemo = async (edits: DemoEdits) =>
  (await cookies()).set("demo", JSON.stringify(edits), { maxAge: YEAR, sameSite: "lax" });

/** Reads the entry form. Sends the user back with a message if something is missing. */
async function readEntry(form: FormData, back: string): Promise<Entry> {
  const kind = text(form, "kind");
  // The form has one list of categories per kind; the checked one for the chosen kind counts.
  const category_id = text(form, `category_${kind}`) || text(form, "category_id");
  const amount = parseAmount(text(form, "amount"));
  if (!category_id) fail(back, "Pick a category.");
  if (amount === null) fail(back, "Enter an amount, like 1500 or 5390+764.");
  if (amount! <= 0) fail(back, "The amount has to be above zero.");

  const when = text(form, "when");
  const occurred_on = when === "yesterday" ? yesterday() : when === "today" ? today() : text(form, "occurred_on") || today();
  return { category_id, amount: amount!, occurred_on, note: text(form, "note") || null };
}

/** Saves a new entry and returns its id. Demo mode keeps it in a cookie instead. */
async function insertEntry(entry: Entry, back: string): Promise<string> {
  if (!isSupabaseConfigured) {
    const edits = await getDemoEdits();
    const id = `mine-${Date.now()}`;
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
      added: edits.added.filter((e) => e.id !== id),
      removed: mine ? edits.removed : [...edits.removed, id],
    });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) fail(back, error.message);
  revalidatePath("/", "layout");
}

/** Where to land after a save, with what the Log page needs to play the result and keep your choices. */
async function afterSave(entry: Entry, id: string): Promise<never> {
  const kind = (await getCategories()).find((c) => c.id === entry.category_id)?.kind ?? "expense";
  const result = new URLSearchParams({
    m: entry.occurred_on.slice(0, 7),
    kind,
    cat: entry.category_id,
    saved: String(entry.amount),
    id,
    t: String(Date.now()),
  });
  return redirect(`/log?${result}`);
}

export async function addTransaction(form: FormData) {
  const entry = await readEntry(form, "/log");
  return afterSave(entry, await insertEntry(entry, "/log"));
}

/** One tap from the monthly checklist: the category and amount, dated today (or in the month being viewed). */
export async function logMonthly(form: FormData) {
  const month = text(form, "m");
  const back = `/log?m=${month}`;
  const amount = parseAmount(text(form, "amount"));
  if (amount === null || amount <= 0) fail(back, "Enter an amount, like 1500.");
  const entry: Entry = {
    category_id: text(form, "category_id"),
    amount: amount!,
    occurred_on: today().startsWith(month) || !month ? today() : `${month}-01`,
    note: null,
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
      added: [...edits.added.filter((e) => e.id !== id), { id: `mine-${Date.now()}`, ...entry }].slice(-DEMO_LIMIT),
      removed: mine ? edits.removed : [...edits.removed, id],
    });
  }
  redirect(`/log?m=${entry.occurred_on.slice(0, 7)}&done=updated`);
}

/** Toss an entry. `undo=1` is the Undo button right after a save, which lands back on the form. */
export async function deleteTransaction(form: FormData) {
  const month = text(form, "m");
  await removeEntry(text(form, "id"), `/log?m=${month}`);
  redirect(`/log?m=${month}&done=${form.get("undo") ? "undone" : "tossed"}`);
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

/** Whether a category happens every month, which puts it on the monthly checklist. */
export async function setCategoryMonthly(form: FormData) {
  const supabase = await db("/setup");
  const { error } = await supabase
    .from("categories")
    .update({ is_fixed: form.get("monthly") === "1" })
    .eq("id", text(form, "id"));
  if (error) fail("/setup", error.message);
  revalidatePath("/", "layout");
  redirect(`/setup?s=bag&pocket=${text(form, "pocket")}&c=${text(form, "id")}`);
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

/** Add a caught Pokémon to the team, or take it off. The team holds five besides your partner. */
export async function toggleTeam(form: FormData) {
  const dex = Number(text(form, "dex"));
  const team = await getTeam();
  const next = team.includes(dex) ? team.filter((d) => d !== dex) : [...team, dex];
  if (next.length > 5) fail("/dex", "Your team is full. Take someone off first.");
  if ((await getCaught()).includes(dex)) {
    (await cookies()).set("team", next.join("."), { maxAge: YEAR, sameSite: "lax" });
  }
  redirect("/dex");
}

export async function chooseTrainer(form: FormData) {
  const id = text(form, "trainer");
  if (TRAINERS.some((t) => t.id === id)) {
    (await cookies()).set("trainer", id, { maxAge: YEAR, sameSite: "lax" });
  }
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
