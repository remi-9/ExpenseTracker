/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import { SubmitButton } from "@/components/submit";
import { CategoryIcon, Dialog, Panel } from "@/components/ui";
import { addCategory, setCategoryArchived } from "@/lib/actions";
import { getCategories } from "@/lib/data";
import { money } from "@/lib/format";
import { ITEM_ICONS, sprite } from "@/lib/partners";
import type { Kind } from "@/lib/types";

const GROUPS: [Kind, string][] = [
  ["income", "Income"],
  ["saving", "Savings"],
  ["expense", "Spending"],
];

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const categories = await getCategories();

  return (
    <>
      {error && <Dialog tone="error">{error}</Dialog>}

      <Panel title="New category">
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
            <input name="monthly_target" type="number" min="0" step="0.01" placeholder="Savings goal or spending budget" className="field" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1">Icon</legend>
            <div className="flex flex-wrap">
              {ITEM_ICONS.map((item) => (
                <label key={item} className="chip p-1!" title={item.replaceAll("-", " ")}>
                  <input type="radio" name="icon" value={item} aria-label={item.replaceAll("-", " ")} />
                  <img src={sprite.item(item)} alt="" width={30} height={30} className="pixel" loading="lazy" />
                </label>
              ))}
            </div>
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
            <SubmitButton pending="Adding…">Add category</SubmitButton>
          </div>
        </form>
      </Panel>

      {GROUPS.map(([kind, label]) => {
        const rows = categories.filter((c) => c.kind === kind);
        return (
          <Panel key={kind} title={label}>
            {rows.length === 0 ? (
              <p className="text-muted">None yet.</p>
            ) : (
              <ul className="flex flex-col">
                {rows.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-3 py-1 ${c.archived_at ? "text-muted" : ""}`}
                  >
                    <span>
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
                      <button className="text-blue underline">{c.archived_at ? "Restore" : "Archive"}</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </>
  );
}
