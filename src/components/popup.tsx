"use client";

// Pop-up windows, over a dimmed page. Esc, the Close button or a click outside closes one.
// They are native <dialog>s, so focus stays inside and the page behind cannot be used.
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

function PopupWindow({
  dialog,
  title,
  onClose,
  closeOnSubmit,
  children,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  title: string;
  onClose?: () => void;
  closeOnSubmit?: boolean;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={dialog}
      className="popup"
      onClose={onClose}
      // A click on the dimmed page lands on the dialog itself, not on anything inside it.
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      onSubmit={closeOnSubmit ? (event) => event.currentTarget.close() : undefined}
    >
      <section className="box">
        <header className="panel-title">
          <h2>{title}</h2>
          <button type="button" className="btn popup-close" data-sfx="page" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        {children}
      </section>
    </dialog>
  );
}

/** A button that opens its children in a pop-up. */
export function Popup({
  label,
  title,
  className = "btn",
  closeOnSubmit,
  children,
}: {
  label: ReactNode;
  title: string;
  /** The button's classes: "menu-item" inside a menu, "btn" elsewhere. */
  className?: string;
  /** Close as soon as a form inside is sent: for forms whose result shows on the page behind. */
  closeOnSubmit?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} data-sfx="confirm" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <PopupWindow dialog={dialog} title={title} closeOnSubmit={closeOnSubmit}>
        {children}
      </PopupWindow>
    </>
  );
}

/**
 * A pop-up that is open because of where the page is, for example /accounts?move=1.
 * Closing it goes to `closeHref`. A form inside that sends you elsewhere just takes it away.
 */
export function RoutePopup({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  /** False while the pop-up is being taken off the page, when closing must not navigate. */
  const shown = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    shown.current = true;
    if (element && !element.open) element.showModal();
    // Leaving the page takes the dialog with it. It is not closed by hand here: its close
    // event arrives late, and in development React mounts twice, so it would look like a real close.
    return () => {
      shown.current = false;
    };
  }, []);

  return (
    <PopupWindow dialog={dialog} title={title} onClose={() => shown.current && router.replace(closeHref, { scroll: false })}>
      {children}
    </PopupWindow>
  );
}
