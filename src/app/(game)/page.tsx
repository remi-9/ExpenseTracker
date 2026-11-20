/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { AccountParty } from "@/components/accounts";
import { PaySplit, StepLine } from "@/components/charts";
import { EntryResult } from "@/components/entry-result";
import { LowHpAlarm } from "@/components/nav";
import { PartnerPicker, PartnerSprite, type Mood } from "@/components/partner";
import { Popup, PopupSection } from "@/components/popup";
import { Scene } from "@/components/scene";
import { SceneBox } from "@/components/scene-box";
import { PlayOnMount } from "@/components/sound";
import { SubmitButton } from "@/components/submit";
import { Typewriter } from "@/components/typewriter";
import { Bar, Dialog, EntryList, hpTone, MonthPicker, Panel } from "@/components/ui";
import { WildPokemon } from "@/components/wild";
import { addTransaction } from "@/lib/actions";
import {
  getAccountNet,
  getAccounts,
  getBillPayments,
  getBills,
  getCategories,
  getCaught,
  getMonthTotals,
  getOptions,
  getPartnerId,
  getPokemonNames,
  getTrainerId,
  getTransactions,
} from "@/lib/data";
import { money, monthLabel, parseMonth, shiftMonth, today } from "@/lib/format";
import { getPlayer, getQuests, isShiny, summarizeMonth, walletHp, type MonthSummary } from "@/lib/game";
import { accountBalances, accountHealth, billsFor, needsPaying, openingTotal } from "@/lib/money";
import { partnerAt, sprite } from "@/lib/partners";
import type { Kind } from "@/lib/types";

const KIND_LABEL: Record<Kind, string> = { expense: "Spent on", income: "Earned from", saving: "Saved into" };

function moodFor(s: MonthSummary): Mood {
  if (s.income === 0) return s.expense > 0 ? "worried" : "happy";
  if (s.remaining <= 0) return "fainted";
  return walletHp(s) <= 0.2 ? "worried" : "happy";
}

function narrate(s: MonthSummary, month: string, name: string): string {
  const label = monthLabel(month);
  if (s.income === 0 && s.expense === 0) return `Nothing logged for ${label} yet.`;
  if (s.income === 0) return `${money(s.expense)} spent, no pay logged yet.`;
  if (s.remaining < 0) return `${name} fainted! ${money(-s.remaining)} over this month's pay.`;
  if (walletHp(s) <= 0.2) return `${name} is tired. ${money(s.remaining)} left.`;
  return `${name} is in good shape. ${money(s.remaining)} left.`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string;
    /** Set by a quick log: what was saved, to play its result here. */
    saved?: string;
    cat?: string;
    acct?: string;
    id?: string;
    t?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const [categories, totals, transactions, partnerId, trainerId, caught, names, accounts, net, bills, payments, options] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getTransactions(month),
    getPartnerId(),
    getTrainerId(),
    getCaught(),
    getPokemonNames(),
    getAccounts(),
    getAccountNet(),
    getBills(),
    getBillPayments(month),
    getOptions(),
  ]);

  const opening = openingTotal(accounts);
  const summary = summarizeMonth(totals, month, opening);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);

  if (!partner) {
    return (
      <>
        <Typewriter
          lines={[
            "Welcome to the world of budgeting, trainer!",
            "Choose who will guard your wallet.",
          ]}
        />
        <Panel title="Choose your partner">
          <PartnerPicker />
          <p className="mt-2 text-muted">You can switch later in Setup.</p>
        </Panel>
      </>
    );
  }

  const hp = walletHp(summary);
  const mood = moodFor(summary);
  const quests = getQuests(categories, totals, month);
  const shiny = isShiny(quests, summary);
  const nextQuest = quests.find((q) => q.saving && !q.complete);

  // One line on the month, and at most one more: bills that need paying, else the next quest.
  const lines = [narrate(summary, month, partner.name)];
  const statuses = billsFor(month, bills, payments, today());
  const pressing = needsPaying(statuses);
  if (pressing.length > 0) {
    const first = pressing.slice(0, 2).map((s) => s.bill.name).join(", ");
    lines.push(`Bills due: ${first}${pressing.length > 2 ? ` and ${pressing.length - 2} more` : ""}.`);
  } else if (shiny) lines.push(`Every quest is done. ${partner.name} is shining!`);
  else if (nextQuest) lines.push(`${money(nextQuest.target - nextQuest.done)} more in ${nextQuest.category.name} finishes a quest.`);

  // Each account as a party member. Archived ones only show while they still hold something.
  const party = accountHealth(accountBalances(accounts, net), transactions).filter(
    (row) => !row.account.archived_at || row.balance !== 0,
  );
  const usable = accounts.filter((a) => !a.archived_at);
  const savedCategory = categories.find((c) => c.id === params.cat);
  const savedAmount = Number(params.saved);

  // Bank balance at the end of each of the last six months.
  const balances = [-5, -4, -3, -2, -1, 0].map((n) => {
    const m = shiftMonth(month, n);
    return { label: monthLabel(m).slice(0, 3), value: summarizeMonth(totals, m, opening).balance };
  });

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}
      {/* The low-HP chirp, when this month's pay is nearly gone. */}
      {summary.income > 0 && hp <= 0.2 && month === parseMonth() && <LowHpAlarm />}
      <MonthPicker month={month} path="/" />

      <SceneBox
        startFolded={options.scene === "compact"}
        scene={
          <Scene>
            <img src={sprite.trainer(trainerId)} alt="" className="pixel sprite scene-trainer" />
            <div className="scene-partner">
              <PartnerSprite dex={partner.dex} name={partner.name} mood={mood} shiny={shiny} />
            </div>
            <WildPokemon balls={Math.max(0, player.entries - caught.length)} caught={caught} names={names} />
            <div className="hpbox hpbox-me scene-status">
              <div className="flex items-baseline justify-between gap-2 font-display text-[0.65rem] leading-relaxed">
                <span>
                  {partner.name}
                  {shiny && <span className="star" title="Shiny" />}
                </span>
                <span>Lv {player.level}</span>
              </div>
              <div className="grid grid-cols-[1.75rem_1fr] items-center gap-x-1">
                <span className="font-display text-[0.6rem] text-gold">HP</span>
                <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's income left" />
              </div>
              <p className="text-right leading-none">
                {money(Math.max(0, summary.remaining))} / {money(summary.income)}
              </p>
            </div>
          </Scene>
        }
        status={
          <div className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 gap-y-2 pb-2">
            <p className="col-span-3 flex items-center justify-between gap-2 font-display text-[0.65rem] leading-relaxed">
              <span className="flex items-center gap-2">
                <img src={sprite.icon(partner.dex)} alt="" width={40} height={30} className="pixel" />
                {partner.name}
                {shiny && <span className="star" title="Shiny" />}
              </span>
              <span>Lv {player.level}</span>
            </p>
            <span className="font-display text-[0.6rem] text-gold">HP</span>
            <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's income left" />
            <span className="text-muted">
              {money(Math.max(0, summary.remaining))} / {money(summary.income)}
            </span>
          </div>
        }
        xp={
          <>
            <span className="font-display text-[0.6rem] text-blue">XP</span>
            <Bar ratio={player.xpIntoLevel / player.xpForNext} tone="blue" label="Progress to next level" />
            <span className="text-muted">
              {player.xpIntoLevel} / {player.xpForNext}
            </span>
          </>
        }
      />

      {/* Message on the left, commands on the right, as in a battle. */}
      <div className="battle-bottom home-bottom">
        <Typewriter lines={lines} />
        {/* Four of the commands open pop-ups, so Home itself stays short. */}
        <nav className="window menu commands" aria-label="Shortcuts" data-menu>
          <Popup label="Log" title="Quick log" size="small" className="menu-item" closeOnSubmit>
            {/* Re-keyed after a save so it clears. */}
            <form key={params.t ?? "new"} action={addTransaction} className="popup-form">
              <input type="hidden" name="from" value="home" />
              <input type="hidden" name="when" value="today" />
              <label>
                How much?
                <input name="amount" inputMode="decimal" autoComplete="off" required autoFocus placeholder="₱" className="field" />
              </label>
              <label>
                On what?
                <select name="category_id" required defaultValue={params.cat ?? ""} className="field">
                  {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
                    <optgroup key={kind} label={KIND_LABEL[kind]}>
                      {categories
                        .filter((c) => c.kind === kind && !c.archived_at)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {usable.length > 0 && (
                <label>
                  Account
                  <select name="account" defaultValue={params.acct ?? usable[0].id} className="field">
                    {usable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="popup-actions">
                <Link href="/log" className="btn lead" data-sfx="page">
                  Full form
                </Link>
                <SubmitButton className="btn btn-primary" sfx="none">
                  Log it
                </SubmitButton>
              </div>
            </form>
          </Popup>
          <Link href="/battle" className="menu-item" data-sfx="confirm">
            Battle
          </Link>
          <Popup
            label="Accounts"
            title="Accounts"
            className="menu-item"
            footer={
              <Link href="/accounts" className="btn" data-sfx="page">
                Manage accounts
              </Link>
            }
          >
            {party.length > 0 ? <AccountParty rows={party} /> : <p className="text-muted">No accounts yet.</p>}
          </Popup>
          <Popup
            label="Money"
            title={monthLabel(month)}
            className="menu-item"
            footer={
              <Link href={`/stats?m=${month}`} className="btn" data-sfx="page">
                Full stats
              </Link>
            }
          >
            <PopupSection title="This month's pay" aside={money(summary.income)}>
              {summary.income === 0 && summary.expense === 0 ? (
                <p className="text-muted">Log your pay and this bar shows where it goes.</p>
              ) : (
                <PaySplit income={summary.income} expense={summary.expense} saving={summary.saving} />
              )}
            </PopupSection>
            <PopupSection title="Everything you hold" aside={money(summary.balance)}>
              <StepLine points={balances} label="Everything you hold at the end of each of the last six months" />
            </PopupSection>
          </Popup>
          <Popup
            label="Recent"
            title="Latest entries"
            className="menu-item"
            footer={
              <Link href={`/log?m=${month}`} className="btn" data-sfx="page">
                See all
              </Link>
            }
          >
            {transactions.length === 0 ? (
              <p className="text-muted">Nothing logged this month.</p>
            ) : (
              <EntryList entries={transactions.slice(0, 8)} />
            )}
          </Popup>
          <Link href={`/quests?m=${month}`} className="menu-item">
            Quests
          </Link>
        </nav>
      </div>

      {savedAmount > 0 && savedCategory && params.id && (
        <EntryResult
          key={params.t}
          kind={savedCategory.kind}
          amount={savedAmount}
          categoryName={savedCategory.name}
          month={month}
          totals={totals}
          opening={opening}
          partnerId={partnerId}
          names={names}
          entryId={params.id}
          from="home"
        />
      )}
    </>
  );
}
