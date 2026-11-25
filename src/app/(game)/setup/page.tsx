/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { ThemeToggle } from "@/components/nav";
import { PartnerPicker, TrainerPicker } from "@/components/partner";
import { PlayOnMount, SoundSwitch, VolumeSlider } from "@/components/sound";
import { Icon } from "@/components/sprite";
import { SubmitButton } from "@/components/submit";
import { Bar, CategoryIcon, Columns, Dialog, Panel } from "@/components/ui";
import { ImportForm } from "@/components/import-form";
import { addCategory, addPreset, setCategoryArchived, setOption, setPassword } from "@/lib/actions";
import {
  getBills,
  getCategories,
  getCaught,
  getMonthTotals,
  getOptions,
  getPartnerId,
  getPokemonNames,
  getTrainerId,
  getUserEmail,
} from "@/lib/data";
// The release number, shown in small text on Options.
import { version } from "../../../../package.json";
import { money, parseMonth } from "@/lib/format";
import type { CSSProperties } from "react";
import { PATTERNS, TONE_COLORS, TONES, type Tone } from "@/lib/backdrop";
import { FRAMES, SPEEDS } from "@/lib/options";
import { ITEM_ICONS, PRESETS, sprite } from "@/lib/partners";
import type { Category, Kind } from "@/lib/types";

// Setup is a small menu of its own, like a game's pause menu.
const SCREENS = [
  ["bag", "Bag"],
  ["trainer", "Trainer"],
  ["partner", "Partner"],
  ["options", "Options"],
  ["data", "Data"],
] as const;
type Screen = (typeof SCREENS)[number][0];

// The Bag has a pocket for each kind of category.
const POCKETS: [Kind, string][] = [
  ["expense", "Spending"],
  ["income", "Income"],
  ["saving", "Savings"],
];

// The first 151 Pokémon are offered as icons too.
const POKEMON_ICONS = Array.from({ length: 151 }, (_, i) => i + 1);

const detail = (c: Category) =>
  c.archived_at
    ? "Archived"
    : c.monthly_target != null
      ? `${c.kind === "saving" ? "Goal" : "Budget"} ${money(c.monthly_target)}`
      : "";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string; s?: string; pocket?: string; c?: string; new?: string }>;
}) {
  const params = await searchParams;
  const screen: Screen = SCREENS.find(([id]) => id === params.s)?.[0] ?? "bag";

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}

      {params.done === "password" && <Dialog>Password saved. Use it the next time you sign in.</Dialog>}

      <nav className="window menu submenu" aria-label="Setup" data-menu>
        {SCREENS.map(([id, label]) => (
          <Link key={id} href={`/setup?s=${id}`} className="menu-item" data-sfx="tab" aria-current={id === screen ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {screen === "bag" && <Bag pocket={params.pocket} selected={params.c} adding={!!params.new} />}
      {screen === "trainer" && (
        <Panel title="Who are you?">
          <TrainerPicker current={await getTrainerId()} />
        </Panel>
      )}
      {screen === "partner" && <Partner />}
      {screen === "options" && <Options />}
      {screen === "data" && <Data />}
    </>
  );
}

async function Partner() {
  const [partnerId, caught, names] = await Promise.all([getPartnerId(), getCaught(), getPokemonNames()]);
  return (
    <Panel title="Choose your partner">
      <PartnerPicker current={partnerId} caught={caught} names={names} />
    </Panel>
  );
}

/** Categories, laid out like the Bag: the pockets and their items on the left, the picked item on the right. */
async function Bag({ pocket, selected, adding }: { pocket?: string; selected?: string; adding: boolean }) {
  const [categories, names, totals, bills] = await Promise.all([getCategories(), getPokemonNames(), getMonthTotals(), getBills()]);
  const kind = POCKETS.find(([k]) => k === pocket)?.[0] ?? "expense";
  const label = POCKETS.find(([k]) => k === kind)![1];
  const items = categories.filter((c) => c.kind === kind);
  const item = items.find((c) => c.id === selected) ?? (adding ? undefined : items[0]);
  const presets = PRESETS.map((p, index) => ({ ...p, index })).filter(
    (p) => p.kind === kind && !categories.some((c) => c.name.toLowerCase() === p.name.toLowerCase()),
  );
  const href = (extra: string) => `/setup?s=bag&pocket=${kind}${extra}`;
  // This month for each item: how much, and how many entries.
  const month = `${parseMonth()}-01`;
  const thisMonth = (id: string) => totals.find((t) => t.month === month && t.category_id === id);
  const itemBills = item ? bills.filter((b) => b.category_id === item.id && !b.archived_at) : [];
  const spent = item ? (thisMonth(item.id)?.total ?? 0) : 0;
  const target = item?.monthly_target ?? null;

  return (
    <>
      {/* Wide windows: the pockets and their items on the left, the picked item on the right. */}
      <Columns
        side={
          item &&
          !adding && (
            <Panel
              title={item.name}
              aside={
                <span>
                  {label}
                  {item.archived_at ? " · Archived" : ""}
                </span>
              }
            >
              <div className="account-head">
                <CategoryIcon icon={item.icon} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="account-balance">{money(spent)}</p>
                  <p className="text-muted">
                    {kind === "income" ? "earned" : kind === "saving" ? "set aside" : "spent"} this month,{" "}
                    {thisMonth(item.id)?.entries ?? 0} {thisMonth(item.id)?.entries === 1 ? "entry" : "entries"}
                  </p>
                </div>
              </div>

              {target != null && (
                <div className="mt-3 flex flex-col gap-1">
                  <Bar
                    ratio={Math.min(1, spent / (target || 1))}
                    tone={kind === "saving" ? "blue" : spent > target ? "red" : spent > target * 0.8 ? "gold" : "green"}
                    label={kind === "saving" ? "Progress to this month's goal" : "Share of this month's budget used"}
                  />
                  <p className="text-muted">
                    {kind === "saving"
                      ? spent >= target
                        ? `Goal of ${money(target)} reached.`
                        : `${money(target - spent)} to go for the ${money(target)} goal.`
                      : spent > target
                        ? `${money(spent - target)} over the ${money(target)} budget.`
                        : `${money(target - spent)} left of the ${money(target)} budget.`}
                  </p>
                </div>
              )}

              <h3 className="mt-4 mb-1 font-display text-[0.6rem] leading-loose text-muted uppercase">Bills</h3>
              {itemBills.length === 0 ? (
                <p className="text-muted">None scheduled under {item.name}.</p>
              ) : (
                <ul>
                  {itemBills.map((b) => (
                    <li key={b.id}>
                      <Link href={`/bills?b=${b.id}`} className="underline">
                        {b.name}
                      </Link>{" "}
                      <span className="text-muted">
                        {b.amount != null ? money(b.amount) : "varies"}, day {b.due_day}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {item.archived_at && <p className="mt-2 text-muted">It is archived, so it is hidden when you log.</p>}

              <div className="menu commands account-commands bag-commands" data-menu>
                <Link href={`/log?kind=${kind}&cat=${item.id}`} className="menu-item" data-sfx="confirm">
                  Log an entry
                </Link>
                <Link href={`/bills?new=1&cat=${item.id}`} className="menu-item" data-sfx="confirm">
                  Schedule a bill
                </Link>
                <form action={setCategoryArchived}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="archive" value={item.archived_at ? "0" : "1"} />
                  <SubmitButton className="menu-item" pending="…" sfx="page">
                    {item.archived_at ? "Restore" : "Archive"}
                  </SubmitButton>
                </form>
              </div>
            </Panel>
          )
        }
      >
        <section className="box bag-box" aria-label="Bag">
          <nav className="bag-pockets" aria-label="Pockets" data-menu>
            <Icon name="bag" size={40} />
            {POCKETS.map(([k, name]) => (
              <Link
                key={k}
                href={`/setup?s=bag&pocket=${k}`}
                className="menu-item"
                data-sfx="page"
                aria-current={k === kind ? "true" : undefined}
              >
                {name}
              </Link>
            ))}
          </nav>

          <div className="menu bag-grid" data-menu>
            {items.map((c) => (
              <Link
                key={c.id}
                href={href(`&c=${c.id}`)}
                scroll={false}
                className={`menu-item bag-item ${c.archived_at ? "opacity-50" : ""}`}
                data-sfx="chip"
                aria-current={c.id === item?.id ? "true" : undefined}
              >
                <CategoryIcon icon={c.icon} size={28} />
                <span className="min-w-0">
                  <span className="block break-words">{c.name}</span>
                  <small className="block">
                    {money(thisMonth(c.id)?.total ?? 0)}
                    {detail(c) ? ` · ${detail(c)}` : ""}
                  </small>
                </span>
              </Link>
            ))}
            <Link href={href("&new=1")} scroll={false} className="menu-item bag-item" data-sfx="confirm" aria-current={adding ? "true" : undefined}>
              + New {label.toLowerCase()} item
            </Link>
          </div>
        </section>

        {adding && (
          <Panel title={`New ${label.toLowerCase()} item`}>
            {presets.length > 0 && (
              <>
                <form action={addPreset} className="flex flex-wrap">
                  {presets.map((p) => (
                    <button key={p.name} name="preset" value={p.index} className="chip" data-sfx="confirm">
                      <CategoryIcon icon={p.icon} />
                      {p.name}
                    </button>
                  ))}
                </form>
                <p className="mt-1 mb-3 text-muted">One tap adds any of these. Or make your own:</p>
              </>
            )}
            <form action={addCategory} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="kind" value={kind} />
              <label className="flex flex-col gap-1">
                Name
                <input name="name" required placeholder="e.g. Groceries" className="field" />
              </label>
              {kind !== "income" && (
                <label className="flex flex-col gap-1">
                  {kind === "saving" ? "Monthly goal (optional)" : "Monthly budget (optional)"}
                  <input name="monthly_target" type="number" min="0" step="0.01" placeholder="Turns it into a quest" className="field" />
                </label>
              )}
              <fieldset className="sm:col-span-2">
                <legend className="mb-1">Icon</legend>
                <details open>
                  <summary className="cursor-pointer text-muted">Items ({ITEM_ICONS.length})</summary>
                  <div className="icon-grid">
                    {ITEM_ICONS.map((icon) => (
                      <label key={icon} className="chip p-1!" title={icon.replaceAll("-", " ")}>
                        <input type="radio" name="icon" value={icon} aria-label={icon.replaceAll("-", " ")} />
                        <img src={sprite.item(icon)} alt="" width={30} height={30} className="pixel" loading="lazy" />
                      </label>
                    ))}
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer text-muted">Pokémon ({POKEMON_ICONS.length})</summary>
                  <div className="icon-grid">
                    {POKEMON_ICONS.map((dex) => (
                      <label key={dex} className="chip p-0.5!" title={names[dex - 1] ?? `No. ${dex}`}>
                        <input type="radio" name="icon" value={`pkmn-${dex}`} aria-label={names[dex - 1] ?? `No. ${dex}`} />
                        <img src={sprite.icon(dex)} alt="" width={40} height={30} className="pixel" loading="lazy" />
                      </label>
                    ))}
                  </div>
                </details>
                <label className="mt-2 flex items-center gap-2">
                  or an emoji
                  <input name="emoji" maxLength={4} className="field w-20!" />
                </label>
              </fieldset>
              <div className="sm:col-span-2">
                <SubmitButton pending="Adding…" sfx="confirm">
                  Add to bag
                </SubmitButton>
              </div>
            </form>
          </Panel>
        )}
      </Columns>
    </>
  );
}

/** Getting entries in and out as CSV files. */
function Data() {
  return (
    <>
      <Panel title="Import entries">
        <p className="mb-3 text-muted">
          A CSV with <b>date</b>, <b>category</b> and <b>amount</b> columns. <b>note</b>, <b>account</b> and <b>kind</b> are optional.
        </p>
        <ImportForm />
      </Panel>
      <Panel title="Export entries">
        <p className="mb-3 text-muted">
          Every entry as one CSV file, in the same columns. Keep it as a backup.
        </p>
        <a href="/export" download className="btn">
          Download entries.csv
        </a>
      </Panel>
    </>
  );
}

/** The Options screen: one setting per line, choices to the right, the current one marked. */
async function Options() {
  const [options, email] = await Promise.all([getOptions(), getUserEmail()]);
  // Each row is a small form: pressing a choice posts that one setting.
  const rows: { label: string; name: keyof typeof options; choices: readonly string[] }[] = [
    { label: "Text speed", name: "speed", choices: SPEEDS },
    { label: "Frame", name: "frame", choices: FRAMES },
    { label: "Backdrop", name: "tone", choices: TONES },
    { label: "Pattern", name: "pattern", choices: PATTERNS },
  ];
  return (
    <>
      {/* Wide windows: the options beside the password. */}
      <Columns
        side={
          <>
            {email && (
              <Panel title="Password">
                <form action={setPassword} className="flex flex-wrap items-end gap-x-2 gap-y-3">
                  {/* Not shown: it tells a password manager which login the password belongs to. */}
                  <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
                  <label className="flex min-w-0 flex-1 basis-52 flex-col gap-1">
                    New password
                    <input name="password" type="password" required minLength={8} autoComplete="new-password" className="field" />
                  </label>
                  <SubmitButton pending="Saving…" sfx="confirm">
                    Save password
                  </SubmitButton>
                </form>
                <p className="mt-3 text-muted">Sign in with it from then on. A login link still works.</p>
              </Panel>
            )}
          </>
        }
      >
        <section className="window options" aria-label="Options">
          {rows.map(({ label, name, choices }) => (
            <form key={name} action={setOption} className="option" data-menu>
              <span className="option-label">{label}</span>
              <div className="option-choices">
                {choices.map((choice) => (
                  <button
                    key={choice}
                    name={name}
                    value={choice}
                    className="menu-item"
                    aria-pressed={options[name] === choice}
                    aria-label={choice}
                    title={choice}
                    data-sfx="chip"
                  >
                    {name === "tone" ? (
                      <span
                        className="swatch"
                        style={
                          {
                            "--day": TONE_COLORS[choice as Tone].day,
                            "--night": TONE_COLORS[choice as Tone].night,
                          } as CSSProperties
                        }
                      />
                    ) : (
                      choice
                    )}
                  </button>
                ))}
              </div>
            </form>
          ))}
          <div className="option">
            <span className="option-label">Sound</span>
            <div className="option-choices">
              <SoundSwitch />
            </div>
          </div>
          <div className="option">
            <span className="option-label">Music</span>
            <div className="option-choices">
              <VolumeSlider channel="music" />
            </div>
          </div>
          <div className="option">
            <span className="option-label">Effects</span>
            <div className="option-choices">
              <VolumeSlider channel="sfx" />
            </div>
          </div>
          <div className="option">
            <span className="option-label">Screen</span>
            <div className="option-choices">
              <ThemeToggle />
            </div>
          </div>
          <p className="mt-2 text-muted">
            Frame recolours every window. Backdrop and pattern are chosen separately.
          </p>
          <p className="mt-2 text-right text-sm text-muted">Version {version}</p>
        </section>
      </Columns>
    </>
  );
}
