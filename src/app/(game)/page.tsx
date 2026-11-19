/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { PaySplit, StepLine } from "@/components/charts";
import { PartnerPicker, PartnerSprite, type Mood } from "@/components/partner";
import { Scene } from "@/components/scene";
import { Typewriter } from "@/components/typewriter";
import { Bar, EntryList, hpTone, MonthPicker, Panel } from "@/components/ui";
import { WildPokemon } from "@/components/wild";
import {
  getCategories,
  getCaught,
  getMonthTotals,
  getPartnerId,
  getPokemonNames,
  getTrainerId,
  getTransactions,
} from "@/lib/data";
import { money, monthLabel, parseMonth, shiftMonth } from "@/lib/format";
import { getPlayer, getQuests, isShiny, summarizeMonth, walletHp, type MonthSummary } from "@/lib/game";
import { partnerAt, sprite } from "@/lib/partners";

function moodFor(s: MonthSummary): Mood {
  if (s.income === 0) return s.expense > 0 ? "worried" : "happy";
  if (s.remaining <= 0) return "fainted";
  return walletHp(s) <= 0.2 ? "worried" : "happy";
}

function narrate(s: MonthSummary, month: string, name: string): string {
  const label = monthLabel(month);
  if (s.income === 0 && s.expense === 0) return `Nothing logged for ${label} yet. Log your pay to start the month.`;
  if (s.income === 0) return `${money(s.expense)} spent in ${label}, but no income logged yet.`;
  if (s.remaining < 0) return `${name} fainted! You're ${money(-s.remaining)} over what you earned in ${label}.`;
  if (walletHp(s) <= 0.2) return `${name} is getting tired. ${money(s.remaining)} has to last the rest of ${label}.`;
  return `${name} is in good shape. ${money(s.remaining)} left from ${label}'s pay.`;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals, transactions, partnerId, trainerId, caught, names] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getTransactions(month),
    getPartnerId(),
    getTrainerId(),
    getCaught(),
    getPokemonNames(),
  ]);

  const summary = summarizeMonth(totals, month);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);

  if (!partner) {
    return (
      <>
        <Typewriter
          lines={[
            "Welcome to the world of budgeting, trainer!",
            "Every peso you log makes your partner stronger. Choose who will guard your wallet.",
          ]}
        />
        <Panel title="Choose your partner">
          <PartnerPicker />
          <p className="mt-2 text-muted">It evolves at Lv 5 and Lv 10. You can switch later on the Setup tab.</p>
        </Panel>
      </>
    );
  }

  const hp = walletHp(summary);
  const mood = moodFor(summary);
  const quests = getQuests(categories, totals, month);
  const shiny = isShiny(quests, summary);
  const nextQuest = quests.find((q) => q.saving && !q.complete);

  // The category that has taken the most this month.
  const topHit = totals
    .filter((t) => t.month === `${month}-01` && t.kind === "expense")
    .sort((a, b) => b.total - a.total)[0];
  const topName = categories.find((c) => c.id === topHit?.category_id)?.name;

  const lines = [narrate(summary, month, partner.name)];
  if (topHit && topName) lines.push(`Its toughest opponent so far is ${topName}, at ${money(topHit.total)}.`);
  if (shiny) lines.push(`Every quest is complete, so ${partner.name} is shining this month!`);
  // What comes round every month and has not been logged yet.
  const waiting = categories.filter(
    (c) => c.is_fixed && !c.archived_at && !totals.some((t) => t.month === `${month}-01` && t.category_id === c.id),
  );
  if (waiting.length > 0) {
    const first = waiting.slice(0, 3).map((c) => c.name).join(", ");
    lines.push(`Still to log this month: ${first}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}.`);
  } else if (nextQuest) {
    lines.push(`Set aside ${money(nextQuest.target - nextQuest.done)} more in ${nextQuest.category.name} to finish a quest.`);
  }

  // Bank balance at the end of each of the last six months.
  const balances = [-5, -4, -3, -2, -1, 0].map((n) => {
    const m = shiftMonth(month, n);
    return { label: monthLabel(m).slice(0, 3), value: summarizeMonth(totals, m).balance };
  });

  return (
    <>
      <MonthPicker month={month} path="/" />

      <section className="box p-0!" aria-label="Wallet status">
        <Scene>
          <img src={sprite.trainer(trainerId)} alt="" className="pixel sprite scene-trainer" />
          <div className="scene-partner">
            <PartnerSprite dex={partner.dex} name={partner.name} mood={mood} shiny={shiny} />
          </div>
          <WildPokemon balls={Math.max(0, player.entries - caught.length)} caught={caught} names={names} />
          <div className="hpbox hpbox-me scene-status">
            <div className="flex items-baseline justify-between gap-2 font-display text-[0.65rem] leading-relaxed">
              <span>
                {partner.name}
                {shiny && <span className="star" title="Shiny" />}
              </span>
              <span>Lv {player.level}</span>
            </div>
            <div className="grid grid-cols-[1.75rem_1fr] items-center gap-x-1">
              <span className="font-display text-[0.6rem] text-gold">HP</span>
              <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's income left" />
            </div>
            <p className="text-right leading-none">
              {money(Math.max(0, summary.remaining))} / {money(summary.income)}
            </p>
          </div>
        </Scene>
        {/* On a phone the status box would cover the scene, so name and HP sit here instead. */}
        <div className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 gap-y-1.5 p-3">
          <p className="col-span-3 flex justify-between font-display text-[0.65rem] leading-relaxed sm:hidden">
            <span>
              {partner.name}
              {shiny && <span className="star" title="Shiny" />}
            </span>
            <span>Lv {player.level}</span>
          </p>
          <span className="font-display text-[0.6rem] text-gold sm:hidden">HP</span>
          <span className="sm:hidden">
            <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's income left" />
          </span>
          <span className="text-muted sm:hidden">{money(Math.max(0, summary.remaining))}</span>
          <span className="font-display text-[0.6rem] text-blue">XP</span>
          <Bar ratio={player.xpIntoLevel / player.xpForNext} tone="blue" label="Progress to next level" />
          <span className="text-muted">
            {player.xpIntoLevel} / {player.xpForNext}
          </span>
        </div>
      </section>

      {/* Message on the left, commands on the right, as in a battle. */}
      <div className="battle-bottom">
        <Typewriter lines={lines} />
        <nav className="window menu commands" aria-label="Shortcuts" data-menu>
          <Link href="/log" className="menu-item" data-sfx="confirm">
            Log
          </Link>
          <Link href="/battle" className="menu-item" data-sfx="confirm">
            Battle
          </Link>
          <Link href={`/stats?m=${month}`} className="menu-item">
            Stats
          </Link>
          <Link href={`/quests?m=${month}`} className="menu-item">
            Quests
          </Link>
        </nav>
      </div>

      <div className="tiles">
        <Panel title={`${monthLabel(month).split(" ")[0]}'s pay`} aside={<span>{money(summary.income)}</span>}>
          {summary.income === 0 && summary.expense === 0 ? (
            <p className="text-muted">Log your pay and this bar shows where it goes.</p>
          ) : (
            <PaySplit income={summary.income} expense={summary.expense} saving={summary.saving} />
          )}
        </Panel>

        <Panel title="Bank balance" aside={<span>{money(summary.balance)}</span>}>
          <StepLine points={balances} label="Bank balance at the end of each of the last six months" />
        </Panel>
      </div>

      <Panel
        title="Latest entries"
        aside={
          <Link href={`/log?m=${month}`} className="underline">
            See all
          </Link>
        }
      >
        {transactions.length === 0 ? (
          <p className="text-muted">Nothing logged this month. Each entry earns 10 XP and a Poké Ball.</p>
        ) : (
          <EntryList entries={transactions.slice(0, 5)} />
        )}
      </Panel>
    </>
  );
}
