// Battle content: species data, moves, abilities, held items, areas and opponents.
// Tables and small pure helpers only. The turn rules are in battle.ts and the
// roguelike run in run.ts.
import { draw, drawInt, drawOne, type Seeded } from "./rng";

/** One species: type ids, the six base stats (hp, atk, def, sp. atk, sp. def, speed), and what it evolves into. */
export type Species = {
  t: number[];
  s: number[];
  /** [dex number it evolves into, level at which it does]. */
  e?: [number, number];
};
/** Loaded once from PokeAPI's data files; see getBattleData in data.ts. */
export type BattleData = {
  /** Index = dex number − 1. */
  species: Species[];
  /** chart[attacking type][defending type] = 0, 0.5, 1 or 2. Indexed by type id. */
  chart: number[][];
};

// Type ids follow PokeAPI (1 = Normal … 18 = Fairy).
export const TYPES = [
  "", "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
  "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy",
];
export const TYPE_COLOR = [
  "", "#8a8c8a", "#d96d00", "#5a9ad6", "#9141cb", "#915121", "#8c8660", "#7a8a14", "#704170", "#4f8ba1",
  "#d92426", "#2671d9", "#368a23", "#b58b00", "#d93869", "#1f9fc0", "#5060e1", "#624d4e", "#c94fc9",
];

// ---- Moves -------------------------------------------------------------------------

export type Status = "burn" | "poison" | "paralysis" | "sleep";
export type Stat = "atk" | "def" | "spe";
export const STAT_NAME: Record<Stat, string> = { atk: "attack", def: "defense", spe: "speed" };
export const STATUS_NAME: Record<Status, string> = { burn: "BRN", poison: "PSN", paralysis: "PAR", sleep: "SLP" };

export type Move = {
  name: string;
  type: number;
  /** 0 for a move that only changes status or stats. */
  power: number;
  /** Chance to hit, 0–100. Above 100 never misses. */
  accuracy: number;
  /** Goes before slower moves regardless of speed. */
  quick?: boolean;
  /** Heals this share of max HP instead of attacking (twice per battle). */
  heal?: number;
  /** Chance (0–100) to leave the target with a status condition. */
  status?: { kind: Status; chance: number };
  /** Raises or lowers stat stages, on the user or the target. */
  stage?: { who: "self" | "foe"; stats: Stat[]; by: number; chance?: number };
  /** The user heals this share of the damage dealt. */
  drain?: number;
  /** The user takes this share of the damage dealt. */
  recoil?: number;
  /** Critical hits twice as often. */
  highCrit?: boolean;
  /** Only offered as a rare reward. */
  rare?: boolean;
};

type Extra = Omit<Move, "name" | "type" | "power" | "accuracy">;
const mv = (name: string, type: number, power: number, accuracy: number, extra: Extra = {}): Move => ({
  name,
  type,
  power,
  accuracy,
  ...extra,
});
const afflict = (kind: Status, chance: number): Extra => ({ status: { kind, chance } });
const self = (stats: Stat[], by: number, chance?: number): Extra => ({ stage: { who: "self", stats, by, chance } });
const foe = (stats: Stat[], by: number, chance?: number): Extra => ({ stage: { who: "foe", stats, by, chance } });

/**
 * Every type's moves: a reliable light attack, a heavy one that can miss, and
 * extras that are learned during a run (from rewards and the move tutor).
 */
const MOVES: { light: Move; heavy: Move; extra: Move[] }[] = [
  { light: mv("", 0, 0, 0), heavy: mv("", 0, 0, 0), extra: [] },
  {
    light: mv("Tackle", 1, 50, 100),
    heavy: mv("Body Slam", 1, 90, 85, afflict("paralysis", 30)),
    extra: [
      mv("Quick Attack", 1, 40, 100, { quick: true }),
      mv("Growl", 1, 0, 100, foe(["atk"], -1)),
      mv("Hyper Voice", 1, 90, 100),
      mv("Swords Dance", 1, 0, 101, { ...self(["atk"], 2), rare: true }),
      mv("Double-Edge", 1, 120, 100, { recoil: 0.33, rare: true }),
    ],
  },
  {
    light: mv("Karate Chop", 2, 50, 100, { highCrit: true }),
    heavy: mv("Close Combat", 2, 90, 85),
    extra: [
      mv("Mach Punch", 2, 40, 100, { quick: true }),
      mv("Bulk Up", 2, 0, 101, self(["atk", "def"], 1)),
      mv("Drain Punch", 2, 75, 100, { drain: 0.5 }),
      mv("Superpower", 2, 120, 100, { ...self(["atk"], -1), rare: true }),
    ],
  },
  {
    light: mv("Gust", 3, 50, 100),
    heavy: mv("Air Slash", 3, 90, 85),
    extra: [
      mv("Aerial Ace", 3, 60, 101),
      mv("Tailwind", 3, 0, 101, self(["spe"], 2)),
      mv("Brave Bird", 3, 120, 100, { recoil: 0.33, rare: true }),
    ],
  },
  {
    light: mv("Acid", 4, 50, 100, foe(["def"], -1, 10)),
    heavy: mv("Sludge Bomb", 4, 90, 85, afflict("poison", 30)),
    extra: [
      mv("Toxic", 4, 0, 90, afflict("poison", 100)),
      mv("Poison Jab", 4, 80, 100, afflict("poison", 30)),
      mv("Acid Armor", 4, 0, 101, self(["def"], 2)),
    ],
  },
  {
    light: mv("Mud-Slap", 5, 50, 100),
    heavy: mv("Earthquake", 5, 90, 85),
    extra: [mv("Bulldoze", 5, 60, 100, foe(["spe"], -1)), mv("Earth Power", 5, 85, 100, foe(["def"], -1, 10))],
  },
  {
    light: mv("Rock Throw", 6, 50, 100),
    heavy: mv("Rock Slide", 6, 90, 85),
    extra: [
      mv("Rock Tomb", 6, 60, 95, foe(["spe"], -1)),
      mv("Rock Polish", 6, 0, 101, self(["spe"], 2)),
      mv("Stone Edge", 6, 100, 80, { highCrit: true, rare: true }),
    ],
  },
  {
    light: mv("Bug Bite", 7, 50, 100),
    heavy: mv("X-Scissor", 7, 90, 85),
    extra: [
      mv("Struggle Bug", 7, 50, 100, foe(["atk"], -1)),
      mv("Leech Life", 7, 80, 100, { drain: 0.5 }),
      mv("Quiver Dance", 7, 0, 101, { ...self(["atk", "spe"], 1), rare: true }),
    ],
  },
  {
    light: mv("Lick", 8, 50, 100, afflict("paralysis", 10)),
    heavy: mv("Shadow Ball", 8, 90, 85, foe(["def"], -1, 20)),
    extra: [mv("Shadow Sneak", 8, 40, 100, { quick: true }), mv("Shadow Claw", 8, 70, 100, { highCrit: true })],
  },
  {
    light: mv("Metal Claw", 9, 50, 100),
    heavy: mv("Flash Cannon", 9, 90, 85),
    extra: [
      mv("Bullet Punch", 9, 40, 100, { quick: true }),
      mv("Iron Defense", 9, 0, 101, self(["def"], 2)),
      mv("Iron Head", 9, 80, 100),
      mv("Meteor Mash", 9, 90, 90, { ...self(["atk"], 1, 20), rare: true }),
    ],
  },
  {
    light: mv("Ember", 10, 50, 100, afflict("burn", 10)),
    heavy: mv("Flamethrower", 10, 90, 85, afflict("burn", 10)),
    extra: [
      mv("Will-O-Wisp", 10, 0, 85, afflict("burn", 100)),
      mv("Flame Charge", 10, 50, 100, self(["spe"], 1)),
      mv("Fire Blast", 10, 110, 85, { ...afflict("burn", 10), rare: true }),
    ],
  },
  {
    light: mv("Water Gun", 11, 50, 100),
    heavy: mv("Surf", 11, 90, 85),
    extra: [
      mv("Aqua Jet", 11, 40, 100, { quick: true }),
      mv("Scald", 11, 80, 100, afflict("burn", 30)),
      mv("Hydro Pump", 11, 110, 80, { rare: true }),
    ],
  },
  {
    light: mv("Vine Whip", 12, 50, 100),
    heavy: mv("Energy Ball", 12, 90, 85),
    extra: [
      mv("Giga Drain", 12, 75, 100, { drain: 0.5 }),
      mv("Sleep Powder", 12, 0, 75, afflict("sleep", 100)),
      mv("Leaf Storm", 12, 130, 90, { ...self(["atk"], -2), rare: true }),
    ],
  },
  {
    light: mv("Thunder Shock", 13, 50, 100, afflict("paralysis", 10)),
    heavy: mv("Thunderbolt", 13, 90, 85, afflict("paralysis", 10)),
    extra: [
      mv("Thunder Wave", 13, 0, 90, afflict("paralysis", 100)),
      mv("Spark", 13, 65, 100, afflict("paralysis", 30)),
      mv("Thunder", 13, 110, 70, { ...afflict("paralysis", 30), rare: true }),
    ],
  },
  {
    light: mv("Confusion", 14, 50, 100),
    heavy: mv("Psychic", 14, 90, 85, foe(["def"], -1, 10)),
    extra: [
      mv("Calm Mind", 14, 0, 101, self(["atk", "def"], 1)),
      mv("Hypnosis", 14, 0, 60, afflict("sleep", 100)),
      mv("Psyshock", 14, 80, 100),
    ],
  },
  {
    light: mv("Powder Snow", 15, 50, 100),
    heavy: mv("Ice Beam", 15, 90, 85),
    extra: [
      mv("Ice Shard", 15, 40, 100, { quick: true }),
      mv("Icy Wind", 15, 55, 95, foe(["spe"], -1)),
      mv("Blizzard", 15, 110, 70, { rare: true }),
    ],
  },
  {
    light: mv("Twister", 16, 50, 100),
    heavy: mv("Dragon Claw", 16, 90, 85),
    extra: [
      mv("Dragon Breath", 16, 60, 100, afflict("paralysis", 30)),
      mv("Dragon Dance", 16, 0, 101, { ...self(["atk", "spe"], 1), rare: true }),
      mv("Draco Meteor", 16, 130, 90, { ...self(["atk"], -2), rare: true }),
    ],
  },
  {
    light: mv("Bite", 17, 50, 100),
    heavy: mv("Crunch", 17, 90, 85, foe(["def"], -1, 20)),
    extra: [
      mv("Sucker Punch", 17, 60, 100, { quick: true }),
      mv("Snarl", 17, 55, 95, foe(["atk"], -1)),
      mv("Nasty Plot", 17, 0, 101, { ...self(["atk"], 2), rare: true }),
    ],
  },
  {
    light: mv("Fairy Wind", 18, 50, 100),
    heavy: mv("Moonblast", 18, 90, 85, foe(["atk"], -1, 30)),
    extra: [
      mv("Charm", 18, 0, 100, foe(["atk"], -2)),
      mv("Draining Kiss", 18, 50, 100, { drain: 0.75 }),
      mv("Play Rough", 18, 90, 90, foe(["atk"], -1, 10)),
    ],
  },
];

export const RECOVER: Move = { name: "Recover", type: 1, power: 0, accuracy: 101, heal: 0.4 };

/**
 * The four moves every Pokémon starts with, built from its types: a reliable light
 * attack, a heavy attack that can miss, a third option, and Recover (twice per battle).
 */
export function movesFor({ t: [first, second] }: Species): Move[] {
  const third = second ? { ...MOVES[second].light, power: 55, accuracy: 95 } : first === 1 ? MOVES[17].light : MOVES[1].extra[0];
  return [MOVES[first].light, MOVES[first].heavy, third, RECOVER];
}

/** Moves a Pokémon could still learn: the extras of its own types, plus the Normal ones anyone can use. */
export function learnable(who: Pick<Battler, "types" | "moves">): Move[] {
  const types = [...new Set([...who.types, 1])];
  return types.flatMap((t) => MOVES[t].extra).filter((m) => !who.moves.some((known) => known.name === m.name));
}

/** A plain-language line about what a move does, for the move list and the tutor. */
export function describeMove(m: Move): string {
  if (m.heal != null) return `Heals ${Math.round(m.heal * 100)}% HP, twice per battle.`;
  const parts: string[] = [];
  if (m.power > 0) parts.push(`Power ${m.power}`);
  parts.push(m.accuracy > 100 ? "never misses" : `${m.accuracy}% accurate`);
  if (m.quick) parts.push("goes first");
  if (m.highCrit) parts.push("critical hits more often");
  if (m.status) {
    parts.push(m.status.chance >= 100 ? `inflicts ${m.status.kind}` : `${m.status.chance}% chance of ${m.status.kind}`);
  }
  if (m.stage) {
    const { who, stats, by, chance } = m.stage;
    const what = `${by > 0 ? "raises" : "lowers"} ${who === "self" ? "your" : "the foe's"} ${stats.map((s) => STAT_NAME[s]).join(" and ")}${Math.abs(by) > 1 ? " sharply" : ""}`;
    parts.push(chance && chance < 100 ? `${chance}% chance it ${what}` : what);
  }
  if (m.drain) parts.push(`heals you for ${Math.round(m.drain * 100)}% of the damage`);
  if (m.recoil) parts.push("hurts you a third as much");
  const line = parts.join(", ");
  return `${line[0].toUpperCase()}${line.slice(1)}.`;
}

// ---- Abilities ---------------------------------------------------------------------
// Each species has one, set by its first type and its dex number. What each does is
// applied in battle.ts.

export const ABILITIES = {
  none: { name: "", text: "" },
  blaze: { name: "Blaze", text: "Fire moves hit half again as hard at a third of HP or less." },
  torrent: { name: "Torrent", text: "Water moves hit half again as hard at a third of HP or less." },
  overgrow: { name: "Overgrow", text: "Grass moves hit half again as hard at a third of HP or less." },
  swarm: { name: "Swarm", text: "Bug moves hit half again as hard at a third of HP or less." },
  intimidate: { name: "Intimidate", text: "Lowers the foe's attack on coming out." },
  static: { name: "Static", text: "Three in ten attackers are paralysed." },
  "flame-body": { name: "Flame Body", text: "Three in ten attackers are burned." },
  "poison-point": { name: "Poison Point", text: "Three in ten attackers are poisoned." },
  sturdy: { name: "Sturdy", text: "Survives a knockout blow from full HP with 1 HP." },
  levitate: { name: "Levitate", text: "Ground moves cannot touch it." },
  "thick-fat": { name: "Thick Fat", text: "Takes half damage from Fire and Ice moves." },
  "natural-cure": { name: "Natural Cure", text: "Status conditions heal when it switches out." },
  regenerator: { name: "Regenerator", text: "Heals a third of its HP when it switches out." },
  adaptability: { name: "Adaptability", text: "Moves of its own type hit even harder." },
  technician: { name: "Technician", text: "Moves of power 60 or less hit half again as hard." },
  guts: { name: "Guts", text: "Hits half again as hard while it has a status condition." },
  "rough-skin": { name: "Rough Skin", text: "Attackers lose an eighth of their HP." },
  "compound-eyes": { name: "Compound Eyes", text: "Its moves are much more accurate." },
  "clear-body": { name: "Clear Body", text: "The foe cannot lower its stats." },
  synchronize: { name: "Synchronize", text: "Passes burns, poison and paralysis back to the foe." },
  "magic-guard": { name: "Magic Guard", text: "Only attacks can hurt it." },
  "ice-body": { name: "Ice Body", text: "Heals a sixteenth of its HP every turn." },
  moxie: { name: "Moxie", text: "Attack rises after each knockout." },
  multiscale: { name: "Multiscale", text: "Takes half damage while at full HP." },
} as const;
export type AbilityId = keyof typeof ABILITIES;

/** The two abilities found on each first type; odd dex numbers get the first. */
const TYPE_ABILITIES: [AbilityId, AbilityId][] = [
  ["none", "none"],
  ["adaptability", "guts"],
  ["guts", "intimidate"],
  ["compound-eyes", "moxie"],
  ["poison-point", "regenerator"],
  ["rough-skin", "sturdy"],
  ["sturdy", "clear-body"],
  ["swarm", "technician"],
  ["levitate", "synchronize"],
  ["clear-body", "sturdy"],
  ["blaze", "flame-body"],
  ["torrent", "regenerator"],
  ["overgrow", "natural-cure"],
  ["static", "technician"],
  ["synchronize", "magic-guard"],
  ["thick-fat", "ice-body"],
  ["multiscale", "moxie"],
  ["intimidate", "moxie"],
  ["natural-cure", "magic-guard"],
];
export const abilityFor = (dex: number, types: number[]): AbilityId => TYPE_ABILITIES[types[0]]?.[(dex + 1) % 2] ?? "none";

// ---- Held items ----------------------------------------------------------------------
// One Pokémon holds each. The id is also the item sprite shown.

export const ITEMS = {
  "sitrus-berry": { name: "Sitrus Berry", text: "Heals a quarter of HP once it drops to half. Used up.", rare: false },
  "lum-berry": { name: "Lum Berry", text: "Cures one status condition. Used up.", rare: false },
  "muscle-band": { name: "Muscle Band", text: "Attacks deal 15% more.", rare: false },
  "quick-claw": { name: "Quick Claw", text: "One turn in five, the holder moves first.", rare: false },
  "expert-belt": { name: "Expert Belt", text: "Super effective hits deal 25% more.", rare: false },
  "scope-lens": { name: "Scope Lens", text: "Critical hits four times as often.", rare: false },
  "shell-bell": { name: "Shell Bell", text: "Heals an eighth of the damage dealt.", rare: false },
  leftovers: { name: "Leftovers", text: "Heals a sixteenth of HP every turn.", rare: true },
  "life-orb": { name: "Life Orb", text: "Attacks deal 30% more, at a tenth of HP each.", rare: true },
  "focus-sash": { name: "Focus Sash", text: "Survives one knockout blow from full HP. Used up.", rare: true },
  "rocky-helmet": { name: "Rocky Helmet", text: "Attackers lose an eighth of their HP.", rare: true },
} as const;
export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

// ---- Battlers ----------------------------------------------------------------------

export type Battler = {
  dex: number;
  name: string;
  level: number;
  types: number[];
  maxHp: number;
  hp: number;
  /** The better of attack and special attack. */
  atk: number;
  /** The average of defense and special defense. */
  def: number;
  spe: number;
  moves: Move[];
  /** Recovers left this battle. */
  heals: number;
  ability: AbilityId;
  item?: ItemId;
  status?: Status;
  /** Turns of sleep left. */
  sleep?: number;
  /** Stat stages, −6 to +6. They reset on switching out and after the battle. */
  stages: Record<Stat, number>;
  /** Knockouts scored this run. */
  kos: number;
};

export type Boosts = { hp: number; atk: number; def: number; spe: number };
const NO_BOOST: Boosts = { hp: 1, atk: 1, def: 1, spe: 1 };

const statAt = (base: number, level: number) => Math.floor(((2 * base + 31) * level) / 100) + 5;

export function makeBattler(
  dex: number,
  level: number,
  data: BattleData,
  name: string,
  boost: Boosts = NO_BOOST,
): Battler {
  const species = data.species[dex - 1];
  const [hp, atk, def, spa, spd, spe] = species.s;
  const maxHp = Math.floor((statAt(hp, level) + level + 5) * boost.hp);
  return {
    dex,
    name,
    level,
    types: species.t,
    maxHp,
    hp: maxHp,
    atk: Math.floor(statAt(Math.max(atk, spa), level) * boost.atk),
    def: Math.floor(statAt((def + spd) / 2, level) * boost.def),
    spe: Math.floor(statAt(spe, level) * boost.spe),
    moves: movesFor(species),
    heals: 2,
    ability: abilityFor(dex, species.t),
    stages: { atk: 0, def: 0, spe: 0 },
    kos: 0,
  };
}

export const baseTotal = (s: Species) => s.s.reduce((a, b) => a + b, 0);

/** How well a move's type does against a defender: 0, 0.25, 0.5, 1, 2 or 4. */
export const effectiveness = (moveType: number, defender: Pick<Battler, "types">, chart: number[][]) =>
  defender.types.reduce((mult, t) => mult * (chart[moveType]?.[t] ?? 1), 1);

/** The species this one has become by `level`, following its evolutions as far as they go. */
export function evolvedForm(data: BattleData, dex: number, level: number): number {
  let now = dex;
  for (let steps = 0; steps < 3; steps++) {
    const next = data.species[now - 1]?.e;
    if (!next || level < next[1]) break;
    now = next[0];
  }
  return now;
}

// ---- Team upgrades -------------------------------------------------------------------

/** Run upgrades for the whole team, shown with the item sprite of the same id. The stat ones stack. */
export const BOONS = [
  { id: "protein", name: "Protein", text: "+20% attack for the whole team", rare: false },
  { id: "iron", name: "Iron", text: "+20% defense for the whole team", rare: false },
  { id: "carbos", name: "Carbos", text: "+20% speed for the whole team", rare: false },
  { id: "hp-up", name: "HP Up", text: "+20% max HP for the whole team", rare: false },
  { id: "potion", name: "Potion pack", text: "+2 Potions", rare: false },
  { id: "rare-candy", name: "Rare Candy", text: "+3 levels for the whole team, right now", rare: true },
  { id: "max-revive", name: "Max Revive", text: "Revive and fully heal the whole team, right now", rare: true },
] as const;
export type BoonId = (typeof BOONS)[number]["id"];
export type Boons = Partial<Record<BoonId, number>>;

export const boostsFrom = (boons: Boons): Boosts => ({
  hp: 1.2 ** (boons["hp-up"] ?? 0),
  atk: 1.2 ** (boons.protein ?? 0),
  def: 1.2 ** (boons.iron ?? 0),
  spe: 1.2 ** (boons.carbos ?? 0),
});

// ---- Areas and opponents -------------------------------------------------------------

/** Each area lasts five floors, has its own backdrop, and favours certain types. */
export const BIOMES = [
  { name: "Route 1", bg: "route", types: [1, 3, 7, 12] },
  { name: "Flower Meadow", bg: "meadow", types: [12, 7, 18, 1] },
  { name: "Deep Forest", bg: "forest", types: [12, 7, 4] },
  { name: "Riverbank", bg: "river", types: [11, 12, 7] },
  { name: "Sunny Beach", bg: "beach", types: [11, 5, 3] },
  { name: "City Streets", bg: "city", types: [13, 9, 4, 14, 17] },
  { name: "Rocky Pass", bg: "mountain", types: [6, 2, 3, 5] },
  { name: "Desert", bg: "desert", types: [5, 10, 6] },
  { name: "Cavern", bg: "earthycave", types: [6, 5, 17] },
  { name: "Damp Cave", bg: "dampcave", types: [11, 4, 8] },
  { name: "Thunder Plains", bg: "thunderplains", types: [13, 3] },
  { name: "Ice Cave", bg: "icecave", types: [15, 11] },
  { name: "Volcano", bg: "volcanocave", types: [10, 6, 16] },
  { name: "Deep Sea", bg: "deepsea", types: [11, 14, 16] },
];
export const FLOORS_PER_BIOME = 5;
/** The champion waits here. Beating them clears the run; you can keep climbing afterwards. */
export const FINAL_FLOOR = 25;
export const biomeAt = (floor: number) => BIOMES[Math.floor((floor - 1) / FLOORS_PER_BIOME) % BIOMES.length];

export const backdrop = (bg: string) => `https://play.pokemonshowdown.com/fx/bg-${bg}.png`;

const RIVALS = [
  ["youngster", "Youngster"], ["lass", "Lass"], ["bugcatcher", "Bug Catcher"], ["camper", "Camper"],
  ["picnicker", "Picnicker"], ["hiker", "Hiker"], ["fisherman", "Fisherman"], ["swimmer", "Swimmer"],
  ["blackbelt", "Black Belt"], ["scientist", "Scientist"], ["psychic", "Psychic"], ["beauty", "Beauty"],
  ["sailor", "Sailor"], ["gentleman", "Gentleman"], ["rocketgrunt", "Rocket Grunt"],
];
const ELITES = [
  ["acetrainer", "Ace Trainer"], ["acetrainerf", "Ace Trainer"], ["veteran", "Veteran"], ["veteranf", "Veteran"],
];
const LEADERS = [
  ["brock", "Leader Brock"], ["misty", "Leader Misty"], ["ltsurge", "Leader Lt. Surge"], ["erika", "Leader Erika"],
  ["koga", "Leader Koga"], ["sabrina", "Leader Sabrina"], ["blaine", "Leader Blaine"], ["giovanni", "Leader Giovanni"],
];
const CHAMPIONS = [["lance", "Champion Lance"], ["steven", "Champion Steven"], ["cynthia", "Champion Cynthia"]];

/** Items an elite trainer's or a leader's last Pokémon may hold. */
const ACE_ITEMS: ItemId[] = ["sitrus-berry", "leftovers", "muscle-band", "focus-sash", "lum-berry"];

/** A random species that fits the area and is about as strong as the floor calls for. */
export function pickSpecies(data: BattleData, floor: number, types: number[], rng: Seeded, bonus = 0): number {
  const max = 300 + floor * 20 + bonus;
  const min = Math.max(180, max - 200);
  const all = data.species.map((s, i) => ({ dex: i + 1, s }));
  const fits = (strict: boolean) =>
    all.filter(({ s }) => {
      const total = baseTotal(s);
      return total <= max && (!strict || total >= min) && (!strict || s.t.some((t) => types.includes(t)));
    });
  const pool = fits(true).length ? fits(true) : fits(false).length ? fits(false) : all;
  return pool[drawInt(rng, pool.length)].dex;
}

export type EncounterKind = "wild" | "trainer" | "elite" | "boss";
export type Encounter = {
  kind: EncounterKind;
  foes: Battler[];
  /** Showdown trainer sprite id and display name, for everything but wild Pokémon. */
  rival?: { sprite: string; name: string };
};

export const isFinalFloor = (floor: number) => floor % FINAL_FLOOR === 0;

export function buildEncounter(
  kind: EncounterKind,
  floor: number,
  startLevel: number,
  data: BattleData,
  names: string[],
  rng: Seeded,
  /** Types the champion's team is built from, instead of the area's. */
  themed?: number[],
): Encounter {
  const biome = biomeAt(floor);
  const final = kind === "boss" && isFinalFloor(floor);
  const types = final && themed?.length ? themed : biome.types;
  // Wild Pokémon sit a little under your team (which gains a level per win); trainers and leaders above.
  const above = { wild: 0, trainer: 1, elite: 2, boss: 3 }[kind] + (final ? 1 : 0);
  const level = Math.max(2, Math.min(100, startLevel + floor - 4 + above));
  // Trainers start with one Pokémon and field more as you climb; leaders always bring a team.
  const trainerSize = floor < 4 ? 1 : floor < 10 ? 2 : 3;
  const size =
    kind === "wild"
      ? 1
      : kind === "trainer"
        ? trainerSize
        : kind === "elite"
          ? Math.min(4, trainerSize + 1)
          : Math.min(final ? 6 : 5, 2 + Math.ceil(floor / 5));
  const tough = kind === "elite" || kind === "boss";

  const foes = Array.from({ length: size }, (_, i) => {
    const dex = pickSpecies(data, floor, types, rng, kind === "boss" ? 60 : kind === "elite" ? 30 : 0);
    const ace = tough && i === size - 1;
    const battler = makeBattler(dex, Math.min(100, level + (ace ? 1 : 0)), data, names[dex - 1] ?? `No. ${dex}`);
    // Stronger opponents know one of the moves you would have to learn.
    const pool = learnable(battler);
    if (pool.length > 0 && draw(rng) < (tough ? 1 : floor > 5 ? 0.4 : 0.15)) battler.moves[2] = drawOne(rng, pool);
    if (ace) battler.item = drawOne(rng, ACE_ITEMS);
    return battler;
  });
  if (kind === "wild") return { kind, foes };

  const bossNumber = floor / FLOORS_PER_BIOME;
  const [sprite, name] =
    kind === "boss"
      ? final
        ? CHAMPIONS[(floor / FINAL_FLOOR - 1) % CHAMPIONS.length]
        : LEADERS[(bossNumber - Math.floor(floor / FINAL_FLOOR) - 1) % LEADERS.length]
      : drawOne(rng, kind === "elite" ? ELITES : RIVALS);
  return { kind, foes, rival: { sprite, name } };
}

/** Battle level of your team before a run: five levels per trainer level. */
export const teamLevel = (trainerLevel: number) => Math.min(100, Math.max(5, trainerLevel * 5));
