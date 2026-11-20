"use client";

import { useId } from "react";
import { PICK_EVENT } from "./category-picker";
import type { Kind } from "@/lib/types";

/**
 * The "What for" field of an entry form. It suggests notes used before, from any
 * month, and choosing one selects the kind and category it was last logged under.
 */
export function NoteField({
  hints,
  defaultValue,
}: {
  hints: { note: string; category_id: string; kind: Kind }[];
  defaultValue?: string;
}) {
  // The form can be on the page twice (new entry, and one being edited), so the list needs its own id.
  const listId = useId();
  return (
    <>
      <input
        name="note"
        list={listId}
        defaultValue={defaultValue}
        placeholder="Optional, e.g. Groceries"
        className="field"
        onChange={(event) => {
          const typed = event.target.value.trim().toLowerCase();
          const hint = typed && hints.find((h) => h.note.toLowerCase() === typed);
          const form = event.target.form;
          if (!hint || !form) return;
          const kind = form.querySelector<HTMLInputElement>(`input[name="kind"][value="${hint.kind}"]`);
          if (kind?.type === "radio") kind.checked = true;
          // The category picker for that kind: one per kind on Log, a single one in the Home pop-ups.
          const picker = form.querySelector(`input[name="category_${hint.kind}"], input[name="category_id"]`);
          picker?.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: hint.category_id }));
        }}
      />
      <datalist id={listId}>
        {hints.map((h) => (
          <option key={h.note} value={h.note} />
        ))}
      </datalist>
    </>
  );
}
