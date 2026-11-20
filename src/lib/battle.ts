// The battle rules: one pure function per step, no React and no Math.random.
// A battle is a plain object that carries its own seed, so it can be saved after
// every turn and picked up again exactly where it was. Each step returns the new
// state plus "frames": the messages, sounds and sprite effects to play in order.
import {
  ABILITIES,
  ITEMS,
  STAT_NAME,
  effectiveness,
  type Battler,
  type EncounterKind,
  type Move,
  type Stat,
  type Status,
} from "./fight";
import { draw } from "./rng";

export type Side = "me" | "foe";

export type BattleState = {
  kind: EncounterKind;
  party: Battler[];
  foes: Battler[];
  /** Index of the Pokémon in play on each side. */
  me: number;
  foe: number;
  potions: number;
  seed: number;
  /** "forced": yours fainted and you must send in another. The rest after "choose" are endings. */
  phase: "choose" | "forced" | "won" | "lost" | "caught" | "fled";
  /** A thrown ball is on screen in place of the wild Pokémon. */
  ball: boolean;
  rivalName?: string;
  /** The opponent switched last turn, so it will not switch again straight away. */
  foeSwitched?: boolean;
};

/** One beat of a turn as the screen should show it. */
export type Frame = {
  text?: string;
  sfx?: string;
  fx?: [Side, string];
  /** How long to hold it, before the text-speed option is applied. */
  ms: number;
  view: BattleState;
};

export type Action =
  | { type: "move"; index: number }
  | { type: "switch"; to: number }
  | { type: "potion" }
  | { type: "ball" }
  | { type: "run" };

export const isOver = (s: BattleState) => s.phase !== "choose" && s.phase !== "forced";

const stageMult = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
const PINCH: Record<string, number> = { blaze: 10, torrent: 11, overgrow: 12, swarm: 7 };
/** Types that cannot be given each status. */
const IMMUNE: Record<Status, number[]> = { burn: [10], poison: [4, 9], paralysis: [13], sleep: [] };
const STATUS_TEXT: Record<Status, string> = {
  burn: "was burned",
  poison: "was poisoned",
  paralysis: "is paralysed. It may be unable to move",
  sleep: "fell asleep",
};

export const speedOf = (b: Battler) => b.spe * stageMult(b.stages.spe) * (b.status === "paralysis" ? 0.5 : 1);

/** How well a move does against a defender, counting abilities that change it. */
export const matchup = (move: Move, defender: Battler, chart: number[][]) =>
  move.type === 5 && defender.ability === "levitate" ? 0 : effectiveness(move.type, defender, chart);

/** Damage of one hit, given the two random parts (whether it is critical, and a roll from 0.85 to 1). */
export function calcDamage(
  attacker: Battler,
  defender: Battler,
  move: Move,
  chart: number[][],
  { crit, roll }: { crit: boolean; roll: number },
): { damage: number; eff: number } {
  const eff = matchup(move, defender, chart);
  if (eff === 0 || move.power <= 0) return { damage: 0, eff };

  const hurt = !!attacker.status;
  let atk = attacker.atk * stageMult(attacker.stages.atk);
  if (attacker.ability === "guts" && hurt) atk *= 1.5;
  else if (attacker.status === "burn") atk *= 0.5;
  const def = Math.max(1, defender.def * stageMult(defender.stages.def));

  let power = move.power;
  if (attacker.ability === "technician" && power <= 60) power *= 1.5;
  if (PINCH[attacker.ability] === move.type && attacker.hp <= attacker.maxHp / 3) power *= 1.5;

  const base = Math.floor((((2 * attacker.level) / 5 + 2) * power * atk) / def / 50) + 2;
  let mult = eff * roll * (crit ? 1.5 : 1);
  if (attacker.types.includes(move.type)) mult *= attacker.ability === "adaptability" ? 2 : 1.5;
  if (attacker.item === "muscle-band") mult *= 1.15;
  if (attacker.item === "life-orb") mult *= 1.3;
  if (attacker.item === "expert-belt" && eff > 1) mult *= 1.25;
  if (defender.ability === "thick-fat" && (move.type === 10 || move.type === 15)) mult *= 0.5;
  if (defender.ability === "multiscale" && defender.hp >= defender.maxHp) mult *= 0.5;
  return { damage: Math.max(1, Math.floor(base * mult)), eff };
}

/** Chance that a thrown ball holds: better the lower the target's HP, and a little better if it is asleep or paralysed. */
export const catchChance = (target: Battler) =>
  Math.min(0.95, 0.2 + 0.75 * (1 - target.hp / target.maxHp) + (target.status === "sleep" || target.status === "paralysis" ? 0.1 : 0));

/** How much a move is worth to the opponent choosing it. */
function worth(move: Move, user: Battler, target: Battler, chart: number[][]): number {
  if (move.power > 0) {
    const stab = user.types.includes(move.type) ? 1.5 : 1;
    return move.power * (Math.min(100, move.accuracy) / 100) * matchup(move, target, chart) * stab;
  }
  if (move.status) {
    const blocked = !!target.status || IMMUNE[move.status.kind].some((t) => target.types.includes(t));
    return blocked ? 0 : 55 * (Math.min(100, move.accuracy) / 100);
  }
  if (move.stage) {
    const { who, stats, by } = move.stage;
    const now = (who === "self" ? user : target).stages[stats[0]];
    const room = by > 0 ? now < 2 : now > -2;
    return room && user.hp > user.maxHp / 2 ? 50 : 0;
  }
  return 0;
}

// ---- The engine --------------------------------------------------------------------

/** Everything a turn needs: the draft state being changed and the frames collected so far. */
type Ctx = { s: BattleState; frames: Frame[]; chart: number[][] };

const active = (c: Ctx, side: Side) => (side === "me" ? c.s.party[c.s.me] : c.s.foes[c.s.foe]);
const other = (side: Side): Side => (side === "me" ? "foe" : "me");
const label = (c: Ctx, side: Side) => {
  const b = active(c, side);
  return side === "me" ? b.name : `${c.s.kind === "wild" ? "Wild" : "Foe"} ${b.name}`;
};
const chance = (c: Ctx, p: number) => draw(c.s) < p;

function frame(c: Ctx, f: Omit<Frame, "view" | "ms"> & { ms?: number }) {
  c.frames.push({ ms: 900, ...f, view: structuredClone(c.s) });
}
const say = (c: Ctx, text: string, ms = 900, sfx?: string) => frame(c, { text, ms, sfx });

function heal(c: Ctx, side: Side, amount: number) {
  const b = active(c, side);
  b.hp = Math.min(b.maxHp, b.hp + Math.max(1, Math.floor(amount)));
}

/** Change stat stages. `by` is who caused it, so Clear Body can refuse the foe's drops. */
function shift(c: Ctx, side: Side, stats: Stat[], by: number, cause: Side) {
  const b = active(c, side);
  if (b.hp <= 0) return;
  if (by < 0 && cause !== side && b.ability === "clear-body") {
    return say(c, `${label(c, side)}'s Clear Body keeps its stats up!`, 800);
  }
  for (const stat of stats) {
    const next = Math.max(-6, Math.min(6, b.stages[stat] + by));
    if (next === b.stages[stat]) {
      say(c, `${label(c, side)}'s ${STAT_NAME[stat]} won't go any ${by > 0 ? "higher" : "lower"}!`, 700);
      continue;
    }
    b.stages[stat] = next;
    const how = Math.abs(by) > 1 ? " sharply" : "";
    say(c, `${label(c, side)}'s ${STAT_NAME[stat]} ${by > 0 ? "rose" : "fell"}${how}!`, 750, by > 0 ? "heal" : "weak");
  }
}

/** Give a status condition. Returns whether it took hold. */
function afflict(c: Ctx, side: Side, kind: Status, quiet = false): boolean {
  const b = active(c, side);
  if (b.hp <= 0) return false;
  if (b.status || IMMUNE[kind].some((t) => b.types.includes(t))) {
    if (!quiet) say(c, `It doesn't affect ${label(c, side)}…`, 800);
    return false;
  }
  b.status = kind;
  if (kind === "sleep") b.sleep = 1 + Math.floor(draw(c.s) * 3);
  say(c, `${label(c, side)} ${STATUS_TEXT[kind]}!`, 850, "weak");
  if (b.item === "lum-berry") {
    b.item = undefined;
    b.status = undefined;
    b.sleep = undefined;
    say(c, `${label(c, side)}'s Lum Berry cured it!`, 800, "heal");
    return false;
  }
  if (b.ability === "synchronize" && kind !== "sleep") afflict(c, other(side), kind, true);
  return true;
}

/** Take HP from a Pokémon outside an attack (poison, recoil, a helmet). Magic Guard ignores all of it. */
function chip(c: Ctx, side: Side, amount: number, text: string) {
  const b = active(c, side);
  if (b.hp <= 0 || b.ability === "magic-guard") return;
  b.hp = Math.max(0, b.hp - Math.max(1, Math.floor(amount)));
  frame(c, { text, fx: [side, "hit"], ms: 700 });
}

/** What happens when a Pokémon comes out. */
function enter(c: Ctx, side: Side) {
  const b = active(c, side);
  if (b.ability === "intimidate" && active(c, other(side)).hp > 0) {
    say(c, `${label(c, side)}'s Intimidate!`, 700);
    shift(c, other(side), ["atk"], -1, side);
  }
}

/** What happens when a Pokémon goes back: stages reset, and some abilities mend it. */
function leave(b: Battler) {
  b.stages = { atk: 0, def: 0, spe: 0 };
  if (b.hp <= 0) return;
  if (b.ability === "natural-cure") {
    b.status = undefined;
    b.sleep = undefined;
  }
  if (b.ability === "regenerator") b.hp = Math.min(b.maxHp, b.hp + Math.floor(b.maxHp / 3));
}

/** One side uses a move. */
function perform(c: Ctx, side: Side, move: Move) {
  const user = active(c, side);
  const target = active(c, other(side));
  const who = label(c, side);
  if (user.hp <= 0) return;

  if (user.status === "sleep") {
    if ((user.sleep ?? 0) > 0) {
      user.sleep = user.sleep! - 1;
      return say(c, `${who} is fast asleep.`, 800);
    }
    user.status = undefined;
    user.sleep = undefined;
    say(c, `${who} woke up!`, 700);
  }
  if (user.status === "paralysis" && chance(c, 0.25)) return say(c, `${who} is paralysed! It can't move!`, 850);

  say(c, `${who} used ${move.name}!`, 650);

  if (move.heal != null) {
    if (user.heals <= 0) return say(c, "But it failed!", 700);
    user.heals--;
    user.hp = Math.min(user.maxHp, user.hp + Math.ceil(user.maxHp * move.heal));
    return frame(c, { text: `${who} regained health!`, sfx: "heal", fx: [side, "heal"], ms: 800 });
  }

  const accuracy = move.accuracy * (user.ability === "compound-eyes" ? 1.3 : 1);
  if (accuracy < 100 && draw(c.s) * 100 >= accuracy) return say(c, `${who}'s attack missed!`, 900, "miss");

  if (move.power > 0) {
    const critChance = (user.item === "scope-lens" ? 1 / 4 : 1 / 16) * (move.highCrit ? 2 : 1);
    const crit = chance(c, critChance);
    const roll = 0.85 + draw(c.s) * 0.15;
    const hit = calcDamage(user, target, move, c.chart, { crit, roll });
    frame(c, { fx: [side, "lunge"], ms: 180 });
    if (hit.eff === 0) return say(c, `It doesn't affect ${label(c, other(side))}…`);

    // A knockout blow from full HP can be survived once, by ability or by item.
    let damage = hit.damage;
    const full = target.hp >= target.maxHp;
    let hungOn = "";
    if (damage >= target.hp && full && target.maxHp > 1) {
      if (target.ability === "sturdy") hungOn = "Sturdy";
      else if (target.item === "focus-sash") {
        hungOn = "Focus Sash";
        target.item = undefined;
      }
      if (hungOn) damage = target.hp - 1;
    }
    damage = Math.min(damage, target.hp);
    target.hp -= damage;
    frame(c, { fx: [other(side), "hit"], sfx: hit.eff > 1 ? "super" : hit.eff < 1 ? "weak" : "strike", ms: 550 });
    if (crit) say(c, "A critical hit!", 700, "crit");
    if (hit.eff > 1) say(c, "It's super effective!", 750);
    if (hit.eff < 1) say(c, "It's not very effective…", 750);
    if (hungOn) say(c, `${label(c, other(side))} hung on with its ${hungOn}!`, 800);

    // What the attacker gets back, and what striking costs it.
    if (move.drain && user.hp < user.maxHp) heal(c, side, damage * move.drain);
    if (user.item === "shell-bell" && user.hp < user.maxHp) heal(c, side, damage / 8);
    if (move.recoil) chip(c, side, damage * move.recoil, `${who} was hurt by the recoil!`);
    if (user.item === "life-orb") chip(c, side, user.maxHp / 10, `${who} lost some HP to its Life Orb.`);
    if (target.ability === "rough-skin") chip(c, side, user.maxHp / 8, `${who} was hurt by Rough Skin!`);
    if (target.item === "rocky-helmet") chip(c, side, user.maxHp / 8, `${who} was hurt by the Rocky Helmet!`);
    const touch = { static: "paralysis", "flame-body": "burn", "poison-point": "poison" }[target.ability as string];
    if (touch && user.hp > 0 && chance(c, 0.3)) afflict(c, side, touch as Status, true);

    if (target.hp > 0 && target.item === "sitrus-berry" && target.hp <= target.maxHp / 2) {
      target.item = undefined;
      target.hp = Math.min(target.maxHp, target.hp + Math.floor(target.maxHp / 4));
      frame(c, { text: `${label(c, other(side))} ate its Sitrus Berry!`, sfx: "heal", fx: [other(side), "heal"], ms: 750 });
    }
  }

  if (move.status && target.hp > 0 && chance(c, move.status.chance / 100)) {
    afflict(c, other(side), move.status.kind, move.power > 0);
  }
  if (move.stage && chance(c, (move.stage.chance ?? 100) / 100)) {
    const on = move.stage.who === "self" ? side : other(side);
    shift(c, on, move.stage.stats, move.stage.by, side);
  }
}

/** Deal with faints. Returns true if someone fainted, which ends the turn. */
function settle(c: Ctx): boolean {
  const { s } = c;
  const mine = active(c, "me");
  const theirs = active(c, "foe");
  let fainted = false;

  if (theirs.hp <= 0) {
    fainted = true;
    frame(c, { text: `${label(c, "foe")} fainted!`, sfx: "faint", fx: ["foe", "faint"], ms: 1000 });
    if (mine.hp > 0) {
      mine.kos++;
      if (mine.ability === "moxie") shift(c, "me", ["atk"], 1, "me");
    }
    if (s.foe < s.foes.length - 1) {
      s.foe++;
      s.foeSwitched = false;
      frame(c, { text: `${s.rivalName} sent out ${active(c, "foe").name}!`, sfx: "sendOut", fx: ["foe", "enter"], ms: 1000 });
      if (mine.hp > 0) enter(c, "foe");
    } else {
      s.phase = "won";
      say(c, s.kind === "wild" ? "You won the battle!" : `You defeated ${s.rivalName}!`, 1500, "victory");
      return true;
    }
  }

  if (mine.hp <= 0) {
    fainted = true;
    frame(c, { text: `${mine.name} fainted!`, sfx: "faint", fx: ["me", "faint"], ms: 1000 });
    if (s.party.some((p) => p.hp > 0)) {
      s.phase = "forced";
      say(c, "Choose who goes next.", 0);
    } else {
      s.phase = "lost";
      say(c, "Your whole team has fainted…", 1500, "defeat");
    }
  }
  return fainted;
}

/** Poison, burns and the slow heals that happen once both sides have moved. */
function endOfTurn(c: Ctx) {
  for (const side of ["me", "foe"] as Side[]) {
    const b = active(c, side);
    if (b.hp <= 0) continue;
    if (b.status === "poison") chip(c, side, b.maxHp / 8, `${label(c, side)} is hurt by poison!`);
    if (b.status === "burn") chip(c, side, b.maxHp / 16, `${label(c, side)} is hurt by its burn!`);
    if (b.hp <= 0 || b.hp >= b.maxHp) continue;
    if (b.item === "leftovers") {
      heal(c, side, b.maxHp / 16);
      say(c, `${label(c, side)} ate some Leftovers.`, 600);
    }
    if (b.ability === "ice-body") heal(c, side, b.maxHp / 16);
  }
}

/** What the opponent does this turn: a move, or for the smarter ones sometimes a switch. */
function foeChoice(c: Ctx): { move: Move } | { to: number } {
  const { s, chart } = c;
  const foe = active(c, "foe");
  const target = active(c, "me");
  const smart = s.kind === "elite" || s.kind === "boss";

  const recover = foe.moves.find((m) => m.heal);
  if (recover && foe.heals > 0 && foe.hp < foe.maxHp * 0.35 && chance(c, 0.5)) return { move: recover };

  const options = foe.moves.filter((m) => m.heal == null);
  if (options.length === 0) return { move: foe.moves[0] };
  const best = (b: Battler) => Math.max(...b.moves.map((m) => (m.power > 0 ? matchup(m, target, chart) : 0)));

  // A leader pulls out a Pokémon that cannot hurt yours for one that can.
  if (smart && !s.foeSwitched && best(foe) < 1) {
    const to = s.foes.findIndex((b, i) => i !== s.foe && b.hp > 0 && best(b) > 1);
    if (to >= 0 && chance(c, 0.6)) return { to };
  }
  if (!smart && chance(c, 0.35)) return { move: options[Math.floor(draw(s) * options.length)] };
  return { move: options.reduce((a, b) => (worth(b, foe, target, chart) > worth(a, foe, target, chart) ? b : a)) };
}

/** Start a battle. The opening frames cover anything that happens as both sides come out. */
export function openBattle(
  setup: Pick<BattleState, "kind" | "party" | "foes" | "potions" | "seed" | "rivalName">,
  chart: number[][],
): { state: BattleState; frames: Frame[] } {
  const fresh = (b: Battler): Battler => ({ ...b, heals: 2, stages: { atk: 0, def: 0, spe: 0 } });
  const s: BattleState = {
    ...structuredClone(setup),
    party: setup.party.map(fresh),
    foes: setup.foes.map(fresh),
    me: Math.max(0, setup.party.findIndex((p) => p.hp > 0)),
    foe: 0,
    phase: "choose",
    ball: false,
  };
  const c: Ctx = { s, frames: [], chart };
  const first = s.foes[0];
  frame(c, {
    text: s.kind === "wild" ? `A wild ${first.name} appeared!` : `${s.rivalName} wants to battle!`,
    sfx: s.kind === "boss" ? "boss" : "appear",
    ms: 1100,
  });
  // The faster one's entry ability goes first.
  const order: Side[] = speedOf(active(c, "me")) >= speedOf(active(c, "foe")) ? ["me", "foe"] : ["foe", "me"];
  for (const side of order) enter(c, side);
  return { state: s, frames: c.frames };
}

/** Play one turn. Returns the same state untouched if the action is not allowed right now. */
export function takeTurn(state: BattleState, action: Action, chart: number[][]): { state: BattleState; frames: Frame[] } {
  if (isOver(state)) return { state, frames: [] };
  const c: Ctx = { s: structuredClone(state), frames: [], chart };
  const { s } = c;
  const done = () => ({ state: s, frames: c.frames });
  const wild = s.kind === "wild";

  // Replacing a fainted Pokémon is the only thing allowed, and it costs no turn.
  if (s.phase === "forced") {
    if (action.type !== "switch" || !s.party[action.to] || s.party[action.to].hp <= 0) return { state, frames: [] };
    s.me = action.to;
    s.phase = "choose";
    frame(c, { text: `Go! ${active(c, "me").name}!`, sfx: "sendOut", fx: ["me", "enter"], ms: 850 });
    enter(c, "me");
    return done();
  }

  let myMove: Move | null = null;
  switch (action.type) {
    case "run":
      if (!wild) {
        say(c, "There's no running from a trainer battle!");
        return done();
      }
      s.phase = "fled";
      say(c, "Got away safely!", 1200, "page");
      return done();

    case "ball": {
      if (!wild) {
        say(c, "You can't catch another trainer's Pokémon!");
        return done();
      }
      s.ball = true;
      say(c, "You threw a Poké Ball!", 1900, "throw");
      if (chance(c, catchChance(active(c, "foe")))) {
        s.phase = "caught";
        say(c, `Gotcha! ${active(c, "foe").name} was caught!`, 1500, "caught");
        return done();
      }
      s.ball = false;
      frame(c, { text: "Oh no! It broke free!", fx: ["foe", "enter"], ms: 900 });
      break;
    }

    case "potion": {
      const mine = active(c, "me");
      if (s.potions <= 0 || mine.hp >= mine.maxHp) return { state, frames: [] };
      s.potions--;
      mine.hp = Math.min(mine.maxHp, mine.hp + Math.ceil(mine.maxHp * 0.5));
      frame(c, { text: `${mine.name} was healed with a Potion.`, sfx: "heal", fx: ["me", "heal"], ms: 900 });
      break;
    }

    case "switch": {
      const next = s.party[action.to];
      if (!next || next.hp <= 0 || action.to === s.me) return { state, frames: [] };
      leave(active(c, "me"));
      s.me = action.to;
      frame(c, { text: `Go! ${next.name}!`, sfx: "sendOut", fx: ["me", "enter"], ms: 850 });
      enter(c, "me");
      break;
    }

    case "move": {
      myMove = active(c, "me").moves[action.index] ?? null;
      if (!myMove) return { state, frames: [] };
      break;
    }
  }

  // The opponent's answer. A switch happens before your move lands, like yours does before theirs.
  const reply = foeChoice(c);
  let foeMove: Move | null = null;
  if ("to" in reply) {
    leave(active(c, "foe"));
    s.foe = reply.to;
    s.foeSwitched = true;
    frame(c, { text: `${s.rivalName} sent out ${active(c, "foe").name}!`, sfx: "sendOut", fx: ["foe", "enter"], ms: 950 });
    enter(c, "foe");
  } else {
    foeMove = reply.move;
    s.foeSwitched = false;
  }

  // Who goes first: quick moves, then a Quick Claw, then speed.
  const mine = active(c, "me");
  const theirs = active(c, "foe");
  const jump = (b: Battler, m: Move | null) => (m?.quick ? 2 : 0) + (b.item === "quick-claw" && chance(c, 0.2) ? 1 : 0);
  const myJump = jump(mine, myMove);
  const foeJump = jump(theirs, foeMove);
  const first =
    myJump !== foeJump ? myJump > foeJump : speedOf(mine) === speedOf(theirs) ? chance(c, 0.5) : speedOf(mine) > speedOf(theirs);
  const order: Side[] = first ? ["me", "foe"] : ["foe", "me"];

  for (const side of order) {
    const move = side === "me" ? myMove : foeMove;
    if (!move) continue;
    perform(c, side, move);
    if (settle(c)) return done();
  }
  endOfTurn(c);
  settle(c);
  if (s.phase === "choose") say(c, `What will ${active(c, "me").name} do?`, 0);
  return done();
}

/** One line on a Pokémon's ability and held item, for the party and battle screens. */
export function traits(b: Battler): string {
  const parts = [ABILITIES[b.ability].name, b.item ? ITEMS[b.item].name : ""].filter(Boolean);
  return parts.join(", ");
}
