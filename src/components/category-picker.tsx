"use client";

// One control for choosing a category: a button showing the chosen one, which opens
// a pop-up of every category as a grid. Picking one closes it. The choice is sent
// with the form in a hidden field named `name`. The "What for" field can choose for
// it too, by sending a "category-pick" event to that hidden field (see NoteField).
import { useEffect, useId, useRef, useState } from "react";
import { CategoryIcon } from "./ui";

export type CategoryChoice = { id: string; name: string; icon: string; /** A heading to list it under, for mixed kinds. */ group?: string };

/** The event NoteField sends to a picker's hidden field to choose a category. */
export const PICK_EVENT = "category-pick";

export function CategoryPicker({
  name,
  choices,
  picked,
  label,
}: {
  name: string;
  choices: CategoryChoice[];
  /** The category to start on; the first when it is not one of the choices. */
  picked?: string;
  label: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [current, setCurrent] = useState(picked);
  const chosen = choices.find((c) => c.id === current) ?? choices[0];

  useEffect(() => {
    const input = field.current;
    const onPick = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (choices.some((c) => c.id === id)) setCurrent(id);
    };
    input?.addEventListener(PICK_EVENT, onPick);
    return () => input?.removeEventListener(PICK_EVENT, onPick);
  }, [choices]);

  const open = () => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  };
  const groups = [...new Set(choices.map((c) => c.group))];

  if (!chosen) return null;
  return (
    <div className="cat-picker">
      <span id={labelId}>{label}</span>
      <input ref={field} type="hidden" name={name} value={chosen.id} />
      <button type="button" className="cat-picker-button" data-sfx="confirm" aria-haspopup="dialog" aria-labelledby={`${labelId} ${labelId}-name`} onClick={open}>
        <CategoryIcon icon={chosen.icon} size={32} />
        <span id={`${labelId}-name`} className="cat-picker-name">
          {chosen.name}
        </span>
        <span className="cat-picker-change" aria-hidden>
          Change ▸
        </span>
      </button>

      {/* Inside the form, but nothing here is sent: the hidden field above carries the choice. */}
      <dialog
        ref={dialog}
        className="popup"
        data-size="medium"
        tabIndex={-1}
        aria-labelledby={labelId}
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <div className="window popup-window">
          <header className="popup-head">
            <h2>{label}</h2>
            <button type="button" className="popup-close" data-sfx="page" onClick={() => dialog.current?.close()}>
              Close <kbd>Esc</kbd>
            </button>
          </header>
          <div className="popup-body">
            {groups.map((group) => (
              <section key={group ?? ""} className="cat-group">
                {group && <h3>{group}</h3>}
                <div className="cat-grid" data-menu>
                  {choices
                    .filter((c) => c.group === group)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="cat-tile"
                        data-sfx="chip"
                        aria-pressed={c.id === chosen.id}
                        onClick={() => {
                          setCurrent(c.id);
                          dialog.current?.close();
                        }}
                      >
                        <CategoryIcon icon={c.icon} size={48} />
                        <span>{c.name}</span>
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </div>
  );
}
