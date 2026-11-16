import { Dialog, MonthPicker, Panel } from "@/components/ui";
import { addTransaction, deleteTransaction } from "@/lib/actions";
import { getCategories, getTransactions } from "@/lib/data";
import { dayLabel, money, parseMonth, today } from "@/lib/format";
import type { Kind } from "@/lib/types";

const GROUPS: [Kind, string][] = [
  ["expense", "Spending"],
  ["income", "Income"],
  ["saving", "Savings"],
];

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; error?: string }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const [categories, transactions] = await Promise.all([getCategories(), getTransactions(month)]);
  const active = categories.filter((c) => !c.archived_at);

  return (
    <>
      {params.error && <Dialog tone="error">{params.error}</Dialog>}

      <Panel title="Log an entry">
        <form action={addTransaction} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            Category
            <select name="category_id" required className="field">
              {GROUPS.map(([kind, label]) => (
                <optgroup key={kind} label={label}>
                  {active
                    .filter((c) => c.kind === kind)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Amount
            <input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required className="field" />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input name="occurred_on" type="date" defaultValue={today()} required className="field" />
          </label>
          <label className="flex flex-col gap-1">
            Note
            <input name="note" placeholder="Optional, e.g. Custom table" className="field" />
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Save entry (+10 XP)</button>
          </div>
        </form>
      </Panel>

      <MonthPicker month={month} path="/log" />

      <Panel title="Entries">
        {transactions.length === 0 ? (
          <p className="text-muted">No entries this month. Use the form above to add the first one.</p>
        ) : (
          <ul className="flex flex-col">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 border-b-4 border-dotted border-track py-1 last:border-0"
              >
                <span className="min-w-0 truncate">
                  <span className="text-muted">{dayLabel(t.occurred_on)}</span> {t.category.icon} {t.category.name}
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={t.category.kind === "income" ? "text-green" : ""}>
                    {t.category.kind === "income" ? "+" : "−"}
                    {money(t.amount)}
                  </span>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="m" value={month} />
                    <button className="px-2 text-red" aria-label={`Delete ${t.note ?? t.category.name}`}>
                      ✕
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
