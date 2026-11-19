import Link from "next/link";
import { BattleResult } from "@/components/battle";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, MonthPicker, Panel } from "@/components/ui";
import { addTransaction, deleteTransaction } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/config";
import { getCategories, getMonthTotals, getPartnerId, getTransactions } from "@/lib/data";
import { dayLabel, money, parseMonth, today } from "@/lib/format";
import type { Kind } from "@/lib/types";

// Step 1 of the form: what kind of entry is it?
const KINDS: { kind: Kind; label: string }[] = [
  { kind: "expense", label: "I spent" },
  { kind: "income", label: "I earned" },
  { kind: "saving", label: "I saved" },
];

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; kind?: string; error?: string; saved?: string; cat?: string; t?: string }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const kind = KINDS.find((k) => k.kind === params.kind)?.kind ?? "expense";
  const [categories, transactions, totals, partnerId] = await Promise.all([
    getCategories(),
    getTransactions(month),
    getMonthTotals(),
    getPartnerId(),
  ]);
  const choices = categories.filter((c) => c.kind === kind && !c.archived_at);

  // Set by addTransaction after a save: play the result of that entry.
  const savedAmount = Number(params.saved);
  const savedCategory = categories.find((c) => c.id === params.cat);

  return (
    <>
      {params.error && <Dialog tone="error">{params.error}</Dialog>}
      {savedAmount > 0 && savedCategory && (
        <BattleResult
          key={params.t}
          kind={savedCategory.kind}
          amount={savedAmount}
          categoryName={savedCategory.name}
          month={month}
          totals={totals}
          partnerId={partnerId}
          demo={!isSupabaseConfigured}
        />
      )}

      <Panel title="Log an entry">
        <div className="mb-3 grid grid-cols-3" role="tablist" aria-label="Kind of entry">
          {KINDS.map((k) => (
            <Link
              key={k.kind}
              href={`/log?kind=${k.kind}`}
              role="tab"
              aria-selected={k.kind === kind}
              className={`btn ${k.kind === kind ? "btn-selected" : ""}`}
            >
              {k.label}
            </Link>
          ))}
        </div>

        {choices.length === 0 ? (
          <p className="text-muted">
            No categories of this kind yet.{" "}
            <Link href="/categories" className="text-blue underline">
              Add one
            </Link>{" "}
            first.
          </p>
        ) : (
          <form action={addTransaction} className="flex flex-col gap-3">
            <input type="hidden" name="kind" value={kind} />

            <label className="flex flex-col gap-1">
              How much?
              <span className="flex">
                <span className="grid place-items-center bg-ink px-3 font-display text-xs text-panel">₱</span>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  placeholder="0"
                  className="field text-2xl"
                />
              </span>
            </label>

            <fieldset>
              <legend className="mb-1">{kind === "income" ? "From what?" : kind === "saving" ? "Into what?" : "On what?"}</legend>
              <div className="flex flex-wrap">
                {choices.map((c, i) => (
                  <label key={c.id} className="chip">
                    <input type="radio" name="category_id" value={c.id} defaultChecked={i === 0} required />
                    <CategoryIcon icon={c.icon} />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                When?
                <input name="occurred_on" type="date" defaultValue={today()} required className="field" />
              </label>
              <label className="flex flex-col gap-1">
                Note
                <input name="note" placeholder="Optional, e.g. Custom table" className="field" />
              </label>
            </div>

            <SubmitButton className="btn btn-primary py-3!">Save entry (+10 XP)</SubmitButton>
          </form>
        )}
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
                  <span className="text-muted">{dayLabel(t.occurred_on)}</span> <CategoryIcon icon={t.category.icon} />
                  {t.category.name}
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
                    <SubmitButton className="px-2 text-red" pending="…">
                      <span aria-label={`Delete ${t.note ?? t.category.name}`}>✕</span>
                    </SubmitButton>
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
