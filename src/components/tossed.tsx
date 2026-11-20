// What you see after tossing something, and the list of what was tossed lately,
// each with a way to put it back (restoreTossed in lib/actions.ts).
import Link from "next/link";
import { restoreTossed } from "@/lib/actions";
import { dayLabel, money } from "@/lib/format";
import type { Tossed } from "@/lib/tossed";
import type { Account, Category } from "@/lib/types";
import { SubmitButton } from "./submit";
import { CategoryIcon } from "./ui";

/** Restore one tossed row, then land back on `back`. */
function RestoreButton({ id, back }: { id: string; back: string }) {
  return (
    <form action={restoreTossed}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton className="btn" pending="…" sfx="confirm">
        Restore
      </SubmitButton>
    </form>
  );
}

/** "Entry tossed." with Restore, and a link to everything tossed lately. */
export function TossedNotice({ message, id, back, month }: { message: string; id: string; back: string; month?: string }) {
  return (
    <div className="box flex flex-wrap items-center justify-between gap-x-4 gap-y-2" role="status">
      <p className="text-xl">{message}</p>
      <span className="flex flex-wrap items-center gap-x-4">
        <Link href={`/log?${month ? `m=${month}&` : ""}tossed=1`} className="text-blue underline" data-sfx="page">
          See tossed
        </Link>
        <RestoreButton id={id} back={back} />
      </span>
    </div>
  );
}

/** Entries and transfers tossed lately, newest toss first, each with Restore. */
export function TossedList({ rows, categories, accounts, back }: { rows: Tossed[]; categories: Category[]; accounts: Account[]; back: string }) {
  if (rows.length === 0) return <p className="text-muted">Nothing tossed in the last 30 days.</p>;
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "an account";
  return (
    <ul className="tossed-list">
      {rows.map((t) => {
        if (t.kind === "transfer") {
          return (
            <li key={t.id}>
              <span className="tossed-what">
                <span className="tag">Transfer</span>
                {accountName(t.row.from_account)} to {accountName(t.row.to_account)}
              </span>
              <span className="amount">{money(t.row.amount)}</span>
              <span className="text-muted">{dayLabel(t.row.occurred_on)}</span>
              <RestoreButton id={t.id} back={back} />
            </li>
          );
        }
        const category = categories.find((c) => c.id === t.row.category_id);
        const income = category?.kind === "income";
        return (
          <li key={t.id}>
            <span className="tossed-what">
              <CategoryIcon icon={category?.icon ?? "poke-ball"} />
              {category?.name ?? "Entry"}
              {t.row.note && <span className="text-muted">{t.row.note}</span>}
            </span>
            <span className={`amount ${income ? "text-green" : ""}`}>
              {income ? "+" : "−"}
              {money(t.row.amount)}
            </span>
            <span className="text-muted">{dayLabel(t.row.occurred_on)}</span>
            <RestoreButton id={t.id} back={back} />
          </li>
        );
      })}
    </ul>
  );
}
