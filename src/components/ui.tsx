/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
// Small pixel-styled pieces shared by every page.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { dayLabel, money, monthLabel, shiftMonth } from "@/lib/format";
import { sprite } from "@/lib/partners";
import type { Transaction } from "@/lib/types";

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
        <header className="panel-title">
          <h2>{title}</h2>
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

const percent = (ratio: number) => Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100);

/** A pixel meter. It fills from `from` (default empty) to `ratio` when it appears. */
export function Bar({
  ratio,
  from = 0,
  tone = "green",
  slow,
  label,
}: {
  ratio: number;
  from?: number;
  tone?: Tone;
  /** Start late and move slowly, for the HP change after an entry. */
  slow?: boolean;
  label: string;
}) {
  const fill = percent(ratio);
  return (
    <div
      className={`bar ${slow ? "slow" : ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fill}
      style={{ "--fill": fill, "--from": percent(from), "--tone": `var(--${tone})` } as CSSProperties}
    >
      <span />
    </div>
  );
}

/** Previous and next links around the month name. They change ?m= on the current page. */
export function MonthPicker({ month, path }: { month: string; path: string }) {
  const href = (n: number) => `${path}?m=${shiftMonth(month, n)}`;
  return (
    <nav aria-label="Month" className="flex items-center justify-between gap-2">
      <Link href={href(-1)} className="btn" aria-label="Previous month" data-sfx="page">
        ◀
      </Link>
      <h1 className="font-display text-center text-sm leading-relaxed">{monthLabel(month)}</h1>
      <Link href={href(1)} className="btn" aria-label="Next month" data-sfx="page">
        ▶
      </Link>
    </nav>
  );
}

/** A category's icon: an item sprite ("nugget"), a Pokémon ("pkmn-25"), or the emoji as typed. */
export function CategoryIcon({ icon, size = 30 }: { icon: string; size?: number }) {
  if (!/^[a-z0-9-]+$/.test(icon)) return <span aria-hidden>{icon} </span>;
  const src = icon.startsWith("pkmn-") ? sprite.icon(Number(icon.slice(5))) : sprite.item(icon);
  return <img src={src} alt="" width={size} height={size} className="pixel icon" />;
}

/** A plain dialog box, used for error messages. Narration uses <Typewriter />. */
export function Dialog({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <p className={`box text-xl ${tone === "error" ? "text-red" : ""}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}

/** Entries in aligned columns: date, what, amount. `tossHref` adds a ✕ that asks before deleting. */
export function EntryList({
  entries,
  tossHref,
}: {
  entries: Transaction[];
  tossHref?: (entry: Transaction) => string;
}) {
  return (
    <ul className="entries">
      {entries.map((t) => (
        <li key={t.id}>
          <span className="text-muted">{dayLabel(t.occurred_on)}</span>
          <span className="truncate">
            <CategoryIcon icon={t.category.icon} />
            {t.category.name}
            {t.note && <span className="ml-3 text-muted">{t.note}</span>}
          </span>
          <span className={`amount ${t.category.kind === "income" ? "text-green" : ""}`}>
            {t.category.kind === "income" ? "+" : "−"}
            {money(t.amount)}
          </span>
          {tossHref ? (
            <Link href={tossHref(t)} className="px-1 text-red" aria-label={`Toss ${t.note ?? t.category.name}`}>
              ✕
            </Link>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ul>
  );
}
