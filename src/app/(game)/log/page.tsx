/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprite */
import Link from "next/link";
import { EntryResult } from "@/components/entry-result";
import { PlayOnMount } from "@/components/sound";
import { Hearts } from "@/components/sprite";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, EntryAmount, EntryWhat, MonthPicker, Panel } from "@/components/ui";
import { addTransaction, deleteTransaction, logMonthly, updateTransaction } from "@/lib/actions";
import { getCategories, getMonthTotals, getPartnerId, getPokemonNames, getTransactions } from "@/lib/data";
import { dayLabel, dayLong, money, parseMonth, shiftMonth, today } from "@/lib/format";
import { getPlayer, summarizeMonth, walletHp } from "@/lib/game";
import { partnerAt, sprite } from "@/lib/partners";
import type { Kind } from "@/lib/types";

const KINDS: { kind: Kind; label: string; ask: string }[] = [
  { kind: "expense", label: "I spent", ask: "On what?" },
  { kind: "income", label: "I earned", ask: "From what?" },
  { kind: "saving", label: "I saved", ask: "Into what?" },
];

/** Entry cards per page: three rows of four on a wide screen. */
const PAGE_SIZE = 12;
const FILTERS: { kind?: Kind; label: string }[] = [
  { label: "All" },
  { kind: "expense", label: "Spent" },
  { kind: "income", label: "Earned" },
  { kind: "saving", label: "Saved" },
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
    /** Entries shown below: one kind only, and which page of them. */
    show?: string;
    p?: string;
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

  // What has gone in today, as a reminder while you log.
  const todays = transactions.filter((t) => t.occurred_on === today());
  const spentToday = todays.filter((t) => t.category.kind === "expense").reduce((sum, t) => sum + t.amount, 0);

  // The month's entries as cards, newest first: optionally one kind only, a page at a time.
  const show = FILTERS.find((f) => f.kind === params.show)?.kind;
  const shown = show ? transactions.filter((t) => t.category.kind === show) : transactions;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.p) || 1));
  const cards = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Pass null for "all kinds"; leave the kind out to keep the current filter.
  const entriesHref = (p: number, kind: Kind | null | undefined = show) =>
    `/log?m=${month}${kind ? `&show=${kind}` : ""}${p > 1 ? `&p=${p}` : ""}`;

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

      {/* The counter. Wide screens: status and the monthly checklist on the left, the entry
          on the right (placed by grid areas in globals.css). Phones: the order written here. */}
      <div className="shop">
        <div className="window shop-status">
          {partner && <img src={sprite.pokemon(partner.dex)} alt="" className="pixel sprite-card shrink-0" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <dl className="money-box">
              <dt>Money</dt>
              <dd>{money(summary.balance)}</dd>
              <dt title="Left from this month's income">Left</dt>
              <dd>{money(summary.remaining)}</dd>
            </dl>
            <Hearts ratio={walletHp(summary)} size={16} />
          </div>
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

        <Panel
          title="Monthly"
          className="shop-monthly"
          aside={
            monthly.length > 0 ? (
              <span>
                {monthly.filter((row) => row.logged > 0).length} of {monthly.length}
              </span>
            ) : undefined
          }
        >
          {monthly.length === 0 ? (
            <p className="text-muted">
              Pay, rent and bills that come round every month can be logged here in one tap. In Setup, open a category
              in the Bag and choose Make monthly.
            </p>
          ) : (
            <ul className="checklist">
              {monthly.map(({ c, logged, last }) => (
                <li key={c.id}>
                  <span className="truncate" title={c.name}>
                    <CategoryIcon icon={c.icon} size={24} />
                    {c.name}
                  </span>
                  {logged > 0 ? (
                    <span className="text-green">{money(logged)}</span>
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
          {/* What has gone in today, so you can see at a glance whether something is already logged. */}
          <section className="shop-today" aria-label="Today">
            <h3 className="day-head">
              <span>Today</span>
              <span>{money(spentToday)} spent</span>
            </h3>
            {todays.length === 0 ? (
              <p className="px-2 pt-1 text-muted">Nothing logged yet.</p>
            ) : (
              <ul className="entries by-day">
                {todays.map((t) => (
                  <li key={t.id}>
                    <Link href={`/log?m=${month}&edit=${t.id}`} aria-label={`Edit ${t.note ?? t.category.name}`}>
                      <EntryWhat entry={t} />
                      <EntryAmount entry={t} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Panel>
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

      <MonthPicker month={month} path="/log" />

      <Panel
        title="Entries"
        aside={
          shown.length > 0 ? (
            <span>
              {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, shown.length)} of {shown.length}
            </span>
          ) : undefined
        }
      >
        <nav className="mb-3 flex flex-wrap" aria-label="Show">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={entriesHref(1, f.kind ?? null)}
              scroll={false}
              className={`chip ${f.kind === show ? "chip-on" : ""}`}
              aria-current={f.kind === show ? "true" : undefined}
              data-sfx="chip"
            >
              {f.label}
            </Link>
          ))}
        </nav>

        {cards.length === 0 ? (
          <p className="text-muted">
            {transactions.length === 0
              ? "No entries this month. Use the counter above to add the first one."
              : "Nothing of this kind this month."}
          </p>
        ) : (
          <ul className="cards">
            {cards.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/log?m=${month}&edit=${t.id}`}
                  className="card"
                  data-kind={t.category.kind}
                  aria-label={`Edit ${t.note ?? t.category.name}, ${money(t.amount)}, ${dayLong(t.occurred_on)}`}
                >
                  <span className="card-date">{dayLabel(t.occurred_on)}</span>
                  <CategoryIcon icon={t.category.icon} size={48} />
                  <span className="card-amount">
                    {t.category.kind === "income" ? "+" : "−"}
                    {money(t.amount)}
                  </span>
                  <span className="card-name">{t.category.name}</span>
                  <span className="card-note">{t.note ?? "\u00a0"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav className="mt-3 flex items-center justify-center gap-2" aria-label="Pages">
            {page > 1 ? (
              <Link href={entriesHref(page - 1)} scroll={false} className="btn icon" aria-label="Previous page" data-sfx="page">
                ◀
              </Link>
            ) : (
              <span className="btn icon invisible">◀</span>
            )}
            <span className="font-display text-[0.65rem]">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={entriesHref(page + 1)} scroll={false} className="btn icon" aria-label="Next page" data-sfx="page">
                ▶
              </Link>
            ) : (
              <span className="btn icon invisible">▶</span>
            )}
          </nav>
        )}
      </Panel>
    </>
  );
}
