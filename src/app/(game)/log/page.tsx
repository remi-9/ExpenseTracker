/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprite */
import Link from "next/link";
import { EntryResult } from "@/components/entry-result";
import { PlayOnMount } from "@/components/sound";
import { Hearts } from "@/components/sprite";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, EntryAmount, EntryWhat, MonthPicker, Panel } from "@/components/ui";
import { addTransaction, deleteTransaction, logMonthly, updateTransaction } from "@/lib/actions";
import { getCategories, getMonthTotals, getPartnerId, getPokemonNames, getTransactions } from "@/lib/data";
import { dayLong, money, parseMonth, shiftMonth, today } from "@/lib/format";
import { getPlayer, summarizeMonth, walletHp } from "@/lib/game";
import { partnerAt, sprite } from "@/lib/partners";
import type { Kind, Transaction } from "@/lib/types";

const KINDS: { kind: Kind; label: string; ask: string }[] = [
  { kind: "expense", label: "I spent", ask: "On what?" },
  { kind: "income", label: "I earned", ask: "From what?" },
  { kind: "saving", label: "I saved", ask: "Into what?" },
];

const DONE: Record<string, string> = {
  updated: "Entry updated.",
  undone: "Undone. That entry is gone.",
  tossed: "Entry tossed.",
};

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string;
    /** Kept from the last save, so the next entry starts where you left off. */
    kind?: string;
    cat?: string;
    /** Set by a save: the amount and id of the entry, to play its result. */
    saved?: string;
    id?: string;
    t?: string;
    error?: string;
    edit?: string;
    del?: string;
    done?: string;
  }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const [categories, transactions, totals, partnerId, names] = await Promise.all([
    getCategories(),
    getTransactions(month),
    getMonthTotals(),
    getPartnerId(),
    getPokemonNames(),
  ]);
  const summary = summarizeMonth(totals, month);
  const partner = partnerAt(partnerId, getPlayer(totals).level, names);
  const thisMonth = today().startsWith(month);

  const editing = transactions.find((t) => t.id === params.edit);
  const tossing = transactions.find((t) => t.id === params.del);
  const savedCategory = categories.find((c) => c.id === params.cat);
  const savedAmount = Number(params.saved);

  // Categories keep the order they have in Setup, so each stays where your hand expects it.
  // The form opens on the kind and category you used last.
  const choices = (kind: Kind) => categories.filter((c) => c.kind === kind && !c.archived_at);
  const kind = editing?.category.kind ?? KINDS.find((k) => k.kind === params.kind)?.kind ?? "expense";
  const picked = editing?.category_id ?? params.cat;
  const notes = [...new Set(transactions.map((t) => t.note).filter(Boolean))] as string[];

  // The monthly checklist: categories marked "every month", with what is still to log.
  const totalIn = (m: string, id: string) => totals.find((t) => t.month === `${m}-01` && t.category_id === id)?.total ?? 0;
  const monthly = categories
    .filter((c) => c.is_fixed && !c.archived_at)
    .map((c) => ({ c, logged: totalIn(month, c.id), last: totalIn(shiftMonth(month, -1), c.id) }));

  // Entries, newest day first.
  const days = new Map<string, Transaction[]>();
  for (const t of transactions) days.set(t.occurred_on, [...(days.get(t.occurred_on) ?? []), t]);

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}
      {params.done && DONE[params.done] && <Dialog>{DONE[params.done]}</Dialog>}

      {tossing && (
        <div className="battle-bottom">
          <p className="window battle-text" role="alert">
            Toss {tossing.note ?? tossing.category.name}, {money(tossing.amount)} from {dayLong(tossing.occurred_on)}?
          </p>
          <div className="window menu" data-menu>
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={tossing.id} />
              <input type="hidden" name="m" value={month} />
              <SubmitButton className="menu-item" pending="…" sfx="delete">
                Yes
              </SubmitButton>
            </form>
            <Link href={`/log?m=${month}`} scroll={false} className="menu-item" data-sfx="page">
              No
            </Link>
          </div>
        </div>
      )}

      {/* The counter: your money on the left, the entry on the right. */}
      <div className="shop">
        <div>
          <dl className="window money-box">
            <dt>Money</dt>
            <dd>{money(summary.balance)}</dd>
            <dt title="Left from this month's income">Left</dt>
            <dd>{money(summary.remaining)}</dd>
          </dl>
          {partner && (
            <div className="window keeper">
              <img src={sprite.pokemon(partner.dex)} alt="" className="pixel sprite-card" />
              <Hearts ratio={walletHp(summary)} size={16} />
              <span className="leading-tight text-muted">{partner.name} is minding the wallet.</span>
            </div>
          )}
        </div>

        {/* Re-keyed after every save, so the amount clears and takes the cursor again. */}
        <form
          key={editing?.id ?? params.t ?? "new"}
          action={editing ? updateTransaction : addTransaction}
          className="window entry-form"
          aria-label={editing ? "Edit entry" : "New entry"}
        >
          {editing && (
            <>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="m" value={month} />
              <h2 className="font-display text-xs leading-relaxed">Edit entry</h2>
            </>
          )}

          <div className="flex flex-wrap" role="radiogroup" aria-label="Kind of entry">
            {KINDS.map((k) => (
              <label key={k.kind} className="chip">
                <input type="radio" name="kind" value={k.kind} defaultChecked={k.kind === kind} />
                {k.label}
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            How much?
            <span className="flex">
              <span className="grid place-items-center bg-ink px-3 font-display text-xs text-panel">₱</span>
              <input
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                required
                autoFocus
                defaultValue={editing?.amount}
                placeholder="0"
                aria-describedby="amount-hint"
                className="field text-2xl"
              />
            </span>
            <small id="amount-hint" className="text-muted">
              Sums work too, like 5390+764.
            </small>
          </label>

          {/* One list per kind; the stylesheet shows the list for the kind that is checked. */}
          {KINDS.map((k) => {
            const list = choices(k.kind);
            const first = list.find((c) => c.id === picked) ?? list[0];
            return (
              <fieldset key={k.kind} className="kind-cats" data-kind={k.kind}>
                <legend className="mb-1">{k.ask}</legend>
                {list.length === 0 ? (
                  <p className="text-muted">
                    Nothing in this pocket yet.{" "}
                    <Link href={`/setup?s=bag&pocket=${k.kind}&new=1`} className="text-blue underline">
                      Add a category
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="flex flex-wrap">
                    {list.map((c) => (
                      <label key={c.id} className="chip">
                        <input type="radio" name={`category_${k.kind}`} value={c.id} defaultChecked={c.id === first.id} />
                        <CategoryIcon icon={c.icon} size={24} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}

          <fieldset>
            <legend className="mb-1">When?</legend>
            <div className="flex flex-wrap items-center">
              {thisMonth && !editing && (
                <>
                  <label className="chip">
                    <input type="radio" name="when" value="today" defaultChecked />
                    Today
                  </label>
                  <label className="chip">
                    <input type="radio" name="when" value="yesterday" />
                    Yesterday
                  </label>
                </>
              )}
              <label className="chip">
                <input type="radio" name="when" value="date" defaultChecked={!thisMonth || !!editing} />
                Another day
              </label>
              <input
                name="occurred_on"
                type="date"
                aria-label="Date"
                defaultValue={editing?.occurred_on ?? (thisMonth ? today() : `${month}-01`)}
                className="field when-date"
              />
            </div>
          </fieldset>

          <label className="flex flex-col gap-1">
            Note
            <input name="note" list="notes" defaultValue={editing?.note ?? ""} placeholder="Optional, e.g. Custom table" className="field" />
            <datalist id="notes">
              {notes.map((note) => (
                <option key={note} value={note} />
              ))}
            </datalist>
          </label>

          {editing ? (
            <div className="flex flex-wrap items-center justify-between">
              <Link href={`/log?m=${month}&del=${editing.id}`} className="px-2 text-red underline">
                Toss this entry
              </Link>
              <span className="flex flex-wrap">
                <Link href={`/log?m=${month}`} className="btn" data-sfx="page">
                  Cancel
                </Link>
                <SubmitButton sfx="confirm">Save changes</SubmitButton>
              </span>
            </div>
          ) : (
            <SubmitButton className="btn btn-primary py-3!" sfx="none">
              Save entry
            </SubmitButton>
          )}
        </form>
      </div>

      {savedAmount > 0 && savedCategory && params.id && !editing && (
        <EntryResult
          key={params.t}
          kind={savedCategory.kind}
          amount={savedAmount}
          categoryName={savedCategory.name}
          month={month}
          totals={totals}
          partnerId={partnerId}
          names={names}
          entryId={params.id}
        />
      )}

      <Panel
        title="Monthly checklist"
        aside={
          monthly.length > 0 ? (
            <span>
              {monthly.filter((row) => row.logged > 0).length} of {monthly.length} logged
            </span>
          ) : undefined
        }
      >
        {monthly.length === 0 ? (
          <p className="text-muted">
            Things that come round every month, like pay, rent and bills, can be logged from here in one tap. In Setup,
            open a category in the Bag and choose Make monthly.
          </p>
        ) : (
          <ul className="checklist">
            {monthly.map(({ c, logged, last }) => (
              <li key={c.id}>
                <span className="truncate">
                  <CategoryIcon icon={c.icon} />
                  {c.name}
                </span>
                {logged > 0 ? (
                  <span className="text-green">Logged {money(logged)}</span>
                ) : (
                  <form action={logMonthly}>
                    <input type="hidden" name="category_id" value={c.id} />
                    <input type="hidden" name="m" value={month} />
                    <input
                      name="amount"
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      defaultValue={last || undefined}
                      placeholder="Amount"
                      aria-label={`Amount for ${c.name}`}
                      title={last ? `Last month: ${money(last)}` : undefined}
                      className="field"
                    />
                    <SubmitButton className="btn" pending="…" sfx="none">
                      Log
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <MonthPicker month={month} path="/log" />

      <Panel title="Entries" aside={<span>{transactions.length}</span>}>
        {transactions.length === 0 ? (
          <p className="text-muted">No entries this month. Use the counter above to add the first one.</p>
        ) : (
          [...days].map(([date, list]) => (
            <section key={date} className="mb-3 last:mb-0">
              <h3 className="day-head">
                <span>{dayLong(date)}</span>
                <span>
                  {money(list.filter((t) => t.category.kind === "expense").reduce((sum, t) => sum + t.amount, 0))} spent
                </span>
              </h3>
              <ul className="entries by-day">
                {list.map((t) => (
                  <li key={t.id}>
                    <Link href={`/log?m=${month}&edit=${t.id}`} aria-label={`Edit ${t.note ?? t.category.name}`}>
                      <EntryWhat entry={t} />
                      <EntryAmount entry={t} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Panel>
    </>
  );
}
