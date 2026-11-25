import type { CSSProperties } from "react";
import { SpendCalendar, Waffle, type Slice } from "@/components/charts";
import { Hearts } from "@/components/sprite";
import { CategoryIcon, Columns, MonthPicker, Panel } from "@/components/ui";
import { getCategories, getMonthTotals, getTransactions } from "@/lib/data";
import { dayLabel, money, monthLabel, parseMonth, shiftMonth } from "@/lib/format";
import { bestMonth, summarizeMonth, walletHp } from "@/lib/game";

const shortMonth = (month: string) => monthLabel(month).slice(0, 3);
const SERIES = 7; // categories that get their own colour; the rest fold into "Other"

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals, transactions] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getTransactions(month),
  ]);

  // Six months ending at the selected one.
  const months = [-5, -4, -3, -2, -1, 0].map((n) => shiftMonth(month, n));
  const history = months.map((m) => ({ month: m, ...summarizeMonth(totals, m) }));
  const peak = Math.max(1, ...history.flatMap((h) => [h.income, h.expense]));
  const summary = history[history.length - 1];

  // Hi-score: the finished month that ended with the most left over.
  const best = bestMonth(totals, parseMonth());

  // Spending by category. A category keeps its colour (by its place in the list)
  // whatever it ranks this month.
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const spending = totals
    .filter((t) => t.month === `${month}-01` && t.kind === "expense")
    .sort((a, b) => b.total - a.total);
  const slices: Slice[] = [];
  let other = 0;
  for (const t of spending) {
    const index = expenseCategories.findIndex((c) => c.id === t.category_id);
    const c = expenseCategories[index];
    if (!c || index >= SERIES) other += t.total;
    else slices.push({ id: c.id, name: c.name, value: t.total, color: `var(--c${index + 1})`, icon: <CategoryIcon icon={c.icon} size={24} /> });
  }
  if (other > 0) slices.push({ id: "other", name: "Other", value: other, color: "var(--muted)" });
  // Spending that paid a bill, against everything else.
  const fixed = transactions
    .filter((t) => t.bill_id && t.category.kind === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  // Spending per day of the month.
  const byDay = new Map<number, number>();
  for (const t of transactions) {
    if (t.category.kind !== "expense") continue;
    const day = Number(t.occurred_on.slice(8));
    byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
  }

  // The five most expensive days, each with the entry that cost the most.
  const biggestDays = [...byDay]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([day, total]) => {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const top = transactions
        .filter((t) => t.occurred_on === date && t.category.kind === "expense")
        .sort((a, b) => b.amount - a.amount)[0];
      return { date, total, top };
    });

  return (
    <>
      <MonthPicker month={month} path="/stats" />

      <section className="box hud" aria-label="Score">
        <div>
          <span className="text-muted">Score</span>
          <strong>{money(summary.remaining)}</strong>
          <span className="text-muted">left over this month</span>
        </div>
        <div>
          <span className="text-muted">Hi-score</span>
          <strong>{best ? money(best.left) : "None yet"}</strong>
          <span className="text-muted">{best ? monthLabel(best.month) : "no months yet"}</span>
        </div>
        <div>
          <span className="text-muted">Life</span>
          <Hearts ratio={walletHp(summary)} />
        </div>
      </section>

      {/* Wide windows: two stacks that fill on their own, so neither leaves a gap. Earned and
          spent with the biggest days on the left; where the month went and the calendar,
          which get the wider side, on the right. */}
      <Columns
        split="side"
        side={
          <>
            <Panel title={`Where ${monthLabel(month).split(" ")[0]} went`} aside={<span>{money(summary.expense)}</span>}>
              {slices.length === 0 ? (
                <p className="text-muted">No spending logged this month.</p>
              ) : (
                <>
                  <Waffle slices={slices} total={summary.expense} />
                  <p className="mt-3 text-muted">
                    Each square is 1% of the month&apos;s spending. Bills came to {money(fixed)}; everything else to{" "}
                    {money(summary.expense - fixed)}.
                  </p>
                </>
              )}
            </Panel>
            <Panel title="Day by day">
              <SpendCalendar month={month} byDay={byDay} />
            </Panel>
          </>
        }
      >
        <Panel
          title="Earned and spent"
          aside={
            <span className="flex gap-3">
              <span className="legend" style={{ "--tone": "var(--chart-earned)" } as CSSProperties}>
                Earned
              </span>
              <span className="legend" style={{ "--tone": "var(--chart-spent)" } as CSSProperties}>
                Spent
              </span>
            </span>
          }
        >
          <div className="chart" role="img" aria-label="Earned and spent per month. The table below has the figures.">
            {history.map((h) => (
              <div key={h.month} className="chart-month">
                <div className="chart-cols">
                  <span
                    title={`${monthLabel(h.month)}: earned ${money(h.income)}`}
                    style={{ "--h": (h.income / peak) * 100, "--tone": "var(--chart-earned)" } as CSSProperties}
                  />
                  <span
                    title={`${monthLabel(h.month)}: spent ${money(h.expense)}`}
                    style={{ "--h": (h.expense / peak) * 100, "--tone": "var(--chart-spent)" } as CSSProperties}
                  />
                </div>
                <span className={h.month === month ? "font-display text-[0.6rem]" : "text-muted"}>
                  {shortMonth(h.month)}
                </span>
              </div>
            ))}
          </div>

          <table className="mt-3 w-full text-right">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-normal">Month</th>
                <th className="font-normal">Earned</th>
                <th className="font-normal">Spent</th>
                <th className="font-normal">Left over</th>
              </tr>
            </thead>
            <tbody>
              {history
                .filter((h) => h.income || h.expense)
                .map((h) => (
                  <tr key={h.month} className="border-t-4 border-dotted border-track">
                    <td className="text-left">{monthLabel(h.month)}</td>
                    <td>{money(h.income)}</td>
                    <td>{money(h.expense)}</td>
                    <td className={h.remaining < 0 ? "text-red" : ""}>{money(h.remaining)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Biggest days">
          {biggestDays.length === 0 ? (
            <p className="text-muted">Nothing spent yet this month.</p>
          ) : (
            <ol className="entries">
              {biggestDays.map(({ date, total, top }) => (
                <li key={date}>
                  <span className="text-muted">{dayLabel(date)}</span>
                  <span className="min-w-0 break-words">
                    {top && <CategoryIcon icon={top.category.icon} />}
                    {top?.note ?? top?.category.name}
                  </span>
                  <span className="amount">{money(total)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </Columns>
    </>
  );
}
