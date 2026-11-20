// Home's account view: one account at a time (or all of them), with what it holds,
// what was spent and set aside from it this month, and two small graphs.
import Link from "next/link";
import type { ReactNode } from "react";
import { dayLabel, money } from "@/lib/format";
import type { AccountMonth } from "@/lib/money";
import { DayLine, SpendBars } from "./charts";
import { CategoryIcon } from "./ui";

/** How many categories "where it went" lists. */
const WENT = 3;

export type GlanceTab = { id: string; name: string; icon: string };

export function Glance({
  tabs,
  current,
  month,
  balance,
  opening,
  days,
  span,
  figures,
  went,
}: {
  tabs: GlanceTab[];
  /** The tab being shown: an account id, or "all". */
  current: string;
  month: string;
  /** What it holds at the end of the last day shown. */
  balance: number;
  /** What it held as the month began. */
  opening: number;
  days: { date: string; balance: number }[];
  /** Days in the month. */
  span: number;
  figures: AccountMonth;
  /** The month's spending by category, largest first, already named. */
  went: { id: string; name: string; icon: string; total: number }[];
}) {
  const all = current === "all";
  const moved = figures.movedIn - figures.movedOut;
  const moves: ReactNode[] = [`In ${money(figures.cameIn)}`];
  if (!all && (figures.movedIn > 0 || figures.movedOut > 0)) moves.push(`Moved ${moved < 0 ? "out" : "in"} ${money(Math.abs(moved))}`);
  const last = days[days.length - 1];

  return (
    <section className="box glance p-0!" aria-label="Account">
      <nav className="glance-tabs" aria-label="Accounts" data-menu>
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/?m=${month}&a=${tab.id}`}
            scroll={false}
            data-sfx="chip"
            aria-current={tab.id === current ? "true" : undefined}
            title={tab.name}
          >
            <CategoryIcon icon={tab.icon} size={tab.icon.startsWith("pkmn-") ? 40 : 30} />
            <span>{tab.name}</span>
          </Link>
        ))}
      </nav>

      <div className="glance-body">
        <div className="glance-top">
          <div>
            <p className="glance-label">Balance</p>
            <p className={`glance-big ${balance < 0 ? "text-red" : ""}`}>{money(balance)}</p>
          </div>
          <ul className="glance-figures">
            <li>
              <span className="legend text-muted" style={{ "--tone": "var(--c8)" } as React.CSSProperties}>
                Spent
              </span>
              <strong>{money(figures.spent)}</strong>
            </li>
            <li>
              <span className="legend text-muted" style={{ "--tone": "var(--c7)" } as React.CSSProperties}>
                Saved
              </span>
              <strong>{money(figures.saved)}</strong>
            </li>
          </ul>
        </div>

        <div className="glance-graphs">
          {last ? (
            <figure>
              <DayLine opening={opening} days={days} span={span} label="Balance at the end of each day of the month" />
              <figcaption className="text-muted">
                <span className="flex justify-between gap-2">
                  <span>Start {money(opening)}</span>
                  <span>{dayLabel(last.date)}</span>
                </span>
                {moves.join(" · ")}
              </figcaption>
            </figure>
          ) : (
            <p className="text-muted">This month has not begun.</p>
          )}
          {went.length > 0 ? (
            <SpendBars rows={went.slice(0, WENT).map((w) => ({ ...w, icon: <CategoryIcon icon={w.icon} size={24} /> }))} />
          ) : (
            <p className="text-muted">Nothing spent{all ? "" : " from here"} this month.</p>
          )}
        </div>
      </div>
    </section>
  );
}
