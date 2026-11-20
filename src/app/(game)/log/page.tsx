/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprite */
import Link from "next/link";
import { EntryResult } from "@/components/entry-result";
import { NoteField } from "@/components/note-field";
import { RoutePopup } from "@/components/popup";
import { PlayOnMount } from "@/components/sound";
import { Hearts } from "@/components/sprite";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, EntryAmount, EntryWhat, MonthPicker, Panel } from "@/components/ui";
import { addTransaction, deleteTransaction, payBill, updateTransaction } from "@/lib/actions";
import {
  getAccounts,
  getBillPayments,
  getBills,
  getCategories,
  getMonthTotals,
  getNoteHints,
  getPartnerId,
  getPokemonNames,
  getTransactions,
  searchTransactions,
} from "@/lib/data";
import { dayLabel, dayLong, money, parseMonth, shiftMonth, today } from "@/lib/format";
import { getPlayer, summarizeMonth, walletHp } from "@/lib/game";
import { billsFor, dueLabel, leftAfterBills, openingTotal } from "@/lib/money";
import { partnerAt, sprite } from "@/lib/partners";
import type { Kind, Transaction } from "@/lib/types";

const KINDS: { kind: Kind; label: string; ask: string; account: string }[] = [
  { kind: "expense", label: "I spent", ask: "On what?", account: "Paid from" },
  { kind: "income", label: "I earned", ask: "From what?", account: "Paid into" },
  { kind: "saving", label: "I saved", ask: "Into what?", account: "Taken from" },
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
    acct?: string;
    /** Set by a save: the amount and id of the entry, to play its result. */
    saved?: string;
    id?: string;
    t?: string;
    error?: string;
    edit?: string;
    del?: string;
    done?: string;
    /** Entries shown below: one kind only, which page of them, or a search across every month. */
    show?: string;
    p?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const query = (params.q ?? "").trim();
  const [categories, transactions, totals, partnerId, names, accounts, bills, payments, lastPayments, hints, found] =
    await Promise.all([
      getCategories(),
      getTransactions(month),
      getMonthTotals(),
      getPartnerId(),
      getPokemonNames(),
      getAccounts(),
      getBills(),
      getBillPayments(month),
      getBillPayments(shiftMonth(month, -1)),
      getNoteHints(),
      query ? searchTransactions(query) : Promise.resolve([]),
    ]);
  const summary = summarizeMonth(totals, month, openingTotal(accounts));
  const partner = partnerAt(partnerId, getPlayer(totals).level, names);
  const thisMonth = today().startsWith(month);

  const editing = transactions.find((t) => t.id === params.edit);
  const tossing = transactions.find((t) => t.id === params.del);
  const savedCategory = categories.find((c) => c.id === params.cat);
  const savedAmount = Number(params.saved);

  // Categories keep the order they have in Setup, so each stays where your hand expects it.
  // The form opens on the kind, category and account you used last.
  const choices = (kind: Kind) => categories.filter((c) => c.kind === kind && !c.archived_at);
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const noteHints = hints.flatMap((h) => (kindOf.has(h.category_id) ? [{ ...h, kind: kindOf.get(h.category_id)! }] : []));

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

  // The month's bills, soonest first, with what is still to pay.
  const statuses = billsFor(month, bills, payments, today());
  const lastStatuses = billsFor(shiftMonth(month, -1), bills, lastPayments, today());
  const lastPaid = (id: string) => lastStatuses.find((s) => s.bill.id === id)?.paid ?? 0;
  const afterBills = leftAfterBills(summary.remaining, statuses, kindOf);

  // What has gone in today, as a reminder while you log.
  const todays = transactions.filter((t) => t.occurred_on === today());
  const spentToday = todays.filter((t) => t.category.kind === "expense").reduce((sum, t) => sum + t.amount, 0);

  // Entries as cards, newest first: the month's, or a search across every month.
  // Optionally one kind only, a page at a time.
  const show = FILTERS.find((f) => f.kind === params.show)?.kind;
  const listed = query ? found : transactions;
  const shown = show ? listed.filter((t) => t.category.kind === show) : listed;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.p) || 1));
  const cards = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Pass null for "all kinds"; leave the kind out to keep the current filter.
  const entriesHref = (p: number, kind: Kind | null | undefined = show) =>
    `/log?m=${month}${query ? `&q=${encodeURIComponent(query)}` : ""}${kind ? `&show=${kind}` : ""}${p > 1 ? `&p=${p}` : ""}`;

  /**
   * The entry form: a new entry on the page, or an entry being changed, in a pop-up.
   * It opens on the kind, category and account you used last, or on the entry's own.
   */
  const entryForm = (editing: Transaction | undefined) => {
    const kind = editing?.category.kind ?? KINDS.find((k) => k.kind === params.kind)?.kind ?? "expense";
    const picked = editing?.category_id ?? params.cat;
    // Accounts still in use, plus the one an old entry being edited sits in.
    const usable = accounts.filter((a) => !a.archived_at || a.id === editing?.account_id || a.id === editing?.to_account_id);
    const pickedAccount = editing?.account_id ?? usable.find((a) => a.id === params.acct)?.id ?? usable[0]?.id;
    return (
      <form
        key={editing?.id ?? params.t ?? "new"}
        action={editing ? updateTransaction : addTransaction}
        className={editing ? "entry-form" : "window entry-form"}
        aria-label={editing ? "Edit entry" : "New entry"}
      >
        {editing && (
          <>
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="m" value={month} />
            <input type="hidden" name="bill_id" value={editing.bill_id ?? ""} />
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
            Sums work too, like 1200+350.
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

        {usable.length > 0 && (
          <fieldset>
            {/* The question changes with the kind: paid from, paid into, taken from. */}
            <legend className="mb-1">
              {KINDS.map((k) => (
                <span key={k.kind} className="kind-cats" data-kind={k.kind}>
                  {k.account}
                </span>
              ))}
            </legend>
            <div className="flex flex-wrap">
              {usable.map((a) => (
                <label key={a.id} className="chip">
                  <input type="radio" name="account" value={a.id} defaultChecked={a.id === pickedAccount} />
                  <CategoryIcon icon={a.icon} size={24} />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {usable.length > 1 && (
          <fieldset className="kind-cats" data-kind="saving">
            <legend className="mb-1">Moved to</legend>
            <div className="flex flex-wrap">
              <label className="chip">
                <input type="radio" name="to_account" value="" defaultChecked={!editing?.to_account_id} />
                It stays where it is
              </label>
              {usable.map((a) => (
                <label key={a.id} className="chip">
                  <input type="radio" name="to_account" value={a.id} defaultChecked={a.id === editing?.to_account_id} />
                  <CategoryIcon icon={a.icon} size={24} />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

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
          <NoteField hints={noteHints} defaultValue={editing?.note ?? ""} />
        </label>

        {editing ? (
          <div className="popup-actions">
            <Link href={`/log?m=${month}&del=${editing.id}`} className="lead px-2 text-red underline">
              Toss this entry
            </Link>
            <Link href={`/log?m=${month}`} className="btn" data-sfx="page">
              Cancel
            </Link>
            <SubmitButton sfx="confirm">Save changes</SubmitButton>
          </div>
        ) : (
          <SubmitButton className="btn btn-primary py-3!" sfx="none">
            Save entry
          </SubmitButton>
        )}
      </form>
    );
  };

  return (
    <>
      {params.error && <PlayOnMount sounds={["error"]} />}
      {/* An error from the edit form shows inside its pop-up. */}
      {params.error && !editing && <Dialog tone="error">{params.error}</Dialog>}
      {params.done && DONE[params.done] && <Dialog>{DONE[params.done]}</Dialog>}

      {tossing && (
        <RoutePopup title="Toss this entry?" size="small" closeHref={`/log?m=${month}`}>
          <p role="alert">
            {tossing.note ?? tossing.category.name}, {money(tossing.amount)}, {dayLong(tossing.occurred_on)}.
          </p>
          <div className="popup-actions">
            <Link href={`/log?m=${month}`} scroll={false} className="btn" data-sfx="page">
              No, keep it
            </Link>
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={tossing.id} />
              <input type="hidden" name="m" value={month} />
              <SubmitButton pending="…" sfx="delete">
                Yes, toss it
              </SubmitButton>
            </form>
          </div>
        </RoutePopup>
      )}

      {editing && !tossing && (
        <RoutePopup title="Edit entry" size="large" closeHref={`/log?m=${month}`}>
          {params.error && (
            <p className="mb-3 text-red" role="alert">
              {params.error}
            </p>
          )}
          {entryForm(editing)}
        </RoutePopup>
      )}

      {/* The counter. Wide screens: status and the bills on the left, the entry
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
              {afterBills !== summary.remaining && (
                <>
                  <dt title="Left once the bills still to pay this month are set aside">After bills</dt>
                  <dd className={afterBills < 0 ? "text-red" : ""}>{money(afterBills)}</dd>
                </>
              )}
            </dl>
            <Hearts ratio={walletHp(summary)} size={16} />
          </div>
        </div>

        {/* Re-keyed after every save, so the amount clears and takes the cursor again. */}
        {entryForm(undefined)}

        <Panel
          title="Bills"
          className="shop-monthly"
          aside={
            statuses.length > 0 ? (
              <span>
                {statuses.filter((s) => s.state === "paid").length} of {statuses.length}
              </span>
            ) : (
              <Link href="/bills" className="underline">
                Set up
              </Link>
            )
          }
        >
          {statuses.length === 0 ? (
            <p className="text-muted">
              Pay, rent and bills that come round on a schedule are listed here by due date, one tap to log each. Add
              them in{" "}
              <Link href="/bills" className="text-blue underline">
                Bill&apos;s PC
              </Link>
              .
            </p>
          ) : (
            <ul className="bills">
              {statuses.map((s) => {
                const c = categories.find((cat) => cat.id === s.bill.category_id);
                return (
                  <li key={s.bill.id} data-state={s.state}>
                    <span className="truncate" title={s.bill.name}>
                      <CategoryIcon icon={c?.icon ?? "poke-ball"} size={24} />
                      {s.bill.name}
                    </span>
                    <span className="bill-due">{dueLabel(s, today())}</span>
                    {s.state === "paid" ? (
                      <span className="bill-paid text-green">{money(s.paid)}</span>
                    ) : (
                      <form action={payBill}>
                        <input type="hidden" name="bill_id" value={s.bill.id} />
                        <input type="hidden" name="m" value={month} />
                        {/* Catching up on another month: the date starts on the due date and can be changed. */}
                        {!thisMonth && (
                          <input name="occurred_on" type="date" defaultValue={s.due} aria-label={`Date ${s.bill.name} was paid`} className="field" />
                        )}
                        <input
                          name="amount"
                          inputMode="decimal"
                          autoComplete="off"
                          required
                          defaultValue={s.bill.amount ?? (lastPaid(s.bill.id) || undefined)}
                          placeholder="Amount"
                          aria-label={`Amount for ${s.bill.name}`}
                          className="field"
                        />
                        <SubmitButton className="btn" pending="…" sfx="none">
                          {c?.kind === "income" ? "Log" : "Pay"}
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
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
          opening={openingTotal(accounts)}
          partnerId={partnerId}
          names={names}
          entryId={params.id}
        />
      )}

      <MonthPicker month={month} path="/log" />

      <Panel
        title={query ? `Entries matching “${query}”` : "Entries"}
        aside={
          shown.length > 0 ? (
            <span>
              {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, shown.length)} of {shown.length}
            </span>
          ) : undefined
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-y-2">
          <nav className="flex flex-wrap" aria-label="Show">
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
          {/* Searches every month, by note or category name. */}
          <form action="/log" className="flex items-center" role="search">
            <input type="hidden" name="m" value={month} />
            <input name="q" type="search" defaultValue={query} placeholder="Search" aria-label="Search entries" className="field search" />
            <button className="btn">Find</button>
            {query && (
              <Link href={`/log?m=${month}`} scroll={false} className="btn" data-sfx="page">
                Clear
              </Link>
            )}
          </form>
        </div>

        {cards.length === 0 ? (
          <p className="text-muted">
            {query
              ? "Nothing matches. The search looks at notes and category names."
              : transactions.length === 0
                ? "No entries this month. Use the counter above to add the first one."
                : "Nothing of this kind this month."}
          </p>
        ) : (
          <ul className="cards">
            {cards.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/log?m=${t.occurred_on.slice(0, 7)}&edit=${t.id}`}
                  className="card"
                  data-kind={t.category.kind}
                  aria-label={`Edit ${t.note ?? t.category.name}, ${money(t.amount)}, ${dayLong(t.occurred_on)}`}
                >
                  <span className="card-date">
                    {dayLabel(t.occurred_on)}
                    {query && ` ${t.occurred_on.slice(0, 4)}`}
                  </span>
                  {accounts.length > 1 && <span className="card-account">{accountName(t.account_id)}</span>}
                  <CategoryIcon icon={t.category.icon} size={48} />
                  <span className="card-amount">
                    {t.category.kind === "income" ? "+" : "−"}
                    {money(t.amount)}
                  </span>
                  <span className="card-name">{t.category.name}</span>
                  <span className="card-note">{t.note ?? " "}</span>
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
