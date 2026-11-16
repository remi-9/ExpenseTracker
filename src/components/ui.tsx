// Small pixel-styled pieces shared by every page.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { monthLabel, shiftMonth } from "@/lib/format";

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`box ${className}`}>
      {title && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xs leading-relaxed">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = "green" | "gold" | "red" | "blue";

/** Tone for a health-style bar: green when healthy, gold when low, red when critical. */
export const hpTone = (ratio: number): Tone => (ratio > 0.5 ? "green" : ratio > 0.2 ? "gold" : "red");

export function Bar({ ratio, tone = "green", label }: { ratio: number; tone?: Tone; label: string }) {
  const fill = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div
      className="bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fill}
      style={{ "--fill": fill, "--tone": `var(--${tone})` } as CSSProperties}
    >
      <span />
    </div>
  );
}

/** ◀ November 2026 ▶ — links that change the ?m= month on the current page. */
export function MonthPicker({ month, path }: { month: string; path: string }) {
  const href = (n: number) => `${path}?m=${shiftMonth(month, n)}`;
  return (
    <nav aria-label="Month" className="flex items-center justify-between gap-2">
      <Link href={href(-1)} className="btn" aria-label="Previous month">
        ◀
      </Link>
      <h1 className="font-display text-center text-sm leading-relaxed">{monthLabel(month)}</h1>
      <Link href={href(1)} className="btn" aria-label="Next month">
        ▶
      </Link>
    </nav>
  );
}

/** A dialog box, used for narration and for error messages. */
export function Dialog({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <p className={`box text-xl ${tone === "error" ? "text-red" : ""}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}
