import Link from "next/link";
import { Suspense } from "react";
import { Backdrop } from "@/components/backdrop";
import { Logo } from "@/components/logo";
import { Keys, LocationBanner, ScreenSwitcher, StartMenu, TabBar, ThemeToggle } from "@/components/nav";
import { SoundToggle } from "@/components/sound";
import { Icon } from "@/components/sprite";
import { signOut } from "@/lib/actions";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";
import {
  getAccountNet,
  getAccounts,
  getCategories,
  getCaught,
  getMonthTotals,
  getOptions,
  getPartnerId,
  getPokemonNames,
  getTrainerId,
  getTransactions,
} from "@/lib/data";
import { money, parseMonth } from "@/lib/format";
import { BADGES, getPlayer, summarizeMonth } from "@/lib/game";
import { accountBalances, accountHealth, openingTotal } from "@/lib/money";
import { partnerAt, TRAINERS } from "@/lib/partners";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const [options, trainerId, totals, categories, caught, accounts, net, entries, partnerId, names] = await Promise.all([
    getOptions(),
    getTrainerId(),
    getMonthTotals(),
    getCategories(),
    getCaught(),
    getAccounts(),
    getAccountNet(),
    getTransactions(parseMonth()),
    getPartnerId(),
    getPokemonNames(),
  ]);

  // The little summary in the start menu, like the one a game shows when you save.
  const player = getPlayer(totals);
  const trainer = TRAINERS.find((t) => t.id === trainerId)?.name ?? "Trainer";
  const summary: [string, string][] = [
    ["Player", trainer],
    ["Badges", String(BADGES.filter((b) => b.earned({ player, totals, categories, caught: caught.length })).length)],
    ["Pokédex", String(caught.length)],
    ["Money", money(summarizeMonth(totals, parseMonth(), openingTotal(accounts)).balance)],
  ];
  // Accounts in use, as the party shown beside the menu.
  const party = accountHealth(accountBalances(accounts.filter((a) => !a.archived_at), net), entries);
  const partner = partnerAt(partnerId, player.level, names);

  return (
    <div className="app" data-frame={options.frame} data-speed={options.speed}>
      <Backdrop tone={options.tone} pattern={options.pattern} />
      {/* These read the address to know which screen is showing, which needs a Suspense boundary. */}
      <Suspense>
        <Keys />
        <LocationBanner trainer={trainer} />
      </Suspense>
      <a href="#main" className="skip btn">
        Skip to content
      </a>

      <div className="flex min-w-0 flex-col gap-6">
        <header className="box flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link href="/" className="flex items-center gap-2 font-display text-sm leading-relaxed">
            <Logo size={32} />
            {APP_NAME}
            {!isSupabaseConfigured && (
              <span className="tag" title="Sample data. What you add is kept in this browser only, until you connect Supabase.">
                Demo
              </span>
            )}
          </Link>
          <Suspense>
            <ScreenSwitcher trainer={trainer} />
          </Suspense>
          {/* Home and Menu are left out on phones, where the tab bar along the bottom has both. */}
          <div className="head-buttons flex flex-wrap items-center">
            <Link href="/" className="btn head-home" data-sfx="tab" aria-keyshortcuts="1">
              <Icon name="home" size={20} />
              Home <kbd>1</kbd>
            </Link>
            <Suspense>
              <StartMenu summary={summary} trainer={trainer} partnerDex={partner?.dex} party={party} />
            </Suspense>
            <SoundToggle />
            <ThemeToggle />
            {isSupabaseConfigured && (
              <form action={signOut}>
                <button className="btn">Sign out</button>
              </form>
            )}
          </div>
        </header>

        <main id="main">{children}</main>
      </div>

      <Suspense>
        <TabBar />
      </Suspense>
    </div>
  );
}
