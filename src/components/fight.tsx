/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs */
"use client";

// One turn-based battle: your team against a wild Pokémon or a trainer's team.
// The rules live in lib/fight.ts; this file is the screen and the turn sequence.
import { useEffect, useRef, useState } from "react";
import { catchPokemon } from "@/lib/actions";
import {
  backdrop,
  catchChance,
  effectiveness,
  pickFoeMove,
  strike,
  TYPE_COLOR,
  TYPES,
  type Battler,
  type Boons,
  type Encounter,
  type Move,
} from "@/lib/fight";
import { sprite } from "@/lib/partners";
import { play } from "@/lib/sfx";

export type FightResult = {
  outcome: "win" | "lose" | "caught" | "fled";
  party: Battler[];
  potions: number;
  caught?: number;
};

type Action =
  | { type: "move"; move: Move }
  | { type: "switch"; to: number }
  | { type: "potion" }
  | { type: "ball" }
  | { type: "run" };

type Side = "me" | "foe";
type State = {
  party: Battler[];
  foes: Battler[];
  /** Index of the Pokémon in play on each side. */
  me: number;
  foe: number;
  potions: number;
  /** main: choose an action · forced: must switch after a faint · busy: a turn is playing out. */
  menu: "main" | "moves" | "team" | "forced" | "busy" | "done";
  text: string;
  /** Animation class currently on each sprite. */
  fx: Record<Side, string>;
  /** A thrown ball is on screen in place of the wild Pokémon. */
  ball: boolean;
};

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const LEFT = new Error("left the battle");

export function Fight({
  encounter: { kind, foes, rival },
  bg,
  party,
  potions,
  balls,
  boons,
  chart,
  onEnd,
}: {
  encounter: Encounter;
  bg: string;
  party: Battler[];
  potions: number;
  /** Poké Balls you own. A ball is only used up by a successful catch. */
  balls: number;
  boons: Boons;
  chart: number[][];
  onEnd: (result: FightResult) => void;
}) {
  const wild = kind === "wild";
  const foeLabel = (b: Battler) => `${wild ? "Wild" : "Foe"} ${b.name}`;

  const [st, setSt] = useState<State>(() => ({
    party: party.map((p) => ({ ...p, heals: 2 })),
    foes: structuredClone(foes),
    me: Math.max(0, party.findIndex((p) => p.hp > 0)),
    foe: 0,
    potions,
    menu: "main",
    text: wild ? `A wild ${foes[0].name} appeared!` : `${rival?.name} wants to battle!`,
    fx: { me: "enter", foe: "enter" },
    ball: false,
  }));

  // Stop a turn that is still playing out if the player leaves the page.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    play(kind === "boss" ? "boss" : "appear");
    return () => {
      alive.current = false;
    };
  }, [kind]);

  async function turn(action: Action) {
    if (st.menu === "busy" || st.menu === "done") return;
    const wasForced = st.menu === "forced";

    // Work on a copy and publish it after every step, so the screen follows along.
    const s: State = structuredClone(st);
    s.menu = "busy";
    const show = () => setSt(structuredClone(s));
    const pause = async (ms: number) => {
      await wait(ms);
      if (!alive.current) throw LEFT;
    };
    const say = async (text: string, ms = 950) => {
      s.text = text;
      show();
      await pause(ms);
    };
    const flash = async (side: Side, fx: string, ms: number) => {
      s.fx[side] = fx;
      show();
      await pause(ms);
      s.fx[side] = "";
    };
    const mine = () => s.party[s.me];
    const theirs = () => s.foes[s.foe];
    const backToMenu = () => {
      s.menu = "main";
      s.text = `What will ${mine().name} do?`;
      show();
    };
    const finish = async (outcome: FightResult["outcome"], text: string, sound?: Parameters<typeof play>[0]) => {
      if (sound) play(sound);
      s.menu = "done";
      await say(text, 1500);
      onEnd({ outcome, party: s.party, potions: s.potions, caught: outcome === "caught" ? theirs().dex : undefined });
    };

    const perform = async (side: Side, move: Move) => {
      const [attacker, defender, other]: [Battler, Battler, Side] =
        side === "me" ? [mine(), theirs(), "foe"] : [theirs(), mine(), "me"];
      const who = side === "me" ? attacker.name : foeLabel(attacker);
      await say(`${who} used ${move.name}!`, 650);

      if (move.heal) {
        attacker.heals--;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.ceil(attacker.maxHp * move.heal));
        play("heal");
        await flash(side, "heal", 500);
        return say(`${who} regained health!`, 800);
      }

      const perks = side === "me" ? { critChance: boons["scope-lens"] ? 0.25 : undefined, expert: !!boons["expert-belt"] } : {};
      const hit = strike(attacker, defender, move, chart, perks);
      if (hit.missed) {
        play("miss");
        return say(`${who}'s attack missed!`);
      }
      await flash(side, "lunge", 180);
      if (hit.eff === 0) return say(`It doesn't affect ${defender.name}…`);

      play(hit.eff > 1 ? "super" : hit.eff < 1 ? "weak" : "strike");
      defender.hp = Math.max(0, defender.hp - hit.damage);
      await flash(other, "hit", 550);
      if (hit.crit) {
        play("crit");
        await say("A critical hit!", 700);
      }
      if (hit.eff > 1) await say("It's super effective!", 750);
      if (hit.eff < 1) await say("It's not very effective…", 750);
      if (side === "me" && boons["shell-bell"]) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.ceil(hit.damage * 0.2 * boons["shell-bell"]));
      }
    };

    /** Handles a faint on either side. True means this turn is over. */
    const settle = async (): Promise<boolean> => {
      if (theirs().hp <= 0) {
        play("faint");
        s.fx.foe = "faint";
        await say(`${foeLabel(theirs())} fainted!`, 1000);
        if (s.foe < s.foes.length - 1) {
          s.foe++;
          s.fx.foe = "enter";
          play("sendOut");
          await say(`${rival?.name} sent out ${theirs().name}!`, 1000);
          s.fx.foe = "";
          backToMenu();
          return true;
        }
        await finish("win", wild ? "You won the battle!" : `You defeated ${rival?.name}!`, "victory");
        return true;
      }
      if (mine().hp <= 0) {
        play("faint");
        s.fx.me = "faint";
        await say(`${mine().name} fainted!`, 1000);
        if (s.party.some((p) => p.hp > 0)) {
          s.menu = "forced";
          s.text = "Choose who goes next.";
          show();
          return true;
        }
        await finish("lose", "Your whole team has fainted…", "defeat");
        return true;
      }
      return false;
    };

    try {
      let myMove: Move | null = null;

      if (action.type === "run") {
        if (!wild) {
          await say("There's no running from a trainer battle!");
          return backToMenu();
        }
        play("page");
        return await finish("fled", "Got away safely!");
      }

      if (action.type === "ball") {
        if (balls <= 0) {
          play("error");
          await say("No Poké Balls left! Log an entry to earn one.", 1400);
          return backToMenu();
        }
        play("throw");
        s.ball = true;
        await say("You threw a Poké Ball!", 1900);
        const held = Math.random() < catchChance(theirs());
        const result = held ? await catchPokemon(theirs().dex) : null;
        if (result?.ok) return await finish("caught", `Gotcha! ${theirs().name} was caught!`, "caught");
        s.ball = false;
        s.fx.foe = "enter";
        await say(result?.message ?? "Oh no! It broke free!");
        s.fx.foe = "";
      }

      if (action.type === "potion") {
        s.potions--;
        mine().hp = Math.min(mine().maxHp, mine().hp + Math.ceil(mine().maxHp * 0.5));
        play("heal");
        await flash("me", "heal", 450);
        await say(`${mine().name} was healed with a Potion.`);
      }

      if (action.type === "switch") {
        s.me = action.to;
        s.fx.me = "enter";
        play("sendOut");
        await say(`Go! ${mine().name}!`, 850);
        s.fx.me = "";
        if (wasForced) return backToMenu(); // replacing a fainted Pokémon doesn't cost a turn
      }

      if (action.type === "move") myMove = action.move;

      // Who goes first: quick moves, then speed. Anything but a move gives the foe a free hit.
      const foeMove = pickFoeMove(theirs(), mine(), chart);
      let order: Side[] = ["foe"];
      if (myMove) {
        const first =
          !!myMove.quick !== !!foeMove.quick
            ? !!myMove.quick
            : mine().spe === theirs().spe
              ? Math.random() < 0.5
              : mine().spe > theirs().spe;
        order = first ? ["me", "foe"] : ["foe", "me"];
      }
      for (const side of order) {
        await perform(side, side === "me" ? myMove! : foeMove);
        if (await settle()) return;
      }

      if (boons.leftovers && mine().hp < mine().maxHp) {
        mine().hp = Math.min(mine().maxHp, mine().hp + Math.ceil(mine().maxHp * 0.08 * boons.leftovers));
        await say(`${mine().name} ate some Leftovers.`, 600);
      }
      backToMenu();
    } catch (error) {
      if (error !== LEFT) throw error;
    }
  }

  const me = st.party[st.me];
  const foe = st.foes[st.foe];
  const open = (menu: State["menu"]) => setSt({ ...st, menu });

  return (
    <section className="box p-0!" aria-label="Battle">
      <div className="arena" style={{ backgroundImage: `url(${backdrop(bg)})` }}>
        <HpBox who={foe} side="foe" team={st.foes} />
        {rival && <img src={sprite.trainer(rival.sprite)} alt={rival.name} className="pixel sprite arena-rival" />}
        <div className={`arena-foe ${st.fx.foe}`}>
          {st.ball ? (
            <img src={sprite.item("poke-ball")} alt="" width={30} height={30} className="pixel sprite wobble" />
          ) : (
            <img key={foe.dex} src={sprite.pokemon(foe.dex)} alt={foe.name} className="pixel sprite" />
          )}
        </div>
        <div className={`arena-me ${st.fx.me}`}>
          <img key={me.dex} src={sprite.back(me.dex)} alt={me.name} className="pixel sprite" />
        </div>
        <HpBox who={me} side="me" team={st.party} numbers />
      </div>

      <p className="battle-text" role="status">
        {st.text}
      </p>

      <div className="p-2">
        {st.menu === "main" && (
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={() => open("moves")}>
              Fight
            </button>
            {wild && (
              <button className="btn py-3!" data-sfx="none" onClick={() => turn({ type: "ball" })}>
                <img src={sprite.item("poke-ball")} alt="" width={24} height={24} className="pixel" />
                Ball ×{balls}
              </button>
            )}
            <button
              className="btn py-3!"
              data-sfx="none"
              disabled={st.potions <= 0 || me.hp >= me.maxHp}
              onClick={() => turn({ type: "potion" })}
            >
              <img src={sprite.item("potion")} alt="" width={24} height={24} className="pixel" />
              Potion ×{st.potions}
            </button>
            <button className="btn py-3!" onClick={() => open("team")}>
              Team
            </button>
            {wild && (
              <button className="btn py-3!" data-sfx="none" onClick={() => turn({ type: "run" })}>
                Run
              </button>
            )}
          </div>
        )}

        {st.menu === "moves" && (
          <div className="grid grid-cols-2">
            {me.moves.map((move) => {
              const eff = effectiveness(move.type, foe, chart);
              const spent = move.heal ? me.heals <= 0 || me.hp >= me.maxHp : false;
              return (
                <button
                  key={move.name}
                  className="btn move"
                  data-sfx="none"
                  disabled={spent}
                  onClick={() => turn({ type: "move", move })}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    {move.name}
                    <Type id={move.type} />
                  </span>
                  <span className="font-body text-base text-muted">
                    {move.heal
                      ? `Heal 40% · ${me.heals} left`
                      : `Power ${move.power} · ${move.accuracy}%${move.quick ? " · goes first" : ""}`}
                    {!move.heal && eff > 1 && <b className="text-green"> · super effective</b>}
                    {!move.heal && eff < 1 && eff > 0 && <b className="text-red"> · weak</b>}
                    {!move.heal && eff === 0 && <b className="text-red"> · no effect</b>}
                  </span>
                </button>
              );
            })}
            <button className="btn col-span-2" data-sfx="page" onClick={() => open("main")}>
              Back
            </button>
          </div>
        )}

        {(st.menu === "team" || st.menu === "forced") && (
          <div className="grid sm:grid-cols-2">
            {st.party.map((p, i) => (
              <button
                key={`${p.dex}-${i}`}
                className="btn move"
                data-sfx="none"
                disabled={p.hp <= 0 || i === st.me}
                onClick={() => turn({ type: "switch", to: i })}
              >
                <span className="flex w-full items-center gap-2">
                  <img src={sprite.icon(p.dex)} alt="" width={40} height={30} className="pixel" />
                  {p.name}
                  <span className="ml-auto font-body text-base text-muted">
                    {p.hp <= 0 ? "Fainted" : i === st.me ? "In battle" : `Lv ${p.level}`}
                  </span>
                </span>
                <HpBar who={p} />
              </button>
            ))}
            {st.menu === "team" && (
              <button className="btn sm:col-span-2" data-sfx="page" onClick={() => open("main")}>
                Back
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Type({ id }: { id: number }) {
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

function HpBox({ who, side, team, numbers }: { who: Battler; side: Side; team: Battler[]; numbers?: boolean }) {
  return (
    <div className={`hpbox hpbox-${side}`}>
      <div className="flex items-baseline justify-between gap-2 font-display text-[0.6rem] leading-relaxed">
        <span className="truncate">{who.name}</span>
        <span className="shrink-0">Lv {who.level}</span>
      </div>
      <div className="flex items-center gap-1">
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
      {numbers && (
        <p className="text-right leading-none">
          {who.hp} / {who.maxHp}
        </p>
      )}
    </div>
  );
}
