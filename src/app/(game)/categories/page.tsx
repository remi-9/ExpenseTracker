import { Dialog, Panel } from "@/components/ui";
import { addCategory, setCategoryArchived } from "@/lib/actions";
import { getCategories } from "@/lib/data";
import { money } from "@/lib/format";
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
          <label className="flex flex-col gap-1">
            Icon (any emoji)
            <input name="icon" maxLength={4} placeholder="🛒" className="field" />
          </label>
          <label className="flex flex-col gap-1">
            Monthly target (optional)
            <input name="monthly_target" type="number" min="0" step="0.01" placeholder="Goal or budget" className="field" />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input name="is_fixed" type="checkbox" className="size-5 accent-(--red)" />
            Fixed monthly bill
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Add category</button>
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
                      {c.icon} {c.name}
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
