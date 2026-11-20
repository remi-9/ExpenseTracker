/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { ACCOUNT_KIND_LABEL, AccountParty } from "@/components/accounts";
import { PlayOnMount } from "@/components/sound";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, Panel } from "@/components/ui";
import { addTransfer, deleteTransfer, saveAccount, setAccountArchived } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/config";
import { getAccountNet, getAccounts, getPokemonNames, getTransactions, getTransfers } from "@/lib/data";
import { dayLabel, money, parseMonth, today } from "@/lib/format";
import { accountBalances, accountHealth } from "@/lib/money";
import { sprite } from "@/lib/partners";
import type { AccountKind } from "@/lib/types";

// The first 151 Pokémon are offered as an account's guardian.
const GUARDIANS = Array.from({ length: 151 }, (_, i) => i + 1);
const DONE: Record<string, string> = { moved: "Money moved.", unmoved: "That transfer was undone." };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; new?: string; edit?: string; move?: string; error?: string; done?: string }>;
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

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}
      {params.done && DONE[params.done] && <Dialog>{DONE[params.done]}</Dialog>}

      <Panel title="Pokémon" aside={<span>{money(total)} in all</span>}>
        {active.length === 0 ? (
          <p className="text-muted">
            No accounts yet. Add your bank account, e-wallet or cash, each guarded by a Pokémon of your choice.
          </p>
        ) : (
          <AccountParty rows={active} current={picked?.account.id} />
        )}
        <p className="mt-2 text-muted">
          Each account is a party member. Its HP is what is left of what it held before this month&apos;s spending came
          out of it.
        </p>
      </Panel>

      <div className="battle-bottom">
        <p className="window battle-text">
          {picked ? (
            <>
              <CategoryIcon icon={picked.account.icon} />
              {picked.account.name} ({ACCOUNT_KIND_LABEL[picked.account.kind].toLowerCase()}) holds {money(picked.balance)}. It
              opened with {money(picked.account.opening_balance)}, and {money(picked.spent)} has been spent from it this
              month.{picked.account.archived_at ? " It is archived, so it is hidden when you log." : ""}
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
        <Panel title={editing ? `Edit ${editing.name}` : "New account"}>
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
                placeholder="What it held before your first entry"
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
            <div className="flex flex-wrap sm:col-span-2">
              <SubmitButton pending="Saving…" sfx="confirm">
                {editing ? "Save changes" : "Add account"}
              </SubmitButton>
              <Link href={picked ? `/accounts?a=${picked.account.id}` : "/accounts"} scroll={false} className="btn" data-sfx="page">
                Cancel
              </Link>
            </div>
          </form>
        </Panel>
      )}

      {moving && (
        <Panel title="Move money">
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
              A transfer is neither income nor spending: your wallet HP and XP stay as they are.
            </p>
            <div className="flex flex-wrap sm:col-span-2">
              <SubmitButton pending="Moving…" sfx="deposit">
                Move it
              </SubmitButton>
              <Link href="/accounts" scroll={false} className="btn" data-sfx="page">
                Cancel
              </Link>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Latest transfers">
        {transfers.length === 0 ? (
          <p className="text-muted">
            Nothing moved yet. Use Move money for cash withdrawals, e-wallet top-ups and paying off a card.
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
