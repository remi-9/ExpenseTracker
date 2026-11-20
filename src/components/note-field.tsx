"use client";

import { useId } from "react";
import type { Kind } from "@/lib/types";

/**
 * The note on the entry form. It suggests notes used before, from any month, and
 * choosing one selects the kind and category it was last logged under.
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
        placeholder="Optional, e.g. Custom table"
        className="field"
        onChange={(event) => {
          const typed = event.target.value.trim().toLowerCase();
          const hint = typed && hints.find((h) => h.note.toLowerCase() === typed);
          const form = event.target.form;
          if (!hint || !form) return;
          const check = (name: string, value: string) => {
            const radio = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${CSS.escape(value)}"]`);
            if (radio) radio.checked = true;
          };
          check("kind", hint.kind);
          check(`category_${hint.kind}`, hint.category_id);
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
