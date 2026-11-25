/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import { PartnerSprite } from "@/components/partner";
import { Chest, Icon, Shield, type IconName } from "@/components/sprite";
import { Bar, CategoryIcon, Columns, MonthPicker, Panel } from "@/components/ui";
import {
  getAccounts,
  getBillPayments,
  getBills,
  getCaught,
  getCategories,
  getMonthTotals,
  getPartnerId,
  getPokemonNames,
  getTrainerId,
  getTransactions,
} from "@/lib/data";
import { money, monthLabel, parseMonth, shiftMonth, today } from "@/lib/format";
import { BADGES, getChallenges, getPlayer, getQuests, isShiny, REGIONS, summarizeMonth, type Challenge } from "@/lib/game";
import { billsFor, openingTotal } from "@/lib/money";

/** The icon beside each monthly challenge. */
const CHALLENGE_ICON: Record<Challenge["id"], IconName> = { bills: "pc", days: "log", less: "stats" };
import { partnerAt, sprite, TRAINERS } from "@/lib/partners";

export default async function QuestsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals, partnerId, trainerId, names, caught, accounts, bills, payments, entries] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getPartnerId(),
    getTrainerId(),
    getPokemonNames(),
    getCaught(),
    getAccounts(),
    getBills(),
    getBillPayments(month),
    getTransactions(month),
  ]);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);
  const trainer = TRAINERS.find((t) => t.id === trainerId)!;

  const quests = getQuests(categories, totals, month);
  const summary = summarizeMonth(totals, month);
  const shiny = isShiny(quests, summary);
  const challenges = getChallenges({
    bills: billsFor(month, bills, payments, today()),
    loggedDays: new Set(entries.map((e) => e.occurred_on)).size,
    spent: summary.expense,
    lastSpent: summarizeMonth(totals, shiftMonth(month, -1)).expense,
    finished: month < parseMonth(),
  });
  const figure = (c: Challenge, n: number) => (c.money ? money(n) : String(n));
  const badges = BADGES.map((b) => ({ ...b, has: b.earned({ player, totals, categories, caught: caught.length }) }));

  // Trainer card facts. "Money" is everything you hold as of the current month.
  const balance = summarizeMonth(totals, parseMonth(), openingTotal(accounts)).balance;
  const firstMonth = totals.map((t) => t.month).sort()[0];
  const facts: [string, string][] = [
    ["Name", trainer.name],
    ["Rank", `Lv ${player.level} ${player.rank}`],
    ["Money", money(balance)],
    ["Pokédex", String(caught.length)],
    ["Saved", money(player.saved)],
    ["Entries", String(player.entries)],
  ];
  if (firstMonth) facts.push(["Since", monthLabel(firstMonth.slice(0, 7))]);

  return (
    <>
      {/* Wide windows: the trainer card beside the month's quests; badges below. */}
      <Columns split="even"
        side={
          <>
            <MonthPicker month={month} path="/quests" />

            <Panel title="Quests this month" aside={shiny ? <span><span className="star" />Shiny month</span> : undefined}>
              <ul className="flex flex-col gap-3">
                {quests.map(({ category: c, done, target, saving, complete }) => (
                  <li key={c.id} className="flex items-center gap-3">
                    {saving ? <Chest open={complete} /> : <Shield broken={!complete} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex justify-between gap-3">
                        <span className="min-w-0">
                          <CategoryIcon icon={c.icon} />
                          {saving ? `Set aside ${money(target)} in ${c.name}` : `Keep ${c.name} under ${money(target)}`}
                        </span>
                        <span className={`shrink-0 ${complete ? "text-green" : saving ? "text-muted" : "text-red"}`}>
                          {saving && complete ? "Complete!" : `${money(done)} / ${money(target)}`}
                        </span>
                      </div>
                      <Bar ratio={done / target} tone={saving ? "gold" : done > target ? "red" : "green"} label={`${c.name} progress`} />
                    </div>
                  </li>
                ))}
                {challenges.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className={`quest-icon ${c.complete ? "done" : ""}`}>
                      <Icon name={CHALLENGE_ICON[c.id]} size={28} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex justify-between gap-3">
                        <span className="min-w-0">{c.title}</span>
                        <span
                          className={`shrink-0 ${c.complete ? "text-green" : c.lowerIsBetter && c.done > c.target ? "text-red" : "text-muted"}`}
                        >
                          {c.complete ? "Complete!" : `${figure(c, c.done)} / ${figure(c, c.target)}${c.status ? ` · ${c.status}` : ""}`}
                        </span>
                      </div>
                      <Bar
                        ratio={c.done / c.target}
                        tone={c.lowerIsBetter ? (c.done > c.target ? "red" : "green") : c.complete ? "gold" : "blue"}
                        label={`${c.title}: progress`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-muted">
                {quests.length === 0
                  ? "Give a category a monthly target in Setup for a budget or savings quest. Finish those and your partner turns shiny."
                  : shiny
                    ? "Every budget and savings quest is done: your partner is shining."
                    : "Finish every budget and savings quest and your partner turns shiny."}
              </p>
            </Panel>
          </>
        }
      >
        <section className="box trainer-card flex flex-col gap-3" aria-label="Trainer card">
          <header className="flex items-baseline justify-between gap-3 font-display text-xs leading-relaxed">
            <h1>Trainer card</h1>
            <span>
              {badges.filter((b) => b.has).length} / {badges.length} badges
            </span>
          </header>
          <div className="flex items-center gap-4 pt-3">
            <img src={sprite.trainer(trainer.id)} alt="" className="pixel sprite-card shrink-0" />
            {partner && <PartnerSprite dex={partner.dex} name={partner.name} shiny={shiny} card />}
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 leading-tight">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col gap-1">
            <Bar ratio={player.xpIntoLevel / player.xpForNext} tone="blue" label="Progress to next level" />
            {/* The badge case along the bottom of the card. */}
            <ul className="badge-case">
              {badges.map((b) => (
                <li key={b.id} title={b.has ? b.name : `${b.name}: ${b.how}`}>
                  <img src={sprite.badge(b.sprite)} alt={b.has ? b.name : `${b.name}, not earned`} className={b.has ? "" : "unearned"} />
                </li>
              ))}
            </ul>
            <p className="text-muted">
              {player.xpForNext - player.xpIntoLevel} XP to Lv {player.level + 1}.
              {partner?.nextName && ` ${partner.name} evolves into ${partner.nextName} at Lv ${partner.evolvesAt}.`}
            </p>
          </div>
        </section>
      </Columns>
      <Panel
        title="Badges"
        aside={
          <span>
            {badges.filter((b) => b.has).length} / {badges.length}
          </span>
        }
      >
        {REGIONS.map((region) => (
          <section key={region} className="mb-4 last:mb-0">
            <h3 className="mb-1 font-display text-[0.65rem] leading-loose text-muted uppercase">{region}</h3>
            <ul className="badge-grid grid grid-cols-2 sm:grid-cols-4">
              {badges
                .filter((b) => b.region === region)
                .map((b) => (
                  <li key={b.id} className={`medal ${b.has ? "" : "locked"}`}>
                    <img src={sprite.badge(b.sprite)} alt="" width={48} height={48} />
                    <span className="font-display text-[0.6rem] leading-relaxed">{b.name}</span>
                    <span className="leading-tight text-muted">{b.has ? "Earned" : b.how}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </Panel>
    </>
  );
}
