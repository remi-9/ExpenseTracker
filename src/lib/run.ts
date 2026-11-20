// The roguelike run: a plain object and the pure steps that move it along.
// Nothing here touches React, the network or Math.random. The run carries its own
// seed, so it can be saved after every step and resumed exactly where it stopped.
import { isOver, openBattle, takeTurn, type Action, type BattleState, type Frame } from "./battle";
import {
  BOONS,
  FLOORS_PER_BIOME,
  ITEM_IDS,
  ITEMS,
  boostsFrom,
  buildEncounter,
  evolvedForm,
  isFinalFloor,
  learnable,
  makeBattler,
  type BattleData,
  type Battler,
  type BoonId,
  type Boons,
  type EncounterKind,
  type ItemId,
  type Move,
} from "./fight";
import { draw, drawInt, drawOne, drawSome, type Seeded } from "./rng";

// ---- The map -----------------------------------------------------------------------

export type NodeKind = "wild" | "trainer" | "elite" | "rest" | "shop" | "tutor" | "event" | "boss";
/** One stop on an area's map. `id` is its index in the list; `next` are the stops it leads to. */
export type MapNode = { id: number; row: number; col: number; kind: NodeKind; next: number[] };

export const NODE_INFO: Record<NodeKind, { title: string; text: string; icon: string }> = {
  wild: { title: "Tall grass", text: "A wild Pokémon. Weaken it and you can catch it.", icon: "poke-ball" },
  trainer: { title: "Trainer", text: "A tougher fight. Win to choose a reward.", icon: "vs-seeker" },
  elite: { title: "Ace trainer", text: "A hard fight against a full team. One reward is rare.", icon: "black-belt" },
  rest: { title: "Pokémon Center", text: "Heal the whole team by half and revive the fainted.", icon: "full-restore" },
  shop: { title: "Poké Mart", text: "Spend the coins you have won.", icon: "coin-case" },
  tutor: { title: "Move tutor", text: "Teach one of your Pokémon a new move.", icon: "tm-normal" },
  event: { title: "Something odd", text: "Nobody knows what is down this path.", icon: "dowsing-machine" },
  boss: { title: "Gym battle", text: "The area's leader. Win for a rare reward and a full heal.", icon: "master-ball" },
};

/** How often each kind of stop turns up in the middle rows. */
const MIDDLE: NodeKind[] = ["trainer", "trainer", "trainer", "wild", "wild", "event", "event", "elite", "shop", "tutor", "rest"];
const REPEATABLE: NodeKind[] = ["wild", "trainer"];

/** `count` kinds for one row, with nothing but grass and trainers appearing twice. */
function rowKinds(rng: Seeded, must: NodeKind[], pool: NodeKind[], count: number): NodeKind[] {
  const kinds = [...must];
  for (let tries = 0; kinds.length < count && tries < 50; tries++) {
    const kind = drawOne(rng, pool);
    if (REPEATABLE.includes(kind) || !kinds.includes(kind)) kinds.push(kind);
  }
  return drawSome(rng, kinds, kinds.length);
}

/**
 * One area: four rows of two or three stops, then the gym. Each stop leads to the
 * one or two nearest it in the next row, so the route you start on shapes what you can reach.
 */
export function buildArea(rng: Seeded): MapNode[] {
  const rows: NodeKind[][] = [1, 2, 3, 4].map((row) => {
    const width = 2 + drawInt(rng, 2);
    if (row === 1) return rowKinds(rng, ["wild"], ["trainer", "trainer", "event", "wild"], width);
    if (row === 4) return rowKinds(rng, ["rest"], ["trainer", "elite", "shop", "tutor"], width);
    return rowKinds(rng, [], MIDDLE, width);
  });
  rows.push(["boss"]);

  const nodes: MapNode[] = [];
  rows.forEach((kinds, r) => kinds.forEach((kind, col) => nodes.push({ id: nodes.length, row: r + 1, col, kind, next: [] })));
  const place = (col: number, width: number) => (width === 1 ? 0.5 : col / (width - 1));
  for (const node of nodes) {
    const here = rows[node.row - 1].length;
    const ahead = nodes.filter((n) => n.row === node.row + 1);
    node.next = ahead.filter((n) => Math.abs(place(node.col, here) - place(n.col, ahead.length)) <= 0.5).map((n) => n.id);
  }
  return nodes;
}

// ---- The run -----------------------------------------------------------------------

export type Reward =
  | { kind: "boon"; id: BoonId }
  | { kind: "item"; id: ItemId }
  /** Teach `move` to the team member at index `who`. */
  | { kind: "move"; move: Move; who: number };

export type ShopId = "potion" | "revive" | "rare-candy" | ItemId;
export type ShopItem = { id: ShopId; price: number; sold?: boolean };

export const EVENTS = {
  berries: {
    text: "A bush heavy with berries stands by the path.",
    choices: ["Look for one worth keeping", "Share them out now"],
  },
  stranger: {
    text: "A stranger opens a coat lined with odd items. “80 coins. No questions.”",
    choices: ["Pay 80 coins", "Walk on"],
  },
  shrine: {
    text: "An old shrine hums. It seems to want something in return.",
    choices: ["Offer a quarter of everyone's HP", "Leave a coin and rest a moment"],
  },
  school: {
    text: "A trainers' school has a free lesson running.",
    choices: ["Join the sparring", "Sell your notes afterwards"],
  },
} as const;
export type EventId = keyof typeof EVENTS;

export type Phase =
  | { name: "map" }
  | { name: "fight"; battle: BattleState; rival?: { sprite: string; name: string } }
  | { name: "reward"; note: string; options: Reward[] }
  /** Choosing who holds an item. `back` is the shop to return to, if it was bought. */
  | { name: "give"; item: ItemId; back?: ShopItem[] }
  /** Choosing which move to forget. */
  | { name: "teach"; move: Move; who: number }
  | { name: "tutor"; options: { move: Move; who: number }[] }
  | { name: "shop"; stock: ShopItem[] }
  | { name: "event"; id: EventId }
  | { name: "over" };

export type Run = {
  v: 3;
  /** Goes up with every change, so the newer of two saves can be told apart. */
  step: number;
  seed: number;
  /** The floor you are choosing a stop on, or playing. */
  floor: number;
  nodes: MapNode[];
  /** The stop last finished in this area, or null at its start. */
  at: number | null;
  /** The stop being played now. */
  node: number | null;
  /** Team level at the start, which the opposition scales from. */
  startLevel: number;
  /** Team level now: one more per battle won. */
  level: number;
  party: Battler[];
  potions: number;
  coins: number;
  boons: Boons;
  wins: number;
  caught: number[];
  /** Earned by paying bills on time: wins pay half again as many coins. */
  amulet: boolean;
  /** The type of the champion's team, set by the month's biggest spending category. */
  finalType: number | null;
  /** The champion has been beaten. */
  cleared: boolean;
  /** Lines about what just happened, shown on the next screen. */
  news: string[];
  phase: Phase;
};

/** What your budget and your past runs give a new run. */
export type RunSetup = {
  /** Your partner first, then your team. */
  partyDex: number[];
  level: number;
  potions: number;
  /** An overspent month: the team starts at 70% HP. */
  tired: boolean;
  /** Held items from badges, given to the team in order. */
  items: ItemId[];
  amulet: boolean;
  finalType: number | null;
  perks: PerkId[];
};

export type RunCtx = { data: BattleData; names: string[] };

const nameOf = (ctx: RunCtx, dex: number) => ctx.names[dex - 1] ?? `No. ${dex}`;
/** A copy to change, one step on, with the last screen's news cleared. */
const next = (run: Run): Run => ({ ...structuredClone(run), step: run.step + 1, news: [] });
const standing = (p: Battler) => p.hp > 0;
const healBy = (p: Battler, share: number): Battler =>
  standing(p) ? { ...p, hp: Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * share)) } : p;

/** Rebuild the team at the run's level and upgrades, keeping HP share, moves and items. */
function rebuild(r: Run, ctx: RunCtx, evolve: boolean) {
  const boosts = boostsFrom(r.boons);
  r.party = r.party.map((p) => {
    const dex = evolve ? evolvedForm(ctx.data, p.dex, r.level) : p.dex;
    const name = dex === p.dex ? p.name : nameOf(ctx, dex);
    if (dex !== p.dex) r.news.push(`${p.name} evolved into ${name}!`);
    const grown = makeBattler(dex, r.level, ctx.data, name, boosts);
    const hp = standing(p) ? Math.max(1, Math.ceil((p.hp / p.maxHp) * grown.maxHp)) : 0;
    return { ...grown, hp, moves: p.moves, item: p.item, kos: p.kos };
  });
}

/** Finish the current stop and step onto the next floor, drawing a new area after a gym. */
function advance(r: Run) {
  r.at = r.node ?? r.at;
  r.node = null;
  r.floor++;
  if ((r.floor - 1) % FLOORS_PER_BIOME === 0) {
    r.nodes = buildArea(r);
    r.at = null;
  }
  r.phase = { name: "map" };
}

/** The stops you may choose now. */
export function reachable(run: Run): MapNode[] {
  if (run.at === null) return run.nodes.filter((n) => n.row === 1);
  return run.nodes[run.at].next.map((id) => run.nodes[id]);
}

export function startRun(setup: RunSetup, ctx: RunCtx, seed: number): Run {
  const has = (perk: PerkId) => setup.perks.includes(perk);
  const level = Math.min(100, setup.level + (has("levels") ? 2 : 0));
  const r: Run = {
    v: 3,
    step: 0,
    seed,
    floor: 1,
    nodes: [],
    at: null,
    node: null,
    startLevel: setup.level,
    level,
    party: setup.partyDex.slice(0, 6).map((dex) => {
      const b = makeBattler(dex, level, ctx.data, nameOf(ctx, dex));
      return setup.tired ? { ...b, hp: Math.ceil(b.maxHp * 0.7) } : b;
    }),
    potions: setup.potions + (has("potion") ? 1 : 0),
    coins: has("coins") ? 100 : 0,
    boons: {},
    wins: 0,
    caught: [],
    amulet: setup.amulet,
    finalType: setup.finalType,
    cleared: false,
    news: [],
    phase: { name: "map" },
  };
  setup.items.forEach((item, i) => {
    if (r.party[i]) r.party[i].item = item;
  });
  if (has("item")) {
    const bare = r.party.find((p) => !p.item);
    if (bare) bare.item = drawOne(r, ITEM_IDS.filter((id) => !ITEMS[id].rare));
  }
  r.nodes = buildArea(r);
  return r;
}

// ---- Stops -------------------------------------------------------------------------

const PRICES: Record<"potion" | "revive" | "rare-candy", number> = { potion: 60, revive: 120, "rare-candy": 220 };
const itemPrice = (id: ItemId) => (ITEMS[id].rare ? 320 : 180);

/** Up to three moves the tutor can teach, each for a different pairing of move and Pokémon. */
function tutorOptions(r: Run): { move: Move; who: number }[] {
  const all = r.party.flatMap((p, who) => learnable(p).map((move) => ({ move, who })));
  const common = all.filter((o) => !o.move.rare);
  return drawSome(r, common.length >= 3 ? common : all, 3);
}

/** Choose a stop on the map. Starts a battle, opens a shop, or resolves on the spot. */
export function enterNode(run: Run, id: number, ctx: RunCtx): { run: Run; frames: Frame[] } {
  const node = run.nodes[id];
  if (run.phase.name !== "map" || !node || !reachable(run).some((n) => n.id === id)) return { run, frames: [] };
  const r = next(run);
  r.node = id;

  switch (node.kind) {
    case "rest":
      r.party = r.party.map((p) => ({ ...p, hp: Math.min(p.maxHp, Math.max(p.hp, 0) + Math.ceil(p.maxHp / 2)) }));
      r.news.push("Your team rested at the Pokémon Center.");
      advance(r);
      break;
    case "shop": {
      const items = drawSome(r, ITEM_IDS, 2).map((item): ShopItem => ({ id: item, price: itemPrice(item) }));
      const basics = (["potion", "revive", "rare-candy"] as const).map((item): ShopItem => ({ id: item, price: PRICES[item] }));
      r.phase = { name: "shop", stock: [...basics, ...items] };
      break;
    }
    case "tutor": {
      const options = tutorOptions(r);
      if (options.length === 0) {
        r.news.push("The move tutor had nothing new to teach your team.");
        advance(r);
      } else r.phase = { name: "tutor", options };
      break;
    }
    case "event":
      r.phase = { name: "event", id: drawOne(r, Object.keys(EVENTS) as EventId[]) };
      break;
    default: {
      const themed = r.finalType ? [r.finalType] : undefined;
      const encounter = buildEncounter(node.kind as EncounterKind, r.floor, r.startLevel, ctx.data, ctx.names, r, themed);
      const opened = openBattle(
        {
          kind: encounter.kind,
          party: r.party,
          foes: encounter.foes,
          potions: r.potions,
          seed: drawInt(r, 0x7fffffff),
          rivalName: encounter.rival?.name,
        },
        ctx.data.chart,
      );
      r.phase = { name: "fight", battle: opened.state, rival: encounter.rival };
      return { run: r, frames: opened.frames };
    }
  }
  return { run: r, frames: [] };
}

/** One turn of the battle in progress. */
export function fightTurn(run: Run, action: Action, ctx: RunCtx): { run: Run; frames: Frame[] } {
  if (run.phase.name !== "fight") return { run, frames: [] };
  const turn = takeTurn(run.phase.battle, action, ctx.data.chart);
  if (turn.frames.length === 0) return { run, frames: [] };
  return { run: { ...run, step: run.step + 1, phase: { ...run.phase, battle: turn.state } }, frames: turn.frames };
}

const COINS: Record<EncounterKind, [number, number]> = { wild: [30, 2], trainer: [80, 4], elite: [150, 6], boss: [250, 8] };

/** Three rewards: a team upgrade, a held item and a move (or a second upgrade if nobody can learn one). */
function rollRewards(r: Run, kind: EncounterKind): Reward[] {
  const sure = kind === "trainer" ? -1 : drawInt(r, 3);
  const rare = (slot: number) => slot === sure || draw(r) < 0.15;
  const boonOf = (wantRare: boolean, not?: BoonId) =>
    drawOne(r, BOONS.filter((b) => b.rare === wantRare && b.id !== not)).id;

  const boon: Reward = { kind: "boon", id: boonOf(rare(0)) };
  const wantRareItem = rare(1);
  const item: Reward = { kind: "item", id: drawOne(r, ITEM_IDS.filter((id) => ITEMS[id].rare === wantRareItem)) };

  const wantRareMove = rare(2);
  const moves = r.party.flatMap((p, who) => (standing(p) ? learnable(p).map((move) => ({ move, who })) : []));
  const fitting = moves.filter((o) => !!o.move.rare === wantRareMove);
  const pool = fitting.length > 0 ? fitting : moves;
  const third: Reward = pool.length > 0 ? { kind: "move", ...drawOne(r, pool) } : { kind: "boon", id: boonOf(false, boon.id) };
  return [boon, item, third];
}

/** Settle a finished battle: lose the run, stay put after running, or collect and move on. */
export function afterBattle(run: Run, ctx: RunCtx): Run {
  if (run.phase.name !== "fight" || !isOver(run.phase.battle)) return run;
  const r = next(run);
  const battle = run.phase.battle;
  const kind = battle.kind;
  r.potions = battle.potions;
  r.party = structuredClone(battle.party).map((p) => ({
    ...p,
    status: undefined,
    sleep: undefined,
    heals: 2,
    stages: { atk: 0, def: 0, spe: 0 },
  }));

  if (battle.phase === "lost") {
    r.phase = { name: "over" };
    return r;
  }
  if (battle.phase === "fled") {
    r.node = null;
    r.phase = { name: "map" };
    return r;
  }
  if (battle.phase === "caught") {
    const dex = battle.foes[battle.foe].dex;
    r.caught.push(dex);
    if (r.party.length < 6) {
      r.party.push(makeBattler(dex, r.level, ctx.data, nameOf(ctx, dex), boostsFrom(r.boons)));
      r.news.push(`${nameOf(ctx, dex)} joined your team.`);
    } else r.news.push(`${nameOf(ctx, dex)} was sent to the PC. Your team is full.`);
    advance(r);
    return r;
  }

  r.wins++;
  r.level = Math.min(100, r.level + 1);
  rebuild(r, ctx, true);
  // The team catches its breath after every battle: 15% HP back for anyone still standing.
  r.party = r.party.map((p) => healBy(p, 0.15));
  const [base, perFloor] = COINS[kind];
  const coins = Math.floor((base + r.floor * perFloor) * (r.amulet ? 1.5 : 1));
  r.coins += coins;
  r.news.push(`You won ${coins} coins.`);

  if (kind === "wild") {
    advance(r);
    return r;
  }
  if (kind === "boss") {
    r.party = r.party.map((p) => ({ ...p, hp: p.maxHp }));
    if (isFinalFloor(r.floor)) {
      r.cleared = true;
      r.news.push("You beat the champion! The run is cleared. Keep climbing for as long as you like.");
    }
  }
  r.phase = {
    name: "reward",
    note: kind === "boss" ? "The gym leader healed your team. Choose a reward." : "Choose a reward.",
    options: rollRewards(r, kind),
  };
  return r;
}

function applyBoon(r: Run, id: BoonId, ctx: RunCtx) {
  if (id === "rare-candy") {
    r.level = Math.min(100, r.level + 3);
    rebuild(r, ctx, true);
  } else if (id === "potion") r.potions += 2;
  else if (id === "max-revive") r.party = r.party.map((p) => ({ ...p, hp: p.maxHp }));
  else {
    r.boons[id] = (r.boons[id] ?? 0) + 1;
    rebuild(r, ctx, false);
  }
}

export function pickReward(run: Run, index: number, ctx: RunCtx): Run {
  if (run.phase.name !== "reward" || !run.phase.options[index]) return run;
  const r = next(run);
  const reward = run.phase.options[index];
  if (reward.kind === "boon") {
    applyBoon(r, reward.id, ctx);
    advance(r);
  } else if (reward.kind === "item") r.phase = { name: "give", item: reward.id };
  else r.phase = { name: "teach", move: reward.move, who: reward.who };
  return r;
}

/** Hand the item to a team member (replacing what it held), or pass null to leave it behind. */
export function giveItem(run: Run, who: number | null): Run {
  if (run.phase.name !== "give") return run;
  const r = next(run);
  if (who !== null && r.party[who]) {
    r.party[who].item = run.phase.item;
    r.news.push(`${r.party[who].name} is now holding the ${ITEMS[run.phase.item].name}.`);
  }
  if (run.phase.back) r.phase = { name: "shop", stock: run.phase.back };
  else advance(r);
  return r;
}

/** Replace the move in `slot`, or pass null to keep the old moves. */
export function teachMove(run: Run, slot: number | null): Run {
  if (run.phase.name !== "teach") return run;
  const r = next(run);
  const { move, who } = run.phase;
  const learner = r.party[who];
  if (slot !== null && learner?.moves[slot]) {
    r.news.push(`${learner.name} forgot ${learner.moves[slot].name} and learned ${move.name}.`);
    learner.moves[slot] = move;
  }
  advance(r);
  return r;
}

/** Take one of the tutor's offers, or pass null to move on without. */
export function pickTutor(run: Run, index: number | null): Run {
  if (run.phase.name !== "tutor") return run;
  const r = next(run);
  const offer = index === null ? null : run.phase.options[index];
  if (offer) r.phase = { name: "teach", ...offer };
  else advance(r);
  return r;
}

export function buy(run: Run, index: number, ctx: RunCtx): Run {
  if (run.phase.name !== "shop") return run;
  const wanted = run.phase.stock[index];
  if (!wanted || wanted.sold || run.coins < wanted.price) return run;
  if (wanted.id === "revive" && run.party.every(standing)) return run;

  const r = next(run);
  const stock = structuredClone(run.phase.stock);
  r.coins -= wanted.price;
  r.phase = { name: "shop", stock };
  if (wanted.id === "potion") r.potions++;
  else if (wanted.id === "revive") {
    const down = r.party.find((p) => !standing(p))!;
    down.hp = Math.ceil(down.maxHp / 2);
    r.news.push(`${down.name} is back on its feet.`);
  } else if (wanted.id === "rare-candy") {
    stock[index].sold = true;
    r.level = Math.min(100, r.level + 1);
    rebuild(r, ctx, true);
    r.news.push(`The whole team grew to Lv ${r.level}.`);
  } else {
    stock[index].sold = true;
    r.phase = { name: "give", item: wanted.id, back: stock };
  }
  return r;
}

export function leaveShop(run: Run): Run {
  if (run.phase.name !== "shop") return run;
  const r = next(run);
  advance(r);
  return r;
}

/** Resolve an event. The second choice is always the safe one. */
export function chooseEvent(run: Run, choice: 0 | 1, ctx: RunCtx): Run {
  if (run.phase.name !== "event") return run;
  const r = next(run);
  const bold = choice === 0;
  const loseShare = (share: number) =>
    (r.party = r.party.map((p) => (standing(p) ? { ...p, hp: Math.max(1, p.hp - Math.floor(p.hp * share)) } : p)));

  switch (run.phase.id) {
    case "berries":
      if (bold) {
        if (draw(r) < 0.6) {
          r.news.push("You found a perfect Sitrus Berry.");
          r.phase = { name: "give", item: "sitrus-berry" };
          return r;
        }
        r.news.push("A wild Pokémon had got to the good ones first.");
      } else {
        r.party = r.party.map((p) => healBy(p, 0.3));
        r.news.push("Everyone ate their fill and got 30% of their HP back.");
      }
      break;
    case "stranger":
      if (bold && r.coins >= 80) {
        r.coins -= 80;
        const item = drawOne(r, ITEM_IDS);
        r.news.push(`The stranger handed over a ${ITEMS[item].name} and vanished.`);
        r.phase = { name: "give", item };
        return r;
      }
      r.news.push(bold ? "You can't afford it. The stranger shrugs." : "You keep your coins and walk on.");
      break;
    case "shrine":
      if (bold) {
        loseShare(0.25);
        const boon = drawOne(r, ["protein", "iron", "carbos", "hp-up"] as const);
        applyBoon(r, boon, ctx);
        r.news.push(`The shrine took its share and left a ${BOONS.find((b) => b.id === boon)!.name}.`);
      } else {
        r.coins = Math.max(0, r.coins - 1);
        r.party = r.party.map((p) => healBy(p, 0.1));
        r.news.push("You leave a coin and sit a while. The team feels a little better.");
      }
      break;
    case "school":
      if (bold) {
        loseShare(0.15);
        r.level = Math.min(100, r.level + 1);
        rebuild(r, ctx, true);
        r.news.push(`A hard session. The team is bruised but grew to Lv ${r.level}.`);
      } else {
        r.coins += 120;
        r.news.push("Your lecture notes sold for 120 coins.");
      }
      break;
  }
  advance(r);
  return r;
}

/** End the run by choice, keeping what it reached. */
export function retire(run: Run): Run {
  return { ...next(run), phase: { name: "over" } };
}

// ---- What a run leaves behind, and what it starts with ------------------------------

export type RunSummary = {
  floor: number;
  wins: number;
  cleared: boolean;
  caught: number[];
  party: { dex: number; kos: number }[];
};

export const summarize = (run: Run): RunSummary => ({
  floor: run.floor,
  wins: run.wins,
  cleared: run.cleared,
  caught: run.caught,
  party: run.party.map((p) => ({ dex: p.dex, kos: p.kos })),
});

/** Everything past runs add up to. */
export type Career = { best: number; clears: number; runs: number };
export const NO_CAREER: Career = { best: 0, clears: 0, runs: 0 };

export const careerOf = (history: RunSummary[]): Career => ({
  best: Math.max(0, ...history.map((h) => h.floor)),
  clears: history.filter((h) => h.cleared).length,
  runs: history.length,
});

/** What one species has done across every run it was taken on. */
export type DexRecord = { runs: number; kos: number; best: number };
export function recordsOf(history: RunSummary[]): Map<number, DexRecord> {
  const records = new Map<number, DexRecord>();
  for (const run of history) {
    for (const { dex, kos } of run.party) {
      const r = records.get(dex) ?? { runs: 0, kos: 0, best: 0 };
      records.set(dex, { runs: r.runs + 1, kos: r.kos + kos, best: Math.max(r.best, run.floor) });
    }
  }
  return records;
}

/** Starting perks, unlocked for good by how far you have climbed. */
export const PERKS = [
  { id: "coins", name: "Pocket money", text: "Start with 100 coins.", how: "Reach floor 5", has: (c: Career) => c.best >= 5 },
  { id: "potion", name: "Spare Potion", text: "Start with one more Potion.", how: "Reach floor 10", has: (c: Career) => c.best >= 10 },
  { id: "item", name: "Parting gift", text: "One Pokémon starts holding an item.", how: "Reach floor 15", has: (c: Career) => c.best >= 15 },
  { id: "levels", name: "Veteran team", text: "Start two levels higher.", how: "Beat the champion", has: (c: Career) => c.clears >= 1 },
] as const;
export type PerkId = (typeof PERKS)[number]["id"];
export const perksFor = (career: Career): PerkId[] => PERKS.filter((p) => p.has(career)).map((p) => p.id);

const BADGE_ITEMS: ItemId[] = ["sitrus-berry", "quick-claw", "muscle-band", "lum-berry", "expert-belt", "scope-lens"];
/** Held items your badges send along: one for every four badges. */
export const startItems = (badges: number): ItemId[] => BADGE_ITEMS.slice(0, Math.floor(badges / 4));

/** The type (1 to 18) a spending category stands for. The same name always gives the same type. */
export function themeType(category: string): number {
  let hash = 0;
  for (const ch of category.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return (hash % 18) + 1;
}
