/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
// The party screen: the lead Pokémon in a large panel on the left, the rest of
// the team stacked on the right, each with its level and HP bar.
import { TYPE_COLOR, TYPES, type Battler } from "@/lib/fight";
import { sprite } from "@/lib/partners";

export function Type({ id }: { id: number }) {
  return (
    <span className="type" style={{ background: TYPE_COLOR[id] }}>
      {TYPES[id]}
    </span>
  );
}

export function HpBar({ who }: { who: Battler }) {
  const ratio = Math.max(0, who.hp / who.maxHp);
  const tone = ratio > 0.5 ? "var(--green)" : ratio > 0.2 ? "var(--gold)" : "var(--red)";
  return (
    <span className="hpbar" role="meter" aria-label={`${who.name} HP`} aria-valuemin={0} aria-valuemax={who.maxHp} aria-valuenow={who.hp}>
      <span style={{ width: `${ratio * 100}%`, background: tone }} />
    </span>
  );
}

export function PartyScreen({
  party,
  active,
  onPick,
  note,
}: {
  party: Battler[];
  /** Index of the Pokémon currently in battle, if any. */
  active?: number;
  /** Makes the slots buttons (for switching). Fainted and active Pokémon can't be picked. */
  onPick?: (index: number) => void;
  /** Small label under each name, e.g. "Partner" for the lead. */
  note?: (index: number) => string | undefined;
}) {
  return (
    <div className="party" data-menu>
      {Array.from({ length: 6 }, (_, i) => {
        const p = party[i];
        if (!p) {
          return (
            <div key={i} className={`party-slot empty ${i === 0 ? "lead" : ""}`}>
              Empty
            </div>
          );
        }
        const state = p.hp <= 0 ? "out" : i === active ? "active" : "";
        const body = (
          <>
            {i === 0 ? (
              <img src={sprite.pokemon(p.dex)} alt="" className="pixel sprite-card shrink-0" />
            ) : (
              <img src={sprite.icon(p.dex)} alt="" width={40} height={30} className="pixel shrink-0" />
            )}
            <span className="party-info">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-[0.6rem] leading-relaxed uppercase">{p.name}</span>
                <span className="shrink-0">Lv{p.level}</span>
              </span>
              <HpBar who={p} />
              <span className="flex justify-between gap-2 leading-none">
                <span className="text-muted">{p.hp <= 0 ? "Fainted" : i === active ? "In battle" : (note?.(i) ?? "")}</span>
                <span>
                  {p.hp}/{p.maxHp}
                </span>
              </span>
            </span>
          </>
        );
        const className = `party-slot ${i === 0 ? "lead" : ""} ${state}`;
        return onPick ? (
          <button key={i} className={className} data-sfx="none" disabled={p.hp <= 0 || i === active} onClick={() => onPick(i)}>
            {body}
          </button>
        ) : (
          <div key={i} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
