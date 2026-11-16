/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import { PartnerPicker, PartnerSprite } from "@/components/partner";
import { Bar, MonthPicker, Panel } from "@/components/ui";
import { getCategories, getMonthTotals, getPartnerId } from "@/lib/data";
import { money, parseMonth } from "@/lib/format";
import { BADGES, getPlayer } from "@/lib/game";
import { partnerAt, sprite } from "@/lib/partners";

export default async function QuestsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals, partnerId] = await Promise.all([getCategories(), getMonthTotals(), getPartnerId()]);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level);

  const monthRows = totals.filter((t) => t.month === `${month}-01`);
  const quests = categories
    .filter((c) => c.monthly_target != null && c.kind !== "income" && !c.archived_at)
    .map((c) => {
      const done = monthRows.find((t) => t.category_id === c.id)?.total ?? 0;
      const target = c.monthly_target!;
      const saving = c.kind === "saving";
      return { c, done, target, saving, complete: saving ? done >= target : done <= target };
    });
  const badges = BADGES.map((b) => ({ ...b, has: b.earned({ player, totals, categories }) }));

  return (
    <>
      <section className="box flex items-center gap-4" aria-label="Trainer card">
        {partner && <PartnerSprite dex={partner.dex} name={partner.name} height={80} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-display text-sm leading-relaxed">
            Lv {player.level} {player.rank}
          </h1>
          <Bar ratio={player.xpIntoLevel / player.xpForNext} tone="blue" label="Progress to next level" />
          <p className="text-muted">
            {player.xpForNext - player.xpIntoLevel} XP to Lv {player.level + 1} · {player.entries} entries logged ·{" "}
            {money(player.saved)} saved
          </p>
          {partner?.nextName && (
            <p className="text-muted">
              {partner.name} evolves into {partner.nextName} at Lv {partner.evolvesAt}.
            </p>
          )}
        </div>
      </section>

      <MonthPicker month={month} path="/quests" />

      <Panel title="Quests this month">
        {quests.length === 0 ? (
          <p className="text-muted">
            No quests yet. Give a category a monthly target on the Categories tab and it shows up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {quests.map(({ c, done, target, saving, complete }) => (
              <li key={c.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3">
                  <span>
                    {c.icon} {saving ? `Set aside ${money(target)} in ${c.name}` : `Keep ${c.name} under ${money(target)}`}
                  </span>
                  <span className={complete ? "text-green" : "text-muted"}>
                    {saving && complete ? "Complete!" : `${money(done)} / ${money(target)}`}
                  </span>
                </div>
                <Bar ratio={done / target} tone={saving ? "gold" : done > target ? "red" : "green"} label={`${c.name} progress`} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Badges"
        aside={
          <span className="text-muted">
            {badges.filter((b) => b.has).length} of {badges.length}
          </span>
        }
      >
        <ul className="grid grid-cols-2 sm:grid-cols-3">
          {badges.map((b) => (
            <li key={b.id} className={`medal ${b.has ? "" : "locked"}`}>
              <img src={sprite.badge(b.sprite)} alt="" width={56} height={56} />
              <span className="font-display text-[0.6rem] leading-relaxed">{b.name}</span>
              <span className="leading-tight text-muted">{b.has ? "Earned" : b.how}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Partner">
        <PartnerPicker current={partner?.id} />
      </Panel>
    </>
  );
}
