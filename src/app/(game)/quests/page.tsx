/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import { PartnerSprite } from "@/components/partner";
import { Chest, Shield } from "@/components/sprite";
import { Bar, CategoryIcon, MonthPicker, Panel } from "@/components/ui";
import { getCategories, getCaught, getMonthTotals, getPartnerId, getPokemonNames, getTrainerId } from "@/lib/data";
import { money, monthLabel, parseMonth } from "@/lib/format";
import { BADGES, getPlayer, getQuests, isShiny, summarizeMonth } from "@/lib/game";
import { partnerAt, sprite, TRAINERS } from "@/lib/partners";

export default async function QuestsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals, partnerId, trainerId, names, caught] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getPartnerId(),
    getTrainerId(),
    getPokemonNames(),
    getCaught(),
  ]);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);
  const trainer = TRAINERS.find((t) => t.id === trainerId)!;

  const quests = getQuests(categories, totals, month);
  const shiny = isShiny(quests, summarizeMonth(totals, month));
  const badges = BADGES.map((b) => ({ ...b, has: b.earned({ player, totals, categories }) }));

  // Trainer card facts. "Money" is the bank balance as of the current month.
  const balance = summarizeMonth(totals, parseMonth()).balance;
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
      <section className="box trainer-card flex flex-col gap-3" aria-label="Trainer card">
        <header className="flex items-baseline justify-between gap-3 font-display text-xs leading-relaxed">
          <h1>Trainer card</h1>
          <span>
            {badges.filter((b) => b.has).length} / {badges.length} badges
          </span>
        </header>
        <div className="flex items-end gap-3 pt-2">
          <img src={sprite.trainer(trainer.id)} alt="" className="pixel sprite-card shrink-0" />
          {partner && <PartnerSprite dex={partner.dex} name={partner.name} shiny={shiny} card />}
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 leading-tight">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate">{value}</dd>
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
            {player.xpForNext - player.xpIntoLevel} XP to Lv {player.level + 1}
            {partner?.nextName && ` · ${partner.name} evolves into ${partner.nextName} at Lv ${partner.evolvesAt}`}
          </p>
        </div>
      </section>

      <MonthPicker month={month} path="/quests" />

      <Panel title="Quests this month" aside={shiny ? <span><span className="star" />Shiny month</span> : undefined}>
        {quests.length === 0 ? (
          <p className="text-muted">
            No quests yet. Give a category a monthly target on the Setup tab and it shows up here.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {quests.map(({ category: c, done, target, saving, complete }) => (
                <li key={c.id} className="flex items-center gap-3">
                  {saving ? <Chest open={complete} /> : <Shield broken={!complete} />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
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
            </ul>
            {!shiny && (
              <p className="mt-3 text-muted">Complete every quest in a month and your partner turns shiny for it.</p>
            )}
          </>
        )}
      </Panel>

      <Panel title="Badges">
        <ul className="grid grid-cols-2 sm:grid-cols-4">
          {badges.map((b) => (
            <li key={b.id} className={`medal ${b.has ? "" : "locked"}`}>
              <img src={sprite.badge(b.sprite)} alt="" width={56} height={56} />
              <span className="font-display text-[0.6rem] leading-relaxed">{b.name}</span>
              <span className="leading-tight text-muted">{b.has ? "Earned" : b.how}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
