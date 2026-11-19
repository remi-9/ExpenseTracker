import Link from "next/link";
/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprite */
import { Tabs, ThemeToggle } from "@/components/nav";
import { SoundToggle } from "@/components/sound";
import { signOut } from "@/lib/actions";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";
import { sprite } from "@/lib/partners";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 pt-4 pb-28 sm:px-4 sm:py-6">
      <header className="box flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link href="/" className="flex items-center gap-2 font-display text-sm leading-relaxed">
          <img src={sprite.item("poke-ball")} alt="" width={30} height={30} className="pixel" />
          {APP_NAME}
        </Link>
        <div className="flex items-center">
          <SoundToggle />
          <ThemeToggle />
          {isSupabaseConfigured && (
            <form action={signOut}>
              <button className="btn">Sign out</button>
            </form>
          )}
        </div>
      </header>

      <Tabs />

      {!isSupabaseConfigured && (
        <p className="text-center text-muted">Demo mode: sample data, nothing is saved.</p>
      )}

      <main>{children}</main>
    </div>
  );
}
