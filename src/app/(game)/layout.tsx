/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprite */
import Link from "next/link";
import { MenuKeys, StartMenu, ThemeToggle } from "@/components/nav";
import { SoundToggle } from "@/components/sound";
import { signOut } from "@/lib/actions";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";
import { getCategories, getCaught, getMonthTotals, getOptions, getTrainerId } from "@/lib/data";
import { money, parseMonth } from "@/lib/format";
import { BADGES, getPlayer, summarizeMonth } from "@/lib/game";
import { sprite, TRAINERS } from "@/lib/partners";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const [options, trainerId, totals, categories, caught] = await Promise.all([
    getOptions(),
    getTrainerId(),
    getMonthTotals(),
    getCategories(),
    getCaught(),
  ]);

  // The little summary under the start menu, like the one a game shows when you save.
  const player = getPlayer(totals);
  const summary: [string, string][] = [
    ["Player", TRAINERS.find((t) => t.id === trainerId)?.name ?? "Trainer"],
    ["Badges", String(BADGES.filter((b) => b.earned({ player, totals, categories })).length)],
    ["Pokédex", String(caught.length)],
    ["Money", money(summarizeMonth(totals, parseMonth()).balance)],
  ];

  return (
    <div className="app" data-frame={options.frame} data-speed={options.speed}>
      <MenuKeys />

      <div className="flex min-w-0 flex-col gap-4">
        <header className="box flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link href="/" className="flex items-center gap-2 font-display text-sm leading-relaxed">
            <img src={sprite.item("poke-ball")} alt="" width={30} height={30} className="pixel" />
            {APP_NAME}
            {!isSupabaseConfigured && (
              <span className="tag" title="Sample data. Nothing is saved until you connect Supabase.">
                Demo
              </span>
            )}
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

        <main>{children}</main>
      </div>

      <aside className="app-side">
        <StartMenu />
        <dl className="window save-info">
          {summary.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
