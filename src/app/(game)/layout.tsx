import Link from "next/link";
import { Menu, ThemeToggle } from "@/components/nav";
import { signOut } from "@/lib/actions";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <header className="box flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link href="/" className="font-display text-sm leading-relaxed">
          {APP_NAME}
        </Link>
        <Menu />
        <div className="flex items-center">
          <ThemeToggle />
          {isSupabaseConfigured && (
            <form action={signOut}>
              <button className="btn">Sign out</button>
            </form>
          )}
        </div>
      </header>

      {!isSupabaseConfigured && (
        <p className="box bg-gold! text-[#1c2434]">
          Demo mode. This is sample data and nothing is saved. Add your Supabase keys to{" "}
          <code>.env.local</code> to start your own save file.
        </p>
      )}

      <main className="flex flex-col gap-4">{children}</main>
    </div>
  );
}
