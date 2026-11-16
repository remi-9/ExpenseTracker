import Link from "next/link";
import { Bar, Dialog, hpTone, MonthPicker, Panel } from "@/components/ui";
import { getCategories, getMonthTotals, getTransactions } from "@/lib/data";
import { dayLabel, money, monthLabel, parseMonth } from "@/lib/format";
import { BADGES, getPlayer, summarizeMonth, walletHp, type MonthSummary } from "@/lib/game";

function narrate(s: MonthSummary, month: string): string {
  const label = monthLabel(month);
  if (s.income === 0 && s.expense === 0) return `Nothing logged for ${label} yet. Log your pay to start the month.`;
  if (s.income === 0) return `${money(s.expense)} spent in ${label}, but no income logged yet.`;
  if (s.remaining < 0) return `Wallet fainted! You're ${money(-s.remaining)} over what you earned in ${label}.`;
  if (walletHp(s) <= 0.2) return `Wallet HP is low! ${money(s.remaining)} has to last the rest of ${label}.`;
  return `${money(s.remaining)} left from ${label}'s pay. Looking strong.`;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals, transactions] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getTransactions(month),
  ]);

  const summary = summarizeMonth(totals, month);
  const player = getPlayer(totals);
  const hp = walletHp(summary);

  const monthRows = totals.filter((t) => t.month === `${month}-01`);
  const totalFor = (id: string) => monthRows.find((t) => t.category_id === id)?.total ?? 0;
  const byName = (id: string) => categories.find((c) => c.id === id);

  const spending = monthRows.filter((t) => t.kind === "expense").sort((a, b) => b.total - a.total);
  const biggest = spending[0]?.total ?? 0;
  const quests = categories.filter((c) => c.monthly_target != null && c.kind !== "income" && !c.archived_at);

  return (
    <>
      <MonthPicker month={month} path="/" />

      {/* Status box: the one thing to read at a glance. */}
      <section className="box flex flex-col gap-3" aria-label="Wallet status">
        <div className="flex items-baseline justify-between gap-3 font-display text-xs leading-relaxed">
          <span>Wallet</span>
          <span>
            Lv {player.level} {player.rank}
          </span>
        </div>
        <div className="grid grid-cols-[2.5rem_1fr] items-center gap-x-2 gap-y-2">
          <span className="font-display text-[0.65rem] text-gold">HP</span>
          <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's income left" />
          <span className="font-display text-[0.65rem] text-blue">XP</span>
          <Bar ratio={player.xpIntoLevel / player.xpForNext} tone="blue" label="Progress to next level" />
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 text-muted">
          <span>
            {money(Math.max(0, summary.remaining))} / {money(summary.income)} left
          </span>
          <span>
            {player.xpIntoLevel} / {player.xpForNext} XP to Lv {player.level + 1}
          </span>
        </div>
      </section>

      <Dialog>{narrate(summary, month)}</Dialog>

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

      {quests.length > 0 && (
        <Panel title="Quests">
          <ul className="flex flex-col gap-3">
            {quests.map((c) => {
              const done = totalFor(c.id);
              const target = c.monthly_target!;
              const saving = c.kind === "saving";
              const complete = saving ? done >= target : done <= target;
              return (
                <li key={c.id} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3">
                    <span>
                      {c.icon} {saving ? `Set aside ${money(target)} in ${c.name}` : `Keep ${c.name} under ${money(target)}`}
                    </span>
                    <span className={complete ? "text-green" : "text-muted"}>
                      {saving && complete ? "Complete!" : `${money(done)} / ${money(target)}`}
                    </span>
                  </div>
                  <Bar
                    ratio={done / target}
                    tone={saving ? "gold" : done > target ? "red" : "green"}
                    label={`${c.name} progress`}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid sm:grid-cols-2">
        <Panel title="Where it went">
          {spending.length === 0 ? (
            <p className="text-muted">No spending logged this month.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {spending.map((t) => {
                const c = byName(t.category_id);
                return (
                  <li key={t.category_id}>
                    <div className="flex justify-between gap-3">
                      <span>
                        {c?.icon} {c?.name}
                      </span>
                      <span>{money(t.total)}</span>
                    </div>
                    <Bar ratio={t.total / biggest} tone="red" label={`${c?.name} spending`} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Latest entries"
          aside={
            <Link href={`/log?m=${month}`} className="text-blue underline">
              See all
            </Link>
          }
        >
          {transactions.length === 0 ? (
            <p className="text-muted">
              Nothing yet. <Link href="/log" className="text-blue underline">Log an entry</Link> to earn 10 XP.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {transactions.slice(0, 6).map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {t.category.icon} {t.note ?? t.category.name}
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
      </div>

      <Panel title="Badges">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGES.map((b) => {
            const earned = b.earned({ player, totals, categories });
            return (
              <li key={b.id} className={`flex items-start gap-2 ${earned ? "" : "text-muted"}`}>
                <span className={`text-2xl ${earned ? "" : "opacity-40 grayscale"}`} aria-hidden>
                  {earned ? b.icon : "❔"}
                </span>
                <span>
                  {b.name}
                  <span className="block text-sm text-muted">{earned ? "Earned" : b.how}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
