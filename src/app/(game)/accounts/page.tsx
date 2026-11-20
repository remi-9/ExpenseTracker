/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { ACCOUNT_KIND_LABEL, AccountParty } from "@/components/accounts";
import { RoutePopup } from "@/components/popup";
import { PlayOnMount } from "@/components/sound";
import { StatementForm } from "@/components/statement-form";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, Panel } from "@/components/ui";
import { TossedNotice } from "@/components/tossed";
import { addTransfer, deleteTransfer, logBalanceGap, saveAccount, setAccountArchived } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getAccountNet,
  getAccounts,
  getAllTransactions,
  getAllTransfers,
  getCategories,
  getPokemonNames,
  getTransactions,
  getTransfers,
} from "@/lib/data";
import { dayLabel, dayLong, money, parseAmount, parseMonth, today } from "@/lib/format";
import { accountBalances, accountHealth, balanceGap, balanceOn, gapCategory } from "@/lib/money";
import { sprite } from "@/lib/partners";
import type { AccountKind } from "@/lib/types";

// The first 151 Pokémon are offered as an account's guardian.
const GUARDIANS = Array.from({ length: 151 }, (_, i) => i + 1);
const DONE: Record<string, string> = {
  moved: "Money moved.",
  restored: "Restored.",
  matches: "It matches what you have logged. Nothing to add.",
  checked: "The difference is logged. The account now matches.",
};
/** A balance as typed. A card that is owed on is below zero. */
const readBalance = (typed: string) => {
  const amount = parseAmount(typed.replace(/^-/, ""));
  return amount === null ? null : typed.startsWith("-") ? -amount : amount;
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    a?: string;
    new?: string;
    edit?: string;
    move?: string;
    check?: string;
    actual?: string;
    on?: string;
    import?: string;
    error?: string;
    done?: string;
    /** After undoing a transfer: its id, so the message can offer Restore. */
    r?: string;
  }>;
}) {
  const params = await searchParams;
  const [accounts, net, transfers, names, transactions] = await Promise.all([
    getAccounts(),
    getAccountNet(),
    getTransfers(),
    getPokemonNames(),
    getTransactions(parseMonth()),
  ]);
  const rows = accountHealth(accountBalances(accounts, net), transactions);
  const active = rows.filter((r) => !r.account.archived_at);
  const archived = rows.filter((r) => r.account.archived_at);
  const picked = rows.find((r) => r.account.id === params.a) ?? (params.new ? undefined : active[0]);
  const editing = params.edit && picked ? picked.account : undefined;
  const adding = !!params.new;
  const moving = !!params.move && active.length > 1;
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "an account that is gone";
  const total = rows.reduce((sum, r) => sum + r.balance, 0);

  // Checking a balance and importing a statement both look at everything logged.
  const checking = !!params.check && !!picked;
  const importing = !!params.import && !!picked;
  const [categories, everyEntry, everyTransfer] =
    checking || importing ? await Promise.all([getCategories(), getAllTransactions(), getAllTransfers()]) : [[], [], []];
  const usable = categories.filter((c) => !c.archived_at);
  const checkedOn = /^\d{4}-\d{2}-\d{2}$/.test(params.on ?? "") ? params.on! : today();
  const actual = checking && params.actual ? readBalance(params.actual.trim()) : null;
  const expected = checking ? balanceOn(picked.account, everyEntry, everyTransfer, checkedOn) : 0;
  const gap = actual === null ? null : balanceGap(expected, actual);
  const gapKind = gap?.state === "over" ? "income" : "expense";
  const gapChoices = usable.filter((c) => c.kind === gapKind);
  // The short forms open as pop-ups over the page; closing one comes back to the account.
  const inPopup = adding || !!editing || moving || checking;
  const back = picked ? `/accounts?a=${picked.account.id}` : "/accounts";

  return (
    <>
      {params.error && <PlayOnMount sounds={["error"]} />}
      {/* A form in a pop-up shows its own error; anything else shows it here. */}
      {params.error && !inPopup && <Dialog tone="error">{params.error}</Dialog>}
      {params.done && DONE[params.done] && <Dialog>{DONE[params.done]}</Dialog>}
      {params.done === "unmoved" && params.r && <TossedNotice message="Transfer undone." id={params.r} back="/accounts" />}

      <Panel title="Pokémon" aside={<span>{money(total)} in all</span>}>
        {active.length === 0 ? (
          <p className="text-muted">
            No accounts yet. Add your bank, e-wallet or cash.
          </p>
        ) : (
          <AccountParty rows={active} current={picked?.account.id} />
        )}
      </Panel>

      <div className="battle-bottom">
        <p className="window battle-text">
          {picked ? (
            <>
              <CategoryIcon icon={picked.account.icon} />
              {picked.account.name} holds {money(picked.balance)}. {money(picked.spent)} spent this month.
              {picked.account.archived_at ? " Archived." : ""}
            </>
          ) : (
            "Add an account to start tracking where your money sits."
          )}
        </p>
        <div className="window menu" data-menu>
          {picked && (
            <Link href={`/accounts?a=${picked.account.id}&edit=1`} scroll={false} className="menu-item" data-sfx="confirm">
              Edit
            </Link>
          )}
          {active.length > 1 && (
            <Link href={`/accounts?${picked ? `a=${picked.account.id}&` : ""}move=1`} scroll={false} className="menu-item" data-sfx="confirm">
              Move money
            </Link>
          )}
          {picked && (
            <Link href={`/accounts?a=${picked.account.id}&check=1`} scroll={false} className="menu-item" data-sfx="confirm">
              Check balance
            </Link>
          )}
          {picked && (
            <Link href={`/accounts?a=${picked.account.id}&import=1`} scroll={false} className="menu-item" data-sfx="confirm">
              Import statement
            </Link>
          )}
          {picked && (
            <form action={setAccountArchived}>
              <input type="hidden" name="id" value={picked.account.id} />
              <input type="hidden" name="archive" value={picked.account.archived_at ? "0" : "1"} />
              <SubmitButton className="menu-item" pending="…" sfx="page">
                {picked.account.archived_at ? "Restore" : "Archive"}
              </SubmitButton>
            </form>
          )}
          <Link href="/accounts?new=1" scroll={false} className="menu-item" data-sfx="confirm" aria-current={adding ? "true" : undefined}>
            + New account
          </Link>
        </div>
      </div>

      {(adding || editing) && (
        <RoutePopup title={editing ? `Edit ${editing.name}` : "New account"} size="large" closeHref={back}>
          {params.error && (
            <p className="mb-3 text-red" role="alert">
              {params.error}
            </p>
          )}
          {!isSupabaseConfigured && <p className="mb-2 text-muted">Demo mode: accounts can be changed once Supabase is connected.</p>}
          <form action={saveAccount} className="grid gap-3 sm:grid-cols-2">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="flex flex-col gap-1">
              Name
              <input name="name" required defaultValue={editing?.name} placeholder="e.g. Savings account" className="field" />
            </label>
            <label className="flex flex-col gap-1">
              Opening balance
              <input
                name="opening_balance"
                inputMode="decimal"
                defaultValue={editing?.opening_balance ?? ""}
                placeholder="Before your first entry"
                className="field"
              />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1">Kind</legend>
              <div className="flex flex-wrap">
                {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((kind) => (
                  <label key={kind} className="chip">
                    <input type="radio" name="kind" value={kind} defaultChecked={kind === (editing?.kind ?? "bank")} />
                    {ACCOUNT_KIND_LABEL[kind]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1">Guardian</legend>
              <details>
                <summary className="cursor-pointer text-muted">
                  Choose a Pokémon to stand for this account ({GUARDIANS.length}). Leave it and one is picked by kind.
                </summary>
                <div className="icon-grid">
                  {GUARDIANS.map((dex) => (
                    <label key={dex} className="chip p-0.5!" title={names[dex - 1] ?? `No. ${dex}`}>
                      <input
                        type="radio"
                        name="icon"
                        value={`pkmn-${dex}`}
                        defaultChecked={editing?.icon === `pkmn-${dex}`}
                        aria-label={names[dex - 1] ?? `No. ${dex}`}
                      />
                      <img src={sprite.icon(dex)} alt="" width={40} height={30} className="pixel" loading="lazy" />
                    </label>
                  ))}
                </div>
              </details>
            </fieldset>
            <div className="popup-actions sm:col-span-2">
              <Link href={picked ? `/accounts?a=${picked.account.id}` : "/accounts"} scroll={false} className="btn" data-sfx="page">
                Cancel
              </Link>
              <SubmitButton pending="Saving…" sfx="confirm">
                {editing ? "Save changes" : "Add account"}
              </SubmitButton>
            </div>
          </form>
        </RoutePopup>
      )}

      {moving && (
        <RoutePopup title="Move money" closeHref={back}>
          {params.error && (
            <p className="mb-3 text-red" role="alert">
              {params.error}
            </p>
          )}
          <form action={addTransfer} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              From
              <select name="from_account" defaultValue={picked?.account.id} className="field">
                {active.map((r) => (
                  <option key={r.account.id} value={r.account.id}>
                    {r.account.name} ({money(r.balance)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              To
              <select name="to_account" defaultValue={active.find((r) => r.account.id !== picked?.account.id)?.account.id} className="field">
                {active.map((r) => (
                  <option key={r.account.id} value={r.account.id}>
                    {r.account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              How much?
              <input name="amount" inputMode="decimal" autoComplete="off" required autoFocus placeholder="0" className="field" />
            </label>
            <label className="flex flex-col gap-1">
              When?
              <input name="occurred_on" type="date" defaultValue={today()} className="field" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              Note
              <input name="note" placeholder="Optional, e.g. Cash for the week" className="field" />
            </label>
            <p className="text-muted sm:col-span-2">
              Transfers are not income or spending.
            </p>
            <div className="popup-actions sm:col-span-2">
              <Link href="/accounts" scroll={false} className="btn" data-sfx="page">
                Cancel
              </Link>
              <SubmitButton pending="Moving…" sfx="deposit">
                Move it
              </SubmitButton>
            </div>
          </form>
        </RoutePopup>
      )}

      {checking && (
        <RoutePopup title={`Check ${picked.account.name}`} closeHref={back}>
          {params.error && (
            <p className="mb-3 text-red" role="alert">
              {params.error}
            </p>
          )}
          <form action="/accounts" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="a" value={picked.account.id} />
            <input type="hidden" name="check" value="1" />
            <label className="flex flex-col gap-1">
              What does it really hold?
              <input
                name="actual"
                inputMode="decimal"
                autoComplete="off"
                required
                autoFocus={!gap}
                defaultValue={params.actual}
                placeholder="The balance your bank or wallet shows"
                className="field"
              />
            </label>
            <label className="flex flex-col gap-1">
              On which day?
              <input name="on" type="date" defaultValue={checkedOn} max={today()} className="field" />
            </label>
            <div className="popup-actions sm:col-span-2">
              <Link href={`/accounts?a=${picked.account.id}`} scroll={false} className="btn" data-sfx="page">
                Cancel
              </Link>
              <button className="btn" data-sfx="confirm">
                Compare
              </button>
            </div>
          </form>

          {gap?.state === "match" && (
            <p className="mt-3 text-green" role="status">
              It matches: your entries add up to {money(expected)} for {dayLong(checkedOn)}. Nothing to add.
            </p>
          )}
          {gap && gap.state !== "match" && (
            <form action={logBalanceGap} className="mt-3 flex flex-col gap-3" role="status">
              <input type="hidden" name="account" value={picked.account.id} />
              <input type="hidden" name="actual" value={params.actual} />
              <input type="hidden" name="on" value={checkedOn} />
              <p>
                Your entries add up to {money(expected)} for {dayLong(checkedOn)}, so {picked.account.name} holds{" "}
                <b>
                  {money(gap.amount)} {gap.state === "short" ? "less" : "more"}
                </b>{" "}
                than they say.{" "}

              </p>
              {gapChoices.length === 0 ? (
                <p className="text-red">
                  Add {gapKind === "expense" ? "a spending" : "an income"} category in the Bag to log the difference under.
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    Log the difference as {gapKind === "expense" ? "spending on" : "income from"}
                    <select name="category_id" defaultValue={gapCategory(usable, gapKind)} className="field">
                      {gapChoices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-muted">
                    Log anything you can name first, then compare again.
                  </p>
                  <div className="popup-actions">
                    <SubmitButton pending="Logging…" sfx="confirm">
                      Log {money(gap.amount)}
                    </SubmitButton>
                  </div>
                </>
              )}
            </form>
          )}
        </RoutePopup>
      )}

      {importing && (
        <Panel title={`Import a statement into ${picked.account.name}`}>
          <p className="mb-3 text-muted">
            Choose the PDF or CSV from your bank or wallet. Lines already logged are skipped.
          </p>
          <StatementForm
            account={{ id: picked.account.id, name: picked.account.name }}
            categories={usable.map(({ id, name, kind }) => ({ id, name, kind }))}
            others={active.filter((r) => r.account.id !== picked.account.id).map((r) => ({ id: r.account.id, name: r.account.name }))}
          />
          <Link href={`/accounts?a=${picked.account.id}`} scroll={false} className="btn mt-3" data-sfx="page">
            Done
          </Link>
        </Panel>
      )}

      <Panel title="Latest transfers">
        {transfers.length === 0 ? (
          <p className="text-muted">
            Nothing moved yet.
          </p>
        ) : (
          <ul className="entries transfers">
            {transfers.map((t) => (
              <li key={t.id}>
                <span className="text-muted">{dayLabel(t.occurred_on)}</span>
                <span className="truncate">
                  {nameOf(t.from_account)} to {nameOf(t.to_account)}
                  {t.note && <span className="ml-3 text-muted">{t.note}</span>}
                </span>
                <span className="flex items-center">
                  <span className="amount">{money(t.amount)}</span>
                  <form action={deleteTransfer}>
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton className="btn" pending="…" sfx="delete">
                      Undo
                    </SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {archived.length > 0 && (
        <Panel title="Archived">
          <AccountParty rows={archived} current={picked?.account.id} />
        </Panel>
      )}
    </>
  );
}
