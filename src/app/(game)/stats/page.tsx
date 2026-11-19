import type { CSSProperties } from "react";
import { Bar, CategoryIcon, MonthPicker, Panel } from "@/components/ui";
import { getCategories, getMonthTotals } from "@/lib/data";
import { money, monthLabel, parseMonth, shiftMonth } from "@/lib/format";
import { summarizeMonth } from "@/lib/game";

const shortMonth = (month: string) => monthLabel(month).slice(0, 3);

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = parseMonth((await searchParams).m);
  const [categories, totals] = await Promise.all([getCategories(), getMonthTotals()]);

  // Six months ending at the selected one.
  const months = [-5, -4, -3, -2, -1, 0].map((n) => shiftMonth(month, n));
  const history = months.map((m) => ({ month: m, ...summarizeMonth(totals, m) }));
  const peak = Math.max(1, ...history.flatMap((h) => [h.income, h.expense]));

  const summary = history[history.length - 1];
  const spending = totals
    .filter((t) => t.month === `${month}-01` && t.kind === "expense")
    .sort((a, b) => b.total - a.total);
  const biggest = spending[0]?.total ?? 0;
  const category = (id: string) => categories.find((c) => c.id === id);
  const fixed = spending.filter((t) => category(t.category_id)?.is_fixed).reduce((sum, t) => sum + t.total, 0);

  return (
    <>
      <MonthPicker month={month} path="/stats" />

      <dl className="grid grid-cols-3">
        {[
          ["Fixed bills", fixed],
          ["Everything else", summary.expense - fixed],
          ["Left over", summary.remaining],
        ].map(([label, value]) => (
          <div key={label} className="box">
            <dt className="text-muted">{label}</dt>
            <dd className="font-display text-xs leading-loose">{money(value as number)}</dd>
          </div>
        ))}
      </dl>

      <Panel
        title="Earned and spent, last six months"
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

      <Panel title={`Where ${monthLabel(month)} went`}>
        {spending.length === 0 ? (
          <p className="text-muted">No spending logged this month.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {spending.map((t) => {
              const c = category(t.category_id);
              return (
                <li key={t.category_id}>
                  <div className="flex justify-between gap-3">
                    <span>
                      {c && <CategoryIcon icon={c.icon} />}
                      {c?.name}
                    </span>
                    <span>
                      {money(t.total)}
                      <span className="text-muted"> · {Math.round((t.total / summary.expense) * 100)}%</span>
                    </span>
                  </div>
                  <Bar ratio={t.total / biggest} tone="red" label={`${c?.name} spending`} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
