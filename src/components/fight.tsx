/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs */
"use client";

// The battle screen. The rules are in lib/battle.ts: this file shows a battle, plays
// the frames each turn produces, and hands the player's choice back to whoever owns
// the battle (the expedition, which saves it after every turn).
import { useEffect, useRef, useState } from "react";
import { isOver, matchup, traits, type Action, type BattleState, type Frame, type Side } from "@/lib/battle";
import { backdrop, describeMove, STAT_NAME, STATUS_NAME, type Battler, type Stat } from "@/lib/fight";
import { textPace } from "@/lib/options";
import { sprite } from "@/lib/partners";
import { play, type SfxName } from "@/lib/sfx";
import { HpBar, PartyScreen, Type } from "./party";

type Menu = "main" | "moves" | "bag" | "team";
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function Fight({
  battle,
  intro,
  rival,
  bg,
  balls,
  chart,
  onTurn,
  onEnd,
}: {
  /** The battle as it stands. Already over if the page was reloaded after its last turn. */
  battle: BattleState;
  /** Frames to play first: the opening of a battle that has just begun. */
  intro?: Frame[];
  rival?: { sprite: string; name: string };
  bg: string;
  /** Poké Balls you own. A ball is only used up by a successful catch. */
  balls: number;
  chart: number[][];
  /** Apply the player's choice and return the frames to play. No frames means it was not allowed. */
  onTurn: (action: Action) => Frame[];
  /** Called once the last frame of a finished battle has played. */
  onEnd: (final: BattleState) => void;
}) {
  // What is on screen. It trails the real battle while a turn's frames play out.
  const [view, setView] = useState<BattleState>(intro?.[0]?.view ?? battle);
  const [text, setText] = useState(intro?.[0]?.text ?? `What will ${battle.party[battle.me].name} do?`);
  const [fx, setFx] = useState<Partial<Record<Side, string>>>({});
  const [busy, setBusy] = useState(!!intro?.length || isOver(battle));
  const [menu, setMenu] = useState<Menu>("main");
  const [peek, setPeek] = useState(0);

  // Stop frames that are still playing if the player leaves the page.
  const alive = useRef(true);
  const ended = useRef(false);
  const finish = useRef(onEnd);
  useEffect(() => {
    finish.current = onEnd;
  });

  async function run(frames: Frame[]) {
    setBusy(true);
    setMenu("main");
    const pace = textPace();
    let last: BattleState | null = null;
    for (const f of frames) {
      if (!alive.current) return;
      last = f.view;
      setView(f.view);
      if (f.text) setText(f.text);
      setFx(f.fx ? { [f.fx[0]]: f.fx[1] } : {});
      if (f.sfx) play(f.sfx as SfxName);
      if (f.ms > 0) await wait(f.ms * pace);
    }
    if (!alive.current) return;
    setFx({});
    if (last && isOver(last)) {
      if (!ended.current) {
        ended.current = true;
        finish.current(last);
      }
      return;
    }
    setBusy(false);
  }

  useEffect(() => {
    alive.current = true;
    // Deferred a tick, so a remount (as React does in development) plays the opening once.
    const timer = setTimeout(() => {
      if (intro?.length) run(intro);
      else if (isOver(battle) && !ended.current) {
        ended.current = true;
        finish.current(battle);
      }
    }, 0);
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
    // Runs once per battle: the parent gives each battle its own key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function act(action: Action) {
    if (busy) return;
    if (action.type === "ball" && balls <= 0) {
      play("error");
      setMenu("main");
      return setText("No Poké Balls left! Log an entry to earn one.");
    }
    const frames = onTurn(action);
    if (frames.length > 0) run(frames);
  }

  const wild = view.kind === "wild";
  const forced = view.phase === "forced" && !busy;
  const me = view.party[view.me];
  const foe = view.foes[view.foe];
  const peeked = me.moves[peek] ?? me.moves[0];
  const peekEff = matchup(peeked, foe, chart);
  const shown = busy ? "busy" : forced ? "forced" : menu;
  const spriteFx = (side: Side, who: Battler) => fx[side] ?? (who.hp <= 0 ? "faint" : "");

  return (
    <section className="box p-0!" aria-label="Battle">
      <div className="arena" style={{ backgroundImage: `url(${backdrop(bg)})` }}>
        <HpBox who={foe} side="foe" team={view.foes} />
        {rival && <img src={sprite.trainer(rival.sprite)} alt={rival.name} className="pixel sprite arena-rival" />}
        <div className={`arena-foe ${spriteFx("foe", foe)}`}>
          {view.ball ? (
            <img src={sprite.item("poke-ball")} alt="" width={30} height={30} className="pixel sprite wobble" />
          ) : (
            <img key={foe.dex} src={sprite.pokemon(foe.dex)} alt={foe.name} className="pixel sprite" />
          )}
        </div>
        <div className={`arena-me ${spriteFx("me", me)}`}>
          <img key={me.dex} src={sprite.back(me.dex)} alt={me.name} className="pixel sprite" />
        </div>
        <HpBox who={me} side="me" team={view.party} numbers />
      </div>

      {/* Message on the left, commands on the right, as in the games. */}
      <div className="battle-bottom">
        {shown === "moves" ? (
          <div className="window menu commands" data-menu>
            {me.moves.map((move, i) => (
              <button
                key={move.name}
                className="menu-item"
                data-sfx="none"
                disabled={move.heal != null ? me.heals <= 0 || me.hp >= me.maxHp : false}
                onMouseEnter={() => setPeek(i)}
                onFocus={() => setPeek(i)}
                onClick={() => act({ type: "move", index: i })}
              >
                {move.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="window battle-text" role="status">
            {shown === "bag" ? "Use which item?" : text}
          </p>
        )}

        {shown === "main" && (
          <div className="window menu commands" data-menu>
            <button className="menu-item" data-sfx="confirm" onClick={() => setMenu("moves")}>
              Fight
            </button>
            <button className="menu-item" data-sfx="confirm" onClick={() => setMenu("bag")}>
              Bag
            </button>
            <button className="menu-item" data-sfx="confirm" onClick={() => setMenu("team")}>
              Pokémon
            </button>
            <button className="menu-item" data-sfx="none" onClick={() => act({ type: "run" })}>
              Run
            </button>
          </div>
        )}

        {shown === "moves" && (
          <div className="window menu" data-menu>
            <p className="flex items-center justify-between gap-2 px-2">
              <span className="font-display text-[0.6rem] uppercase text-muted">Type</span>
              <Type id={peeked.type} />
            </p>
            <p className="px-2 leading-tight">
              {describeMove(peeked)}
              {peeked.heal != null && ` ${me.heals} left.`}
              {peeked.power > 0 && peekEff > 1 && <b className="block text-green">Super effective</b>}
              {peeked.power > 0 && peekEff < 1 && peekEff > 0 && <b className="block text-red">Not very effective</b>}
              {peeked.power > 0 && peekEff === 0 && <b className="block text-red">No effect</b>}
            </p>
            <button className="menu-item" data-sfx="page" onClick={() => setMenu("main")}>
              Cancel
            </button>
          </div>
        )}

        {shown === "bag" && (
          <div className="window menu" data-menu>
            <button
              className="menu-item"
              data-sfx="none"
              disabled={view.potions <= 0 || me.hp >= me.maxHp}
              onClick={() => act({ type: "potion" })}
            >
              <img src={sprite.item("potion")} alt="" width={24} height={24} className="pixel" />
              Potion <small>×{view.potions}</small>
            </button>
            <button className="menu-item" data-sfx="none" disabled={!wild} onClick={() => act({ type: "ball" })}>
              <img src={sprite.item("poke-ball")} alt="" width={24} height={24} className="pixel" />
              Poké Ball <small>×{balls}</small>
            </button>
            <button className="menu-item" data-sfx="page" onClick={() => setMenu("main")}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {(shown === "team" || shown === "forced") && (
        <div className="p-2">
          <PartyScreen party={view.party} active={view.me} onPick={(to) => act({ type: "switch", to })} />
          {shown === "team" && (
            <button className="window menu-item mt-2 w-auto!" data-sfx="page" onClick={() => setMenu("main")}>
              Cancel
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Stat stages that are not zero, as "Atk +2". */
function Stages({ who }: { who: Battler }) {
  const changed = (Object.keys(who.stages) as Stat[]).filter((stat) => who.stages[stat] !== 0);
  if (changed.length === 0) return null;
  return (
    <span className="stages">
      {changed.map((stat) => (
        <span key={stat} className={who.stages[stat] > 0 ? "text-green" : "text-red"}>
          {STAT_NAME[stat].slice(0, 3)} {who.stages[stat] > 0 ? "+" : "−"}
          {Math.abs(who.stages[stat])}
        </span>
      ))}
    </span>
  );
}

function HpBox({ who, side, team, numbers }: { who: Battler; side: Side; team: Battler[]; numbers?: boolean }) {
  return (
    <div className={`hpbox hpbox-${side}`}>
      <div className="flex items-baseline justify-between gap-2 font-display text-[0.6rem] leading-relaxed">
        <span className="truncate">{who.name}</span>
        <span className="shrink-0">
          {who.status && <span className={`status status-${who.status}`}>{STATUS_NAME[who.status]}</span>} Lv {who.level}
        </span>
      </div>
      <div className="hp-types flex items-center gap-1">
        {who.types.map((t) => (
          <Type key={t} id={t} />
        ))}
        {team.length > 1 && (
          <span className="ml-auto flex gap-0.5" aria-label={`${team.filter((p) => p.hp > 0).length} of ${team.length} able to battle`}>
            {team.map((p, i) => (
              <span key={i} className={`pip ${p.hp > 0 ? "" : "out"}`} />
            ))}
          </span>
        )}
      </div>
      <HpBar who={who} />
      <p className="hp-traits">
        <span className="truncate">{traits(who)}</span>
        <Stages who={who} />
        {numbers && (
          <span className="ml-auto shrink-0">
            {who.hp} / {who.maxHp}
          </span>
        )}
      </p>
    </div>
  );
}
