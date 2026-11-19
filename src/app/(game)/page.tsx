import Link from "next/link";
import { PartnerPicker, PartnerSprite, type Mood } from "@/components/partner";
import { Scene } from "@/components/scene";
import { Typewriter } from "@/components/typewriter";
import { Bar, CategoryIcon, hpTone, MonthPicker, Panel } from "@/components/ui";
import { getCategories, getMonthTotals, getPartnerId, getTransactions } from "@/lib/data";
import { dayLabel, money, monthLabel, parseMonth } from "@/lib/format";
import { getPlayer, getQuests, isShiny, summarizeMonth, walletHp, type MonthSummary } from "@/lib/game";
import { partnerAt } from "@/lib/partners";

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
  const [categories, totals, transactions, partnerId] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getTransactions(month),
    getPartnerId(),
  ]);

  const summary = summarizeMonth(totals, month);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level);

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
          <p className="mt-2 text-muted">It evolves at Lv 5 and Lv 10. You can switch later on the Quests tab.</p>
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
  else if (nextQuest) {
    lines.push(`Set aside ${money(nextQuest.target - nextQuest.done)} more in ${nextQuest.category.name} to finish a quest.`);
  }

  return (
    <>
      <MonthPicker month={month} path="/" />

      <section className="box p-0!" aria-label="Wallet status">
        <Scene paused={mood === "fainted"}>
          <div className={`runner ${mood === "fainted" ? "" : "running"}`}>
            <PartnerSprite dex={partner.dex} name={partner.name} mood={mood} shiny={shiny} />
          </div>
          <div className="box absolute top-2 right-2 z-1 flex w-[min(60%,17rem)] flex-col gap-1 p-2!">
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
        <div className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 p-3">
          <span className="font-display text-[0.6rem] text-blue">XP</span>
          <Bar ratio={player.xpIntoLevel / player.xpForNext} tone="blue" label="Progress to next level" />
          <span className="text-muted">
            {player.xpIntoLevel} / {player.xpForNext}
          </span>
        </div>
      </section>

      <Typewriter lines={lines} />

      <div className="grid grid-cols-2">
        <Link href="/log" className="btn btn-primary py-3!">
          Log an entry
        </Link>
        <Link href={`/stats?m=${month}`} className="btn py-3!">
          See the stats
        </Link>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4">
        {[
          ["Earned", summary.income],
          ["Spent", summary.expense],
          ["Saved", summary.saving],
          ["Bank balance", summary.balance],
        ].map(([label, value]) => (
          <div key={label} className="box">
            <dt className="text-muted">{label}</dt>
            <dd className="font-display text-xs leading-loose">{money(value as number)}</dd>
          </div>
        ))}
      </dl>

      <Panel
        title="Latest entries"
        aside={
          <Link href={`/log?m=${month}`} className="text-blue underline">
            See all
          </Link>
        }
      >
        {transactions.length === 0 ? (
          <p className="text-muted">Nothing logged this month. Each entry earns 10 XP.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {transactions.slice(0, 5).map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="truncate">
                  <CategoryIcon icon={t.category.icon} />
                  {t.note ?? t.category.name}
                  <span className="text-muted"> · {dayLabel(t.occurred_on)}</span>
                </span>
                <span className={t.category.kind === "income" ? "text-green" : ""}>
                  {t.category.kind === "income" ? "+" : "−"}
                  {money(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
