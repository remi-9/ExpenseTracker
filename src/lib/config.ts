// App-wide settings. Change these in one place.
export const APP_NAME = "Pocket Tracker";
export const CURRENCY = "PHP";
export const LOCALE = "en-PH";
export const TIME_ZONE = "Asia/Manila";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Without Supabase env vars the app runs in demo mode: sample data, nothing is saved.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
