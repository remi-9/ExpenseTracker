/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import { PartnerPicker, TrainerPicker } from "@/components/partner";
import { PlayOnMount } from "@/components/sound";
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, Panel } from "@/components/ui";
import { addCategory, addPreset, setCategoryArchived } from "@/lib/actions";
import { getCategories, getCaught, getPartnerId, getPokemonNames, getTrainerId } from "@/lib/data";
import { money } from "@/lib/format";
import { ITEM_ICONS, PRESETS, sprite } from "@/lib/partners";
import type { Kind } from "@/lib/types";

const GROUPS: [Kind, string][] = [
  ["income", "Income"],
  ["saving", "Savings"],
  ["expense", "Spending"],
];

// The first 151 Pokémon are offered as icons too.
const POKEMON_ICONS = Array.from({ length: 151 }, (_, i) => i + 1);

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [categories, trainerId, partnerId, caught, names] = await Promise.all([
    getCategories(),
    getTrainerId(),
    getPartnerId(),
    getCaught(),
    getPokemonNames(),
  ]);
  const presets = PRESETS.map((p, index) => ({ ...p, index })).filter(
    (p) => !categories.some((c) => c.name.toLowerCase() === p.name.toLowerCase()),
  );

  return (
    <>
      {error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{error}</Dialog>
        </>
      )}

      <Panel title="Your trainer">
        <TrainerPicker current={trainerId} />
      </Panel>

      <Panel title="Your partner">
        <PartnerPicker current={partnerId} caught={caught} names={names} />
      </Panel>

      <Panel title="Categories">
        {GROUPS.map(([kind, label]) => {
          const rows = categories.filter((c) => c.kind === kind);
          return (
            <div key={kind} className="mb-3">
              <h3 className="font-display text-[0.65rem] leading-loose text-muted">{label}</h3>
              {rows.length === 0 ? (
                <p className="text-muted">None yet.</p>
              ) : (
                <ul className="flex flex-col">
                  {rows.map((c) => (
                    <li
                      key={c.id}
                      className={`flex items-center justify-between gap-3 py-0.5 ${c.archived_at ? "text-muted" : ""}`}
                    >
                      <span className="min-w-0 truncate">
                        <CategoryIcon icon={c.icon} />
                        {c.name}
                        {c.is_fixed && <span className="text-muted"> · fixed bill</span>}
                        {c.monthly_target != null && (
                          <span className="text-muted">
                            {" "}
                            · {kind === "saving" ? "goal" : "budget"} {money(c.monthly_target)}
                          </span>
                        )}
                      </span>
                      <form action={setCategoryArchived}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="archive" value={c.archived_at ? "0" : "1"} />
                        <SubmitButton className="text-blue underline" pending="…">
                          {c.archived_at ? "Restore" : "Archive"}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Panel>

      {presets.length > 0 && (
        <Panel title="Quick add">
          <form action={addPreset} className="flex flex-wrap">
            {presets.map((p) => (
              <button key={p.name} name="preset" value={p.index} className="chip" data-sfx="confirm">
                <CategoryIcon icon={p.icon} />
                {p.name}
              </button>
            ))}
          </form>
          <p className="mt-2 text-muted">One tap adds it. Set a goal or budget by making your own below.</p>
        </Panel>
      )}

      <Panel title="Make your own">
        <form action={addCategory} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            Name
            <input name="name" required placeholder="e.g. Groceries" className="field" />
          </label>
          <label className="flex flex-col gap-1">
            Type
            <select name="kind" className="field" defaultValue="expense">
              <option value="expense">Spending</option>
              <option value="income">Income</option>
              <option value="saving">Savings</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            Monthly target (optional)
            <input
              name="monthly_target"
              type="number"
              min="0"
              step="0.01"
              placeholder="Savings goal or spending budget: turns it into a quest"
              className="field"
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1">Icon</legend>
            <details open>
              <summary className="cursor-pointer text-muted">Items ({ITEM_ICONS.length})</summary>
              <div className="icon-grid">
                {ITEM_ICONS.map((item) => (
                  <label key={item} className="chip p-1!" title={item.replaceAll("-", " ")}>
                    <input type="radio" name="icon" value={item} aria-label={item.replaceAll("-", " ")} />
                    <img src={sprite.item(item)} alt="" width={30} height={30} className="pixel" loading="lazy" />
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
          <label className="flex items-center gap-2 sm:col-span-2">
            <input name="is_fixed" type="checkbox" className="size-5 accent-(--red)" />
            Fixed monthly bill
          </label>
          <div className="sm:col-span-2">
            <SubmitButton pending="Adding…" sfx="confirm">
              Add category
            </SubmitButton>
          </div>
        </form>
      </Panel>
    </>
  );
}
