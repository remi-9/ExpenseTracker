"use client";

// Pop-up windows: a framed game window over the dimmed page, with a title bar, a body
// and an optional row of actions along the bottom. Esc, Close or a click outside closes
// one. They are native <dialog>s, so focus stays inside and the page behind is inert.
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/** How wide the window is: "small" for a question or a few fields, "large" for a full form. */
export type PopupSize = "small" | "medium" | "large";

/**
 * Open a dialog. Focus goes to the field marked autoFocus if there is one, and
 * otherwise to the window itself, so no button is ringed before you have touched a key.
 */
function open(dialog: HTMLDialogElement | null) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  if (!dialog.querySelector("[autofocus]")) dialog.focus();
}

type WindowProps = {
  title: string;
  size?: PopupSize;
  /** Links or buttons shown along the bottom, right-aligned: where to go next from here. */
  footer?: ReactNode;
  children: ReactNode;
};

function PopupWindow({
  dialog,
  title,
  size = "medium",
  footer,
  onClose,
  closeOnSubmit,
  children,
}: WindowProps & {
  dialog: RefObject<HTMLDialogElement | null>;
  onClose?: () => void;
  closeOnSubmit?: boolean;
}) {
  return (
    <dialog
      ref={dialog}
      className="popup"
      tabIndex={-1}
      data-size={size}
      onClose={onClose}
      // A click on the dimmed page lands on the dialog itself, not on anything inside it.
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      onSubmit={closeOnSubmit ? (event) => event.currentTarget.close() : undefined}
    >
      <div className="window popup-window">
        <header className="popup-head">
          <h2>{title}</h2>
          <button type="button" className="popup-close" data-sfx="page" onClick={() => dialog.current?.close()}>
            Close <kbd>Esc</kbd>
          </button>
        </header>
        <div className="popup-body">{children}</div>
        {footer && <footer className="popup-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

/** A button that opens its children in a pop-up. */
export function Popup({
  label,
  className = "btn",
  closeOnSubmit,
  ...window
}: WindowProps & {
  label: ReactNode;
  /** The button's classes: "menu-item" inside a menu, "btn" elsewhere. */
  className?: string;
  /** Close as soon as a form inside is sent: for forms whose result shows on the page behind. */
  closeOnSubmit?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} data-sfx="confirm" aria-haspopup="dialog" onClick={() => open(dialog.current)}>
        {label}
      </button>
      <PopupWindow dialog={dialog} closeOnSubmit={closeOnSubmit} {...window} />
    </>
  );
}

/**
 * A pop-up that is open because of where the page is, for example /accounts?move=1.
 * Closing it goes to `closeHref`. A form inside that sends you elsewhere just takes it away.
 */
export function RoutePopup({ closeHref, ...window }: WindowProps & { closeHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  /** False while the pop-up is being taken off the page, when closing must not navigate. */
  const shown = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    shown.current = true;
    open(element);
    // Leaving the page takes the dialog with it. It is not closed by hand here: its close
    // event arrives late, and in development React mounts twice, so it would look like a real close.
    return () => {
      shown.current = false;
    };
  }, []);

  return <PopupWindow dialog={dialog} onClose={() => shown.current && router.replace(closeHref, { scroll: false })} {...window} />;
}

/** A titled part of a pop-up's body, with an optional figure at the right of the title. */
export function PopupSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="popup-section">
      <h3>
        {title}
        {aside && <span>{aside}</span>}
      </h3>
      {children}
    </section>
  );
}
