"use client";

// Move money between two accounts, from Home. Picking "From" takes that account
// out of the "To" choices, so the two can never be the same.
import { useState } from "react";
import { addTransfer } from "@/lib/actions";
import { today } from "@/lib/format";
import { SubmitButton } from "./submit";

export function MoveForm({
  accounts,
  from,
  view,
}: {
  accounts: { id: string; name: string }[];
  /** The account to start from: the one being looked at. */
  from?: string;
  /** Home's `a` value, to come back to the same account. */
  view: string;
}) {
  const [source, setSource] = useState(accounts.find((a) => a.id === from)?.id ?? accounts[0]?.id);
  const others = accounts.filter((a) => a.id !== source);
  const [picked, setPicked] = useState<string>();
  const target = others.find((a) => a.id === picked)?.id ?? others[0]?.id;

  return (
    <form action={addTransfer} className="popup-form">
      <input type="hidden" name="from" value="home" />
      <input type="hidden" name="a" value={view} />
      <label>
        How much?
        <input name="amount" inputMode="decimal" autoComplete="off" required autoFocus placeholder="₱" className="field" />
      </label>
      <fieldset>
        <legend>From</legend>
        <div className="flex flex-wrap">
          {accounts.map((a) => (
            <label key={a.id} className="chip">
              <input type="radio" name="from_account" value={a.id} checked={a.id === source} onChange={() => setSource(a.id)} />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>To</legend>
        <div className="flex flex-wrap">
          {others.map((a) => (
            <label key={a.id} className="chip">
              <input type="radio" name="to_account" value={a.id} checked={a.id === target} onChange={() => setPicked(a.id)} />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>
      <details>
        <summary className="cursor-pointer text-muted">Note or date</summary>
        <div className="quick-more">
          <input name="note" placeholder="Note" aria-label="Note" className="field" />
          <input name="occurred_on" type="date" defaultValue={today()} aria-label="Date" className="field" />
        </div>
      </details>
      <div className="popup-actions">
        <SubmitButton className="btn btn-primary" pending="Moving…" sfx="deposit">
          Move it
        </SubmitButton>
      </div>
    </form>
  );
}
