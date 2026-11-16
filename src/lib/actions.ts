"use server";
// The only file that writes to Supabase. Forms post straight to these.
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./config";
import { today } from "./format";
import { PARTNERS } from "./partners";
import { createClient } from "./supabase/server";

const fail = (path: string, message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);

async function db(path: string) {
  if (!isSupabaseConfigured) fail(path, "Demo mode: connect Supabase to save changes.");
  return createClient();
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function addTransaction(form: FormData) {
  const supabase = await db("/log");
  const amount = Number(text(form, "amount"));
  const occurred_on = text(form, "occurred_on") || today();
  const category_id = text(form, "category_id");
  if (!category_id) fail("/log", "Pick a category.");
  if (!(amount > 0)) fail("/log", "Enter an amount above zero.");

  const { error } = await supabase.from("transactions").insert({
    category_id,
    amount,
    occurred_on,
    note: text(form, "note") || null,
  });
  if (error) fail("/log", error.message);

  revalidatePath("/", "layout");
  redirect(`/log?m=${occurred_on.slice(0, 7)}&kind=${text(form, "kind")}&saved=1`);
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
  const supabase = await db("/categories");
  const name = text(form, "name");
  const target = text(form, "monthly_target");
  if (!name) fail("/categories", "Give the category a name.");

  const { error } = await supabase.from("categories").insert({
    name,
    kind: text(form, "kind"),
    icon: text(form, "icon") || "❓",
    is_fixed: form.get("is_fixed") === "on",
    monthly_target: target ? Number(target) : null,
  });
  if (error) {
    fail("/categories", error.code === "23505" ? `"${name}" already exists.` : error.message);
  }
  revalidatePath("/", "layout");
  redirect("/categories");
}

/** Archive hides a category from forms but keeps its history. Unarchive brings it back. */
export async function setCategoryArchived(form: FormData) {
  const supabase = await db("/categories");
  const { error } = await supabase
    .from("categories")
    .update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null })
    .eq("id", text(form, "id"));
  if (error) fail("/categories", error.message);
  revalidatePath("/", "layout");
  redirect("/categories");
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

/** The partner choice is a cosmetic preference, so it lives in a cookie, not the database. */
export async function choosePartner(form: FormData) {
  const id = text(form, "partner");
  if (PARTNERS.some((p) => p.id === id)) {
    (await cookies()).set("partner", id, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect("/");
}
