// The battle engine and the roguelike content: pure functions and tables, no React.
// Rules are a simplified version of the classic formulas (see Battles in the README).

/** One species: type ids and the six base stats (hp, atk, def, sp. atk, sp. def, speed). */
export type Species = { t: number[]; s: number[] };
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

// A light and a heavy move name for each type.
const MOVE_NAMES: [string, string][] = [
  ["", ""],
  ["Tackle", "Body Slam"],
  ["Karate Chop", "Close Combat"],
  ["Gust", "Air Slash"],
  ["Acid", "Sludge Bomb"],
  ["Mud-Slap", "Earthquake"],
  ["Rock Throw", "Rock Slide"],
  ["Bug Bite", "X-Scissor"],
  ["Lick", "Shadow Ball"],
  ["Metal Claw", "Flash Cannon"],
  ["Ember", "Flamethrower"],
  ["Water Gun", "Surf"],
  ["Vine Whip", "Energy Ball"],
  ["Thunder Shock", "Thunderbolt"],
  ["Confusion", "Psychic"],
  ["Powder Snow", "Ice Beam"],
  ["Twister", "Dragon Claw"],
  ["Bite", "Crunch"],
  ["Fairy Wind", "Moonblast"],
];

export type Move = {
  name: string;
  type: number;
  power: number;
  /** Chance to hit, 0–100. */
  accuracy: number;
  /** Goes before slower moves regardless of speed. */
  quick?: boolean;
  /** Heals this share of max HP instead of attacking. */
  heal?: number;
};

/**
 * Every Pokémon gets four moves from its types: a reliable light attack, a heavy
 * attack that can miss, a third option, and Recover (twice per battle).
 */
export function movesFor({ t: [first, second] }: Species): Move[] {
  const third: Move = second
    ? { name: MOVE_NAMES[second][0], type: second, power: 55, accuracy: 95 }
    : first === 1
      ? { name: "Bite", type: 17, power: 55, accuracy: 95 }
      : { name: "Quick Attack", type: 1, power: 40, accuracy: 100, quick: true };
  return [
    { name: MOVE_NAMES[first][0], type: first, power: 50, accuracy: 100 },
    { name: MOVE_NAMES[first][1], type: first, power: 90, accuracy: 85 },
    third,
    { name: "Recover", type: 1, power: 0, accuracy: 100, heal: 0.4 },
  ];
}

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
  };
}

export const baseTotal = (s: Species) => s.s.reduce((a, b) => a + b, 0);

/** How well a move's type does against a defender: 0, 0.25, 0.5, 1, 2 or 4. */
export const effectiveness = (moveType: number, defender: Battler, chart: number[][]) =>
  defender.types.reduce((mult, t) => mult * (chart[moveType]?.[t] ?? 1), 1);

export type Strike = { damage: number; eff: number; crit: boolean; missed: boolean };

export function strike(
  attacker: Battler,
  defender: Battler,
  move: Move,
  chart: number[][],
  perks: { critChance?: number; expert?: boolean } = {},
): Strike {
  if (Math.random() * 100 >= move.accuracy) return { damage: 0, eff: 1, crit: false, missed: true };
  const eff = effectiveness(move.type, defender, chart);
  const crit = Math.random() < (perks.critChance ?? 1 / 16);
  const base = Math.floor((((2 * attacker.level) / 5 + 2) * move.power * attacker.atk) / defender.def / 50) + 2;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const roll = 0.85 + Math.random() * 0.15;
  const expert = perks.expert && eff > 1 ? 1.25 : 1;
  const damage = eff === 0 ? 0 : Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * roll * expert));
  return { damage, eff, crit, missed: false };
}

/** The opponent's choice: usually its strongest move, sometimes a surprise, Recover when hurt. */
export function pickFoeMove(foe: Battler, target: Battler, chart: number[][]): Move {
  const heal = foe.moves.find((m) => m.heal);
  if (heal && foe.heals > 0 && foe.hp < foe.maxHp * 0.35 && Math.random() < 0.5) return heal;
  const attacks = foe.moves.filter((m) => !m.heal);
  if (Math.random() < 0.35) return attacks[Math.floor(Math.random() * attacks.length)];
  const worth = (m: Move) =>
    m.power * (m.accuracy / 100) * effectiveness(m.type, target, chart) * (foe.types.includes(m.type) ? 1.5 : 1);
  return attacks.reduce((best, m) => (worth(m) > worth(best) ? m : best));
}

/** True with probability p. */
export const chance = (p: number) => Math.random() < p;

/** Chance that a thrown ball holds: better the lower the target's HP. */
export const catchChance = (target: Battler) => 0.2 + 0.75 * (1 - target.hp / target.maxHp);

// ---- Roguelike content -------------------------------------------------------------

/** Run upgrades, shown with the item sprite of the same id. They stack. */
export const BOONS = [
  { id: "protein", name: "Protein", text: "+20% attack for the whole team" },
  { id: "iron", name: "Iron", text: "+20% defense for the whole team" },
  { id: "carbos", name: "Carbos", text: "+20% speed for the whole team" },
  { id: "hp-up", name: "HP Up", text: "+20% max HP for the whole team" },
  { id: "leftovers", name: "Leftovers", text: "Heal 8% HP at the end of every turn" },
  { id: "scope-lens", name: "Scope Lens", text: "Critical hits four times as often" },
  { id: "shell-bell", name: "Shell Bell", text: "Heal 20% of the damage you deal" },
  { id: "expert-belt", name: "Expert Belt", text: "Super effective hits deal 25% more" },
  { id: "rare-candy", name: "Rare Candy", text: "+3 levels for the whole team, right now" },
  { id: "max-revive", name: "Max Revive", text: "Revive and fully heal the whole team, right now" },
  { id: "potion", name: "Potion pack", text: "+2 Potions" },
] as const;
export type BoonId = (typeof BOONS)[number]["id"];
export type Boons = Partial<Record<BoonId, number>>;

export const boostsFrom = (boons: Boons): Boosts => ({
  hp: 1.2 ** (boons["hp-up"] ?? 0),
  atk: 1.2 ** (boons.protein ?? 0),
  def: 1.2 ** (boons.iron ?? 0),
  spe: 1.2 ** (boons.carbos ?? 0),
});

export function randomBoons(count: number): BoonId[] {
  const pool = BOONS.map((b) => b.id);
  const picks: BoonId[] = [];
  while (picks.length < count) picks.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  return picks;
}

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
export const biomeAt = (floor: number) => BIOMES[Math.floor((floor - 1) / FLOORS_PER_BIOME) % BIOMES.length];

export const backdrop = (bg: string) => `https://play.pokemonshowdown.com/fx/bg-${bg}.png`;

const RIVALS = [
  ["youngster", "Youngster"], ["lass", "Lass"], ["bugcatcher", "Bug Catcher"], ["camper", "Camper"],
  ["picnicker", "Picnicker"], ["hiker", "Hiker"], ["fisherman", "Fisherman"], ["swimmer", "Swimmer"],
  ["blackbelt", "Black Belt"], ["scientist", "Scientist"], ["psychic", "Psychic"], ["beauty", "Beauty"],
  ["sailor", "Sailor"], ["gentleman", "Gentleman"], ["acetrainer", "Ace Trainer"], ["acetrainerf", "Ace Trainer"],
  ["rocketgrunt", "Rocket Grunt"],
];
const BOSSES = [
  ["brock", "Leader Brock"], ["misty", "Leader Misty"], ["ltsurge", "Leader Lt. Surge"], ["erika", "Leader Erika"],
  ["koga", "Leader Koga"], ["sabrina", "Leader Sabrina"], ["blaine", "Leader Blaine"], ["giovanni", "Leader Giovanni"],
  ["lance", "Champion Lance"], ["steven", "Champion Steven"], ["cynthia", "Champion Cynthia"],
];

export type NodeKind = "wild" | "trainer" | "boss" | "rest" | "item";
export type PathNode = { kind: NodeKind; title: string; text: string; icon: string };

const NODE: Record<NodeKind, PathNode> = {
  wild: { kind: "wild", title: "Tall grass", text: "A wild Pokémon. Weaken it and you can catch it.", icon: "poke-ball" },
  trainer: { kind: "trainer", title: "Trainer", text: "A tougher fight. Win to choose an upgrade.", icon: "vs-seeker" },
  boss: { kind: "boss", title: "Gym battle", text: "The area's leader. Win for an upgrade and a full heal.", icon: "master-ball" },
  rest: { kind: "rest", title: "Pokémon Center", text: "Heal the whole team by half and revive the fainted.", icon: "full-restore" },
  item: { kind: "item", title: "Poké Mart", text: "Pick up a free Potion.", icon: "potion" },
};

/** The paths offered on a floor. Every fifth floor is a boss and nothing else. */
export function pathsFor(floor: number): PathNode[] {
  if (floor % FLOORS_PER_BIOME === 0) return [NODE.boss];
  const extras: NodeKind[] = [];
  if (Math.random() < 0.65) extras.push("trainer");
  if (Math.random() < (floor % FLOORS_PER_BIOME >= 3 ? 0.6 : 0.3)) extras.push("rest");
  if (Math.random() < 0.3) extras.push("item");
  if (extras.length === 0) extras.push("trainer");
  return [NODE.wild, ...extras.slice(0, 2).map((k) => NODE[k])];
}

/** A random species that fits the area and is about as strong as the floor calls for. */
export function pickSpecies(data: BattleData, floor: number, types: number[], bonus = 0): number {
  const max = 300 + floor * 20 + bonus;
  const min = Math.max(180, max - 200);
  const all = data.species.map((s, i) => ({ dex: i + 1, s }));
  const fits = (strict: boolean) =>
    all.filter(({ s }) => {
      const total = baseTotal(s);
      return total <= max && (!strict || total >= min) && (!strict || s.t.some((t) => types.includes(t)));
    });
  const pool = fits(true).length ? fits(true) : fits(false).length ? fits(false) : all;
  return pool[Math.floor(Math.random() * pool.length)].dex;
}

export type Encounter = {
  kind: "wild" | "trainer" | "boss";
  foes: Battler[];
  /** Showdown trainer sprite id and display name, for trainer and boss fights. */
  rival?: { sprite: string; name: string };
};

export function buildEncounter(
  kind: Encounter["kind"],
  floor: number,
  startLevel: number,
  data: BattleData,
  names: string[],
): Encounter {
  const biome = biomeAt(floor);
  // Wild Pokémon sit a little under your team (which gains a level per win); trainers and bosses above.
  const level = Math.max(2, Math.min(100, startLevel + floor - 4 + (kind === "boss" ? 3 : kind === "trainer" ? 1 : 0)));
  // Trainers start with one Pokémon and field more as you climb; bosses always bring a team.
  const size =
    kind === "wild" ? 1 : kind === "trainer" ? (floor < 4 ? 1 : floor < 10 ? 2 : 3) : Math.min(5, 2 + Math.ceil(floor / 5));
  const foes = Array.from({ length: size }, () => {
    const dex = pickSpecies(data, floor, biome.types, kind === "boss" ? 60 : 0);
    return makeBattler(dex, level, data, names[dex - 1] ?? `No. ${dex}`);
  });
  if (kind === "wild") return { kind, foes };
  const list = kind === "boss" ? BOSSES : RIVALS;
  const [sprite, name] =
    kind === "boss"
      ? list[(floor / FLOORS_PER_BIOME - 1) % list.length]
      : list[Math.floor(Math.random() * list.length)];
  return { kind, foes, rival: { sprite, name } };
}

/** Battle level of your team before a run: five levels per trainer level. */
export const teamLevel = (trainerLevel: number) => Math.min(100, Math.max(5, trainerLevel * 5));
