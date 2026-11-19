"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** A form's submit button that shows it is working, so a slow save never looks stuck. */
export function SubmitButton({
  children,
  pending: pendingLabel = "Saving…",
  className = "btn btn-primary",
  sfx,
}: {
  children: ReactNode;
  pending?: string;
  className?: string;
  /** Click sound, from SOUNDS in lib/sfx.ts. */
  sfx?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending} data-sfx={sfx}>
      {pending ? pendingLabel : children}
    </button>
  );
}
