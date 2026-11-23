/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { CategoryPicker } from "@/components/category-picker";
import { EntryResult } from "@/components/entry-result";
import { Glance, type GlanceTab } from "@/components/glance";
import { MoveForm } from "@/components/move-form";
import { NoteField } from "@/components/note-field";
import { LowHpAlarm } from "@/components/nav";
import { PartnerPicker, PartnerSprite, type Mood } from "@/components/partner";
import { Popup } from "@/components/popup";
import { Scene } from "@/components/scene";
import { SceneBox } from "@/components/scene-box";
import { PlayOnMount } from "@/components/sound";
import { SubmitButton } from "@/components/submit";
import { TossedNotice } from "@/components/tossed";
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
  getNoteHints,
  getOptions,
  getPartnerId,
  getPokemonNames,
  getRecentCategories,
  getTrainerId,
  getTransactionsFrom,
  getTransfersFrom,
} from "@/lib/data";
import { money, monthLabel, parseMonth, shiftMonth, today } from "@/lib/format";
import { getPlayer, getQuests, isShiny, payMonth, summarizeMonth, walletHp, type MonthSummary } from "@/lib/game";
import { accountBalances, accountDeltas, accountMonth, billsFor, dailyBalances, daysIn, needsPaying, openingTotal } from "@/lib/money";
import { MAX_DEX, partnerAt, sprite } from "@/lib/partners";
import { startCategory } from "@/lib/picks";
import type { Account, Category, Kind } from "@/lib/types";

/** The quick-log pop-ups: what each asks, and where the money goes or comes from. */
const QUICK: { kind: Kind; label: string; title: string; account: string }[] = [
  { kind: "expense", label: "Spent", title: "Spent", account: "From" },
  { kind: "income", label: "Earned", title: "Earned", account: "Into" },
];
const DONE: Record<string, string> = { moved: "Money moved.", restored: "Restored." };
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
    /** The account being looked at, or "all". Without it, the first account. */
    a?: string;
    done?: string;
    /** Set by a quick log: what was saved, to play its result here. */
    saved?: string;
    cat?: string;
    acct?: string;
    id?: string;
    t?: string;
    error?: string;
    /** After Undo: the id of the entry tossed, so the message can offer Restore. */
    r?: string;
  }>;
}) {
  const params = await searchParams;
  const month = parseMonth(params.m);
  const first = `${month}-01`;
  const [categories, totals, since, moves, partnerId, trainerId, caught, names, accounts, net, bills, payments, options, hints, recentCategories] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    // Everything from the first of the month onwards: a balance is worked back from what it is now.
    getTransactionsFrom(first),
    getTransfersFrom(first),
    getPartnerId(),
    getTrainerId(),
    getCaught(),
    getPokemonNames(),
    getAccounts(),
    getAccountNet(),
    getBills(),
    getBillPayments(month),
    getOptions(),
    getNoteHints(),
    getRecentCategories(),
  ]);
  const monthEnd = `${shiftMonth(month, 1)}-01`;
  const transactions = since.filter((t) => t.occurred_on < monthEnd);
  const transfers = moves.filter((t) => t.occurred_on < monthEnd);

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

  // The account being looked at: the one asked for, else the first. "all" is every account together.
  const usable = accounts.filter((a) => !a.archived_at);
  const account = params.a === "all" ? undefined : (usable.find((a) => a.id === params.a) ?? usable[0]);
  const view = account?.id ?? "all";
  const tabs: GlanceTab[] = [...usable.map(({ id, name, icon }) => ({ id, name, icon })), { id: "all", name: "All", icon: "poke-ball" }];
  const figures = accountMonth(account?.id ?? null, transactions, transfers);
  // What it holds now: the account's own balance, or everything ever earned less everything spent.
  const holds = account
    ? accountBalances([account], net)[0].balance
    : summarizeMonth(totals, "9999-12", opening).balance;
  const line = dailyBalances(holds, accountDeltas(account?.id ?? null, since, moves), month, today());
  const balance = line.days[line.days.length - 1]?.balance ?? holds;
  const went = figures.went.flatMap(({ category_id, total }) => {
    const c = categories.find((c) => c.id === category_id);
    return c ? [{ id: c.id, name: c.name, icon: c.icon, total }] : [];
  });
  const recent = account ? transactions.filter((t) => t.account_id === account.id || t.to_account_id === account.id) : transactions;

  const savedCategory = categories.find((c) => c.id === params.cat);
  const savedAmount = Number(params.saved);
  const savedEntry = transactions.find((t) => t.id === params.id);

  // The name, level and HP, as a battle shows them: in both sizes of the scene.
  const statusBox = (
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
        <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's pay left" />
      </div>
      <p className="text-right leading-none">
        {money(Math.max(0, summary.remaining))} / {money(summary.income)}
      </p>
    </div>
  );
  // Something different rustles in the grass each day.
  const peeking = 1 + ((Number(today().replaceAll("-", "")) * 7) % MAX_DEX);

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
      {params.done && DONE[params.done] && <Dialog>{DONE[params.done]}</Dialog>}
      {params.done === "tossed" && params.r && (
        <TossedNotice message="Entry tossed." id={params.r} back={view === "all" || !params.a ? "/" : `/?a=${encodeURIComponent(params.a)}`} month={month} />
      )}
      {/* Wide windows: the account and the scene on the left, the jobs and the latest
          entries on the right (placed by .home-grid in globals.css). Phones: this order. */}
      <div className="home-grid">
        <MonthPicker month={month} path="/" />

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
            view={view}
            countsFor={savedCategory.kind === "income" && savedEntry ? payMonth(savedEntry.occurred_on) : undefined}
          />
        )}

        {usable.length === 0 ? (
          <Panel title="Accounts">
            <p className="text-muted">No accounts yet.</p>
            <Link href="/accounts?new=1" className="btn mt-3" data-sfx="page">
              Add an account
            </Link>
          </Panel>
        ) : (
          <Glance
            tabs={tabs}
            current={view}
            month={month}
            balance={balance}
            opening={line.opening}
            days={line.days}
            span={daysIn(month)}
            figures={figures}
            went={went}
          />
        )}
        <div className="home-side">
          {/* The everyday jobs, one tap each. The log pop-ups start on the account being looked at. */}
          <nav className="window menu commands home-commands" aria-label="Shortcuts" data-menu>
            {QUICK.map((quick) => (
              <Popup key={quick.kind} label={quick.label} title={quick.title} size="small" className="menu-item" closeOnSubmit>
                <QuickLog
                  key={params.t ?? "new"}
                  quick={quick}
                  categories={categories}
                  accounts={usable}
                  account={account?.id ?? usable.find((a) => a.id === params.acct)?.id}
                  lastCategory={params.cat}
                  recent={recentCategories}
                  hints={hints}
                  view={view}
                />
              </Popup>
            ))}
            {usable.length > 1 && (
              <Popup label="Move" title="Move money" size="small" className="menu-item" closeOnSubmit>
                <MoveForm key={`${view}-${params.t ?? ""}`} accounts={usable.map(({ id, name }) => ({ id, name }))} from={account?.id} view={view} />
              </Popup>
            )}
            <Popup
              label="Recent"
              title={account ? `${account.name}: latest` : "Latest entries"}
              className="menu-item"
              footer={
                <Link href={`/log?m=${month}`} className="btn" data-sfx="page">
                  See all
                </Link>
              }
            >
              {recent.length === 0 ? <p className="text-muted">Nothing logged this month.</p> : <EntryList entries={recent.slice(0, 8)} />}
            </Popup>
            <Link href={account ? `/accounts?a=${account.id}&check=1` : "/accounts"} className="menu-item" data-sfx="confirm" title="Compare with what the bank shows">
              Check
            </Link>
            <Link href="/battle" className="menu-item" data-sfx="confirm">
              Battle
            </Link>
          </nav>
          {/* Wide windows only: the latest entries, which phones open from Recent. */}
          <Panel
            title={account ? `${account.name}: latest` : "Latest entries"}
            className="wide-only"
            aside={
              <Link href={`/log?m=${month}`} className="underline" data-sfx="page">
                See all
              </Link>
            }
          >
            {recent.length === 0 ? <p className="text-muted">Nothing logged this month.</p> : <EntryList entries={recent.slice(0, 8)} />}
          </Panel>
        </div>
        <SceneBox
          startFolded={options.scene === "compact"}
          scene={
            <Scene>
              <img src={sprite.trainer(trainerId)} alt="" className="pixel sprite scene-trainer" />
              <div className="scene-partner">
                <PartnerSprite dex={partner.dex} name={partner.name} mood={mood} shiny={shiny} />
              </div>
              <WildPokemon balls={Math.max(0, player.entries - caught.length)} caught={caught} names={names} />
              {statusBox}
            </Scene>
          }
          strip={
            <Scene strip>
              <img src={sprite.icon(peeking)} alt="" className="pixel strip-wild" />
              <img src={sprite.trainer(trainerId)} alt="" className="pixel strip-trainer" />
              <div className="strip-partner" data-mood={mood}>
                <PartnerSprite dex={partner.dex} name={partner.name} mood={mood} shiny={shiny} card />
              </div>
              {statusBox}
            </Scene>
          }
          status={
            <div className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-2 gap-y-2">
              <p className="col-span-3 flex items-center justify-between gap-2 font-display text-[0.65rem] leading-relaxed">
                <span className="flex items-center gap-2">
                  {partner.name}
                  {shiny && <span className="star" title="Shiny" />}
                </span>
                <span>Lv {player.level}</span>
              </p>
              <span className="font-display text-[0.6rem] text-gold">HP</span>
              <Bar ratio={hp} tone={hpTone(hp)} label="Share of this month's pay left" />
              <span className="text-muted">
                {money(Math.max(0, summary.remaining))} / {money(summary.income)}
              </span>
            </div>
          }
          message={<Typewriter lines={lines} plain />}
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
      </div>
    </>
  );
}

/** The form in a quick-log pop-up: an amount, a category, what it was for and an account. */
function QuickLog({
  quick,
  categories,
  accounts,
  account,
  lastCategory,
  recent,
  hints,
  view,
}: {
  quick: (typeof QUICK)[number];
  categories: Category[];
  accounts: Account[];
  /** The account to start on. */
  account?: string;
  /** The category of the entry logged last, which the form opens on if it is of this kind. */
  lastCategory?: string;
  /** Categories of the latest entries, newest first: the form starts on the latest of this kind. */
  recent: string[];
  /** Notes used before, for the "What for" suggestions. */
  hints: { note: string; category_id: string }[];
  view: string;
}) {
  const choices = categories.filter((c) => c.kind === quick.kind && !c.archived_at);
  const startOn = startCategory(choices, lastCategory, recent);
  const offered = new Set(choices.map((c) => c.id));
  const noteHints = hints.filter((h) => offered.has(h.category_id)).map((h) => ({ ...h, kind: quick.kind }));
  return (
    <form action={addTransaction} className="popup-form">
      <input type="hidden" name="from" value="home" />
      <input type="hidden" name="a" value={view} />
      <input type="hidden" name="kind" value={quick.kind} />
      <label>
        How much?
        <input name="amount" inputMode="decimal" autoComplete="off" required autoFocus data-autofocus placeholder="₱" className="field" />
      </label>
      <CategoryPicker name="category_id" choices={choices} picked={startOn} label="Category" />
      <label>
        What for?
        <NoteField hints={noteHints} />
      </label>
      {accounts.length > 0 && (
        <fieldset>
          <legend>{quick.account}</legend>
          <div className="flex flex-wrap">
            {accounts.map((a) => (
              <label key={a.id} className="chip">
                <input type="radio" name="account" value={a.id} defaultChecked={a.id === (account ?? accounts[0].id)} />
                {a.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <details>
        <summary className="cursor-pointer text-muted">Date: today</summary>
        <div className="quick-more">
          <input name="occurred_on" type="date" defaultValue={today()} max={today()} aria-label="Date" className="field" />
        </div>
      </details>
      <div className="popup-actions">
        <Link href={`/log?kind=${quick.kind}`} className="btn lead" data-sfx="page">
          Full form
        </Link>
        <SubmitButton className="btn btn-primary" sfx="none">
          Log it
        </SubmitButton>
      </div>
    </form>
  );
}
