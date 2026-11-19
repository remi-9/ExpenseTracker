// Pixel-style charts, drawn with plain HTML and SVG (no chart library).
// Colours are the --c1…--c8 and --heat tokens in globals.css; both sets were
// checked for colour-blind separation in light and dark.
import type { CSSProperties, ReactNode } from "react";
import { money } from "@/lib/format";

const tone = (color: string) => ({ "--tone": color }) as CSSProperties;

// ---- Where the month's pay went: one bar split three ways -------------------------

export function PaySplit({ income, expense, saving }: { income: number; expense: number; saving: number }) {
  const left = Math.max(0, income - expense - saving);
  const total = Math.max(income, expense + saving) || 1;
  const parts = [
    { label: "Spent", value: expense, color: "var(--c8)" },
    { label: "Saved", value: saving, color: "var(--c7)" },
    { label: "Left", value: left, color: "var(--c3)" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="split" role="img" aria-label={parts.map((p) => `${p.label} ${money(p.value)}`).join(", ")}>
        {parts.map(
          (p) =>
            p.value > 0 && (
              <span
                key={p.label}
                title={`${p.label}: ${money(p.value)}`}
                style={{ flexGrow: p.value / total, ...tone(p.color) }}
              />
            ),
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.label} className="flex flex-col">
            <span className="legend text-muted" style={tone(p.color)}>
              {p.label}
            </span>
            <span className="font-display text-[0.65rem] leading-loose sm:text-xs">{money(p.value)}</span>
            <span className="text-muted">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- A stepped line, like an 8-bit graph ---------------------------------------------

export function StepLine({
  points,
  label,
}: {
  points: { label: string; value: number }[];
  label: string;
}) {
  const W = 300;
  const H = 96;
  const PAD = 10;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
  // Horizontal run, then a vertical jump to the next value.
  const d = points.map((p, i) => (i === 0 ? `M${x(0)},${y(p.value)}` : `H${x(i)}V${y(p.value)}`)).join("");
  const last = points.length - 1;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label} shapeRendering="crispEdges">
        {min < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--track)" strokeWidth={2} />}
        <path d={`${d}V${H}H${x(0)}Z`} fill="var(--c1)" opacity={0.18} />
        <path d={d} fill="none" stroke="var(--c1)" strokeWidth={4} />
        {points.map((p, i) => (
          <rect
            key={p.label}
            x={x(i) - 5}
            y={y(p.value) - 5}
            width={10}
            height={10}
            fill={i === last ? "var(--ink)" : "var(--c1)"}
            stroke="var(--panel)"
            strokeWidth={2}
          >
            <title>{`${p.label}: ${money(p.value)}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="flex justify-between text-muted">
        <span>
          {points[0].label} · {money(points[0].value)}
        </span>
        <span>
          {points[last].label} · {money(points[last].value)}
        </span>
      </figcaption>
    </figure>
  );
}

// ---- Waffle: 100 squares, each one percent of the month's spending -----------------

export type Slice = { id: string; name: string; value: number; color: string; icon?: ReactNode };

export function Waffle({ slices, total }: { slices: Slice[]; total: number }) {
  // Largest-remainder rounding so the squares always add up to exactly 100.
  const exact = slices.map((s) => (s.value / total) * 100);
  const cells = exact.map(Math.floor);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; cells.reduce((a, b) => a + b, 0) < 100 && k < order.length; k++) cells[order[k][1]]++;

  return (
    <div className="grid items-start gap-4 sm:grid-cols-[auto_1fr]">
      <div className="waffle" role="img" aria-label="Share of spending by category. The list beside it has the figures.">
        {slices.flatMap((s, i) =>
          Array.from({ length: cells[i] }, (_, n) => (
            <span key={`${s.id}-${n}`} style={tone(s.color)} title={`${s.name}: ${money(s.value)} (${Math.round(exact[i])}%)`} />
          )),
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {slices.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-3">
            <span className="legend min-w-0 truncate" style={tone(s.color)}>
              {s.icon}
              {s.name}
            </span>
            <span className="shrink-0">
              {money(s.value)}
              <span className="text-muted"> · {Math.round(exact[i])}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Calendar: one square per day, darker the more was spent --------------------------

export function SpendCalendar({ month, byDay }: { month: string; byDay: Map<number, number> }) {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const peak = Math.max(1, ...byDay.values());
  const step = (value: number) => (value <= 0 ? 0 : Math.min(4, Math.ceil((value / peak) * 4)));

  return (
    <div className="flex flex-col gap-2">
      <div className="calendar" role="img" aria-label="Spending on each day of the month">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-center text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const spent = byDay.get(i + 1) ?? 0;
          return (
            <span key={i} className={`day heat-${step(spent)}`} title={`Day ${i + 1}: ${spent ? money(spent) : "nothing spent"}`}>
              {i + 1}
            </span>
          );
        })}
      </div>
      <p className="flex items-center gap-1 text-muted">
        Less
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className={`day heat-${n} size-4!`} />
        ))}
        More · busiest day {money(byDay.size ? peak : 0)}
      </p>
    </div>
  );
}
