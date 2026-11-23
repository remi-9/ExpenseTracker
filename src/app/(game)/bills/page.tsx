import Link from "next/link";
import { CategoryPicker } from "@/components/category-picker";
import { PlayOnMount } from "@/components/sound";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, MonthPicker, Panel } from "@/components/ui";
import { saveBill, setBillArchived } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/config";
import { getAccounts, getBillPayments, getBills, getCategories } from "@/lib/data";
import { money, parseMonth, today } from "@/lib/format";
import { amuletEarned, billsFor, dueLabel } from "@/lib/money";
import type { Bill, Kind } from "@/lib/types";

const KIND_LABEL: Record<Kind, string> = { expense: "Spending", income: "Income", saving: "Savings" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const schedule = (b: Bill) =>
  b.cadence === "yearly" ? `every ${MONTHS[(b.due_month ?? 1) - 1]} ${ordinal(b.due_day)}` : `on the ${ordinal(b.due_day)} of every month`;

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; b?: string; new?: string; edit?: string; cat?: string; error?: string }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const [bills, categories, accounts, payments, paidNow] = await Promise.all([
    getBills(),
    getCategories(),
    getAccounts(),
    getBillPayments(month),
    getBillPayments(parseMonth()),
  ]);
  const live = bills.filter((b) => !b.archived_at);
  const archived = bills.filter((b) => b.archived_at);
  const adding = !!params.new;
  const picked = bills.find((b) => b.id === params.b) ?? (adding ? undefined : live[0]);
  const editing = params.edit ? picked : undefined;
  const statuses = billsFor(month, bills, payments, today());
  const category = (id: string) => categories.find((c) => c.id === id);
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;
  const usable = accounts.filter((a) => !a.archived_at || a.id === editing?.account_id);
  const form = editing ?? (adding ? ({ category_id: params.cat } as Partial<Bill>) : undefined);
  // The Amulet Coin goes by the current month, whichever month is being looked at.
  const amulet = amuletEarned(billsFor(parseMonth(), bills, paidNow, today()));

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}

      <section className="box p-0!" aria-label="Bills">
        <header className="pc-header">
          <span />
          <h1>
            Bill&apos;s PC
            <small className="flex gap-4">
              <span>
                {live.length} {live.length === 1 ? "bill" : "bills"} on schedule
              </span>
            </small>
          </h1>
          <span />
        </header>
        <div className="bag bag-wide p-2">
          <div className="window menu bag-items" data-menu>
            {live.map((b) => (
              <Link key={b.id} href={`/bills?m=${month}&b=${b.id}`} scroll={false} className="menu-item" data-sfx="chip" aria-current={b.id === picked?.id ? "true" : undefined}>
                <CategoryIcon icon={category(b.category_id)?.icon ?? "poke-ball"} size={24} />
                {b.name}
                <small>
                  {b.cadence === "yearly" ? `${MONTHS[(b.due_month ?? 1) - 1].slice(0, 3)} ` : ""}
                  {ordinal(b.due_day)}
                </small>
              </Link>
            ))}
            <Link href={`/bills?m=${month}&new=1`} scroll={false} className="menu-item" data-sfx="confirm" aria-current={adding ? "true" : undefined}>
              + New bill
            </Link>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <p className="window battle-text">
              {picked ? (
                <>
                  <CategoryIcon icon={category(picked.category_id)?.icon ?? "poke-ball"} />
                  {picked.name}: {picked.amount != null ? money(picked.amount) : "an amount that varies"}, due {schedule(picked)}.
                  Logged under {category(picked.category_id)?.name ?? "a category that is gone"}
                  {accountName(picked.account_id) ? `, usually from ${accountName(picked.account_id)}` : ""}.
                  {picked.archived_at ? " It is archived, so it no longer comes due." : ""}
                </>
              ) : (
                "Rent, subscriptions, savings, your pay: anything on a schedule. Each shows on Log when due."
              )}
            </p>
            {picked && (
              <div className="window menu submenu" data-menu>
                <Link href={`/bills?m=${month}&b=${picked.id}&edit=1`} scroll={false} className="menu-item" data-sfx="confirm">
                  Edit
                </Link>
                <form action={setBillArchived}>
                  <input type="hidden" name="id" value={picked.id} />
                  <input type="hidden" name="archive" value={picked.archived_at ? "0" : "1"} />
                  <SubmitButton className="menu-item" pending="…" sfx="page">
                    {picked.archived_at ? "Restore" : "Archive"}
                  </SubmitButton>
                </form>
                <Link href={`/log?m=${month}`} className="menu-item">
                  Pay on Log
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {form && (
        <Panel title={editing ? `Edit ${editing.name}` : "New bill"}>
          {!isSupabaseConfigured && <p className="mb-2 text-muted">Demo mode: bills can be changed once Supabase is connected.</p>}
          <form action={saveBill} className="grid gap-3 sm:grid-cols-2">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="flex flex-col gap-1">
              Name
              <input name="name" required defaultValue={form.name ?? category(form.category_id ?? "")?.name} placeholder="e.g. Rent" className="field" />
            </label>
            <CategoryPicker
              name="category_id"
              label="Logged under"
              picked={form.category_id}
              choices={(Object.keys(KIND_LABEL) as Kind[]).flatMap((kind) =>
                categories
                  .filter((c) => c.kind === kind && (!c.archived_at || c.id === form.category_id))
                  .map(({ id, name, icon }) => ({ id, name, icon, group: KIND_LABEL[kind] })),
              )}
            />
            <label className="flex flex-col gap-1">
              Usual amount
              <input name="amount" inputMode="decimal" autoComplete="off" defaultValue={form.amount ?? ""} placeholder="Leave empty if it varies" className="field" />
            </label>
            <label className="flex flex-col gap-1">
              Usually paid from (or into)
              <select name="account" defaultValue={form.account_id ?? ""} className="field">
                <option value="">Whichever I pick at the time</option>
                {usable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Due on day
              <input name="due_day" type="number" min={1} max={31} required defaultValue={form.due_day ?? 1} className="field" />
              <small className="text-muted">Day 31 means the last day of shorter months.</small>
            </label>
            <fieldset className="bill-cadence">
              <legend className="mb-1">How often?</legend>
              <div className="flex flex-wrap items-center">
                <label className="chip">
                  <input type="radio" name="cadence" value="monthly" defaultChecked={form.cadence !== "yearly"} />
                  Every month
                </label>
                <label className="chip">
                  <input type="radio" name="cadence" value="yearly" defaultChecked={form.cadence === "yearly"} />
                  Once a year
                </label>
                <select name="due_month" aria-label="Month it falls due" defaultValue={form.due_month ?? 1} className="field bill-month">
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <SubmitButton pending="Saving…" sfx="confirm">
                {editing ? "Save changes" : "Store in the PC"}
              </SubmitButton>
              <Link href={`/bills?m=${month}${picked ? `&b=${picked.id}` : ""}`} scroll={false} className="btn" data-sfx="page">
                Cancel
              </Link>
            </div>
          </form>
        </Panel>
      )}

      <MonthPicker month={month} path="/bills" />

      <Panel
        title="Due this month"
        aside={
          statuses.length > 0 ? (
            <span>
              {statuses.filter((s) => s.state === "paid").length} of {statuses.length} paid
            </span>
          ) : undefined
        }
      >
        {statuses.length === 0 ? (
          <p className="text-muted">Nothing falls due this month.</p>
        ) : (
          <ul className="bills">
            {statuses.map((s) => (
              <li key={s.bill.id} data-state={s.state}>
                <span className="min-w-0 break-words">
                  <CategoryIcon icon={category(s.bill.category_id)?.icon ?? "poke-ball"} size={24} />
                  {s.bill.name}
                  <span className="ml-3 text-muted">
                    {s.state === "paid" ? money(s.paid) : s.bill.amount != null ? money(s.bill.amount) : "varies"}
                  </span>
                </span>
                <span className="bill-due">
                  {dueLabel(s, today())}
                  {s.state === "paid" && !s.onTime && ", late"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-muted">
          {amulet
            ? "Bills paid on time: your next expedition starts with an Amulet Coin."
            : "Pay this month's bills on time for an Amulet Coin on your next expedition."}
        </p>
      </Panel>

      {archived.length > 0 && (
        <Panel title="Archived">
          <ul className="flex flex-wrap">
            {archived.map((b) => (
              <li key={b.id}>
                <Link href={`/bills?m=${month}&b=${b.id}`} scroll={false} className="chip" data-sfx="chip">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
