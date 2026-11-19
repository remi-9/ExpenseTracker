/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprite */
import Link from "next/link";
import { BattleResult } from "@/components/battle";
import { PlayOnMount } from "@/components/sound";
import { Hearts } from "@/components/sprite";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, EntryList, MonthPicker, Panel } from "@/components/ui";
import { addTransaction, deleteTransaction } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/config";
import { getCategories, getMonthTotals, getPartnerId, getPokemonNames, getTransactions } from "@/lib/data";
import { dayLabel, money, parseMonth, today } from "@/lib/format";
import { getPlayer, summarizeMonth, walletHp } from "@/lib/game";
import { partnerAt, sprite } from "@/lib/partners";
import type { Kind } from "@/lib/types";

// Step 1 of the form: what kind of entry is it?
const KINDS: { kind: Kind; label: string; ask: string }[] = [
  { kind: "expense", label: "I spent", ask: "On what?" },
  { kind: "income", label: "I earned", ask: "From what?" },
  { kind: "saving", label: "I saved", ask: "Into what?" },
];

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string;
    kind?: string;
    error?: string;
    saved?: string;
    cat?: string;
    t?: string;
    del?: string;
  }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const current = KINDS.find((k) => k.kind === params.kind) ?? KINDS[0];
  const [categories, transactions, totals, partnerId, names] = await Promise.all([
    getCategories(),
    getTransactions(month),
    getMonthTotals(),
    getPartnerId(),
    getPokemonNames(),
  ]);
  const choices = categories.filter((c) => c.kind === current.kind && !c.archived_at);
  const summary = summarizeMonth(totals, month);
  const partner = partnerAt(partnerId, getPlayer(totals).level, names);

  // Set by addTransaction after a save: play the result of that entry.
  const savedAmount = Number(params.saved);
  const savedCategory = categories.find((c) => c.id === params.cat);
  // Set by the ✕ on an entry: ask before tossing it.
  const tossing = transactions.find((t) => t.id === params.del);

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}
      {savedAmount > 0 && savedCategory && (
        <BattleResult
          key={params.t}
          kind={savedCategory.kind}
          amount={savedAmount}
          categoryName={savedCategory.name}
          month={month}
          totals={totals}
          partnerId={partnerId}
          names={names}
          demo={!isSupabaseConfigured}
        />
      )}

      {tossing && (
        <div className="battle-bottom">
          <p className="window battle-text" role="alert">
            Toss {tossing.note ?? tossing.category.name}, {money(tossing.amount)} from {dayLabel(tossing.occurred_on)}?
            It can&apos;t be undone.
          </p>
          <div className="window menu" data-menu>
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={tossing.id} />
              <input type="hidden" name="m" value={month} />
              <SubmitButton className="menu-item" pending="…" sfx="delete">
                Yes
              </SubmitButton>
            </form>
            <Link href={`/log?m=${month}`} scroll={false} className="menu-item" data-sfx="page" autoFocus>
              No
            </Link>
          </div>
        </div>
      )}

      {/* The counter: your money and the kind of entry on the left, the entry itself on the right. */}
      <div className="shop">
        <div>
          <dl className="window money-box">
            <dt>Money</dt>
            <dd>{money(summary.balance)}</dd>
            <dt title="Left from this month's income">Left</dt>
            <dd>{money(summary.remaining)}</dd>
          </dl>
          <nav className="window menu" aria-label="Kind of entry" data-menu>
            {KINDS.map((k) => (
              <Link
                key={k.kind}
                href={`/log?kind=${k.kind}`}
                scroll={false}
                className="menu-item"
                data-sfx="page"
                aria-current={k.kind === current.kind ? "true" : undefined}
              >
                {k.label}
              </Link>
            ))}
          </nav>
          {partner && (
            <div className="window keeper">
              <img src={sprite.pokemon(partner.dex)} alt="" className="pixel sprite-card" />
              <Hearts ratio={walletHp(summary)} size={16} />
              <span className="leading-tight text-muted">{partner.name} is minding the wallet.</span>
            </div>
          )}
        </div>

        <section className="window" aria-label="New entry">
          {choices.length === 0 ? (
            <p className="text-muted">
              Nothing in this pocket yet.{" "}
              <Link href={`/setup?s=bag&pocket=${current.kind}&new=1`} className="text-blue underline">
                Add a category
              </Link>{" "}
              first.
            </p>
          ) : (
            <form action={addTransaction} className="flex flex-col gap-3">
              <input type="hidden" name="kind" value={current.kind} />

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
                <legend className="mb-1">{current.ask}</legend>
                <div className="menu two-up" data-menu>
                  {choices.map((c, i) => (
                    <label key={c.id} className="menu-item">
                      <input type="radio" name="category_id" value={c.id} defaultChecked={i === 0} required />
                      <CategoryIcon icon={c.icon} size={24} />
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

              <SubmitButton className="btn btn-primary py-3!" sfx="none">
                Save entry (+10 XP, +1 Poké Ball)
              </SubmitButton>
            </form>
          )}
        </section>
      </div>

      <MonthPicker month={month} path="/log" />

      <Panel title="Entries">
        {transactions.length === 0 ? (
          <p className="text-muted">No entries this month. Use the counter above to add the first one.</p>
        ) : (
          <EntryList entries={transactions} tossHref={(t) => `/log?m=${month}&del=${t.id}`} />
        )}
      </Panel>
    </>
  );
}
