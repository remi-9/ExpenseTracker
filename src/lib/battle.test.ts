import { describe, expect, test } from "bun:test";
import { calcDamage, openBattle, takeTurn, type Action, type BattleState } from "./battle";
import type { Battler, Move } from "./fight";

// Type ids: 1 Normal, 5 Ground, 10 Fire, 11 Water, 12 Grass, 13 Electric.
const chart: number[][] = Array.from({ length: 19 }, () => Array(19).fill(1));
chart[11][10] = 2; // water beats fire
chart[10][11] = 0.5;
chart[10][12] = 2;
chart[5][13] = 2;

const hit = (over: Partial<Move> = {}): Move => ({ name: "Hit", type: 1, power: 50, accuracy: 100, ...over });
const KO = hit({ name: "Smash", power: 5000 });
const POKE = hit({ name: "Poke", power: 1 });

const mon = (over: Partial<Battler> = {}): Battler => ({
  dex: 1,
  name: "Mon",
  level: 20,
  types: [1],
  maxHp: 100,
  hp: 100,
  atk: 50,
  def: 50,
  spe: 50,
  moves: [POKE, KO],
  heals: 2,
  ability: "none",
  stages: { atk: 0, def: 0, spe: 0 },
  kos: 0,
  ...over,
});

const open = (party: Battler[], foes: Battler[], over: Partial<Parameters<typeof openBattle>[0]> = {}) =>
  openBattle({ kind: "trainer", party, foes, potions: 1, seed: 7, rivalName: "Rival", ...over }, chart).state;

const play = (state: BattleState, ...actions: Action[]) =>
  actions.reduce((s, a) => takeTurn(s, a, chart).state, state);

const texts = (state: BattleState, action: Action) =>
  takeTurn(state, action, chart)
    .frames.map((f) => f.text)
    .filter(Boolean) as string[];

const move = (index: number): Action => ({ type: "move", index });

/** Share of 300 seeds in which `test` holds after one turn. */
const rate = (make: (seed: number) => BattleState, action: Action, test: (s: BattleState) => boolean) => {
  let hits = 0;
  for (let seed = 1; seed <= 300; seed++) if (test(takeTurn(make(seed), action, chart).state)) hits++;
  return hits / 300;
};

describe("turn order", () => {
  test("the same seed and actions give the same battle", () => {
    const start = () => open([mon({ moves: [hit()] })], [mon({ name: "Foe", moves: [hit()] })]);
    expect(play(start(), move(0), move(0))).toEqual(play(start(), move(0), move(0)));
  });

  test("the faster Pokémon moves first", () => {
    const state = open([mon({ name: "Slow", spe: 10 })], [mon({ name: "Fast", spe: 90, moves: [POKE] })]);
    const said = texts(state, move(0));
    expect(said.findIndex((t) => t.includes("Fast used"))).toBeLessThan(said.findIndex((t) => t.includes("Slow used")));
  });

  test("a quick move goes before a faster foe", () => {
    const state = open(
      [mon({ name: "Slow", spe: 10, moves: [hit({ name: "Jab", quick: true, power: 1 })] })],
      [mon({ name: "Fast", spe: 90, moves: [POKE] })],
    );
    const said = texts(state, move(0));
    expect(said.findIndex((t) => t.includes("Slow used"))).toBeLessThan(said.findIndex((t) => t.includes("Fast used")));
  });

  test("a turn taken after the battle is over changes nothing", () => {
    const won = play(open([mon({ spe: 90 })], [mon({ name: "Foe" })]), move(1));
    expect(won.phase).toBe("won");
    expect(takeTurn(won, move(1), chart).state).toEqual(won);
  });
});

describe("damage", () => {
  const roll = { crit: false, roll: 1 };
  test("a super effective move doubles the damage", () => {
    const water = hit({ type: 11 });
    const plain = calcDamage(mon(), mon(), water, chart, roll).damage;
    const strong = calcDamage(mon(), mon({ types: [10] }), water, chart, roll);
    expect(strong.eff).toBe(2);
    expect(strong.damage).toBeGreaterThanOrEqual(plain * 2 - 2);
    expect(strong.damage).toBeLessThanOrEqual(plain * 2 + 2);
  });

  test("a move of the user's own type hits harder", () => {
    const fire = hit({ type: 10 });
    expect(calcDamage(mon({ types: [10] }), mon(), fire, chart, roll).damage).toBeGreaterThan(
      calcDamage(mon(), mon(), fire, chart, roll).damage,
    );
  });

  test("a burn halves the damage dealt", () => {
    const healthy = calcDamage(mon(), mon(), hit(), chart, roll).damage;
    const burned = calcDamage(mon({ status: "burn" }), mon(), hit(), chart, roll).damage;
    expect(burned).toBeLessThanOrEqual(Math.ceil(healthy / 2) + 1);
  });

  test("two attack stages double the attack", () => {
    const base = calcDamage(mon(), mon(), hit(), chart, roll).damage;
    const boosted = calcDamage(mon({ stages: { atk: 2, def: 0, spe: 0 } }), mon(), hit(), chart, roll).damage;
    // Not exactly double: the formula adds a small constant after the attack is applied.
    expect(boosted / base).toBeGreaterThan(1.8);
    expect(boosted / base).toBeLessThanOrEqual(2);
  });
});

describe("fainting", () => {
  test("the next foe comes out when one faints", () => {
    const state = play(open([mon({ spe: 90 })], [mon({ name: "A" }), mon({ name: "B" })]), move(1));
    expect(state.foe).toBe(1);
    expect(state.phase).toBe("choose");
    expect(state.party[0].kos).toBe(1);
  });

  test("beating the last foe wins the battle", () => {
    expect(play(open([mon({ spe: 90 })], [mon()]), move(1)).phase).toBe("won");
  });

  test("when yours faints you must switch, and the switch is free", () => {
    const foe = mon({ name: "Foe", spe: 90, moves: [KO] });
    const forced = play(open([mon(), mon({ name: "Next", hp: 100 })], [foe]), move(0));
    expect(forced.phase).toBe("forced");
    const after = play(forced, { type: "switch", to: 1 });
    expect(after.me).toBe(1);
    expect(after.party[1].hp).toBe(100);
    expect(after.phase).toBe("choose");
  });

  test("losing the whole team loses the battle", () => {
    expect(play(open([mon()], [mon({ spe: 90, moves: [KO] })]), move(0)).phase).toBe("lost");
  });
});

describe("other actions", () => {
  test("you cannot run from a trainer", () => {
    expect(play(open([mon()], [mon()]), { type: "run" }).phase).toBe("choose");
  });

  test("you can run from a wild Pokémon", () => {
    expect(play(open([mon()], [mon()], { kind: "wild" }), { type: "run" }).phase).toBe("fled");
  });

  test("a Potion heals half and costs the turn", () => {
    const state = play(open([mon({ hp: 10 })], [mon({ moves: [hit({ power: 1 })] })]), { type: "potion" });
    expect(state.potions).toBe(0);
    expect(state.party[0].hp).toBeGreaterThan(50);
    expect(state.party[0].hp).toBeLessThan(60);
  });

  test("a ball catches a weakened wild Pokémon most of the time", () => {
    const caught = rate(
      (seed) => open([mon()], [mon({ hp: 1, moves: [POKE] })], { kind: "wild", seed }),
      { type: "ball" },
      (s) => s.phase === "caught",
    );
    expect(caught).toBeGreaterThan(0.85);
  });

  test("a ball rarely holds a healthy wild Pokémon", () => {
    const caught = rate(
      (seed) => open([mon()], [mon({ moves: [POKE] })], { kind: "wild", seed }),
      { type: "ball" },
      (s) => s.phase === "caught",
    );
    expect(caught).toBeGreaterThan(0.1);
    expect(caught).toBeLessThan(0.3);
  });

  test("a ball cannot be thrown at a trainer's Pokémon", () => {
    expect(play(open([mon()], [mon({ hp: 1 })]), { type: "ball" }).phase).toBe("choose");
  });
});

describe("status conditions", () => {
  const inflict = (kind: "burn" | "poison" | "paralysis" | "sleep") =>
    hit({ name: "Curse", power: 0, status: { kind, chance: 100 } });

  test("poison takes an eighth of max HP at the end of each turn", () => {
    const state = play(open([mon({ spe: 90, moves: [inflict("poison")] })], [mon({ moves: [hit({ power: 0, heal: 0 })] })]), move(0));
    expect(state.foes[0].status).toBe("poison");
    expect(state.foes[0].hp).toBe(88);
  });

  test("a Fire type cannot be burned", () => {
    const state = play(open([mon({ spe: 90, moves: [inflict("burn")] })], [mon({ types: [10], moves: [POKE] })]), move(0));
    expect(state.foes[0].status).toBeUndefined();
  });

  test("a sleeping Pokémon cannot move, then wakes within three turns", () => {
    const start = open([mon({ spe: 90, moves: [inflict("sleep"), POKE] })], [mon({ name: "Foe", moves: [KO] })]);
    const asleep = play(start, move(0));
    expect(asleep.foes[0].status).toBe("sleep");
    expect(asleep.party[0].hp).toBe(100);
    const later = play(asleep, move(1), move(1), move(1));
    expect(later.phase).toBe("lost");
  });

  test("paralysis halves speed", () => {
    const state = open([mon({ name: "Mine", spe: 60 })], [mon({ name: "Foe", spe: 90, status: "paralysis", moves: [POKE] })]);
    const said = texts(state, move(0));
    expect(said[0]).toContain("Mine used");
  });

  test("a status move does nothing to a Pokémon that already has a status", () => {
    const state = play(
      open([mon({ spe: 90, moves: [inflict("burn")] })], [mon({ status: "poison", moves: [hit({ power: 0, heal: 0 })] })]),
      move(0),
    );
    expect(state.foes[0].status).toBe("poison");
  });
});

describe("stat stages", () => {
  const dance = hit({ name: "Dance", power: 0, stage: { who: "self", stats: ["atk"], by: 2 } });

  test("a boosting move raises the user's stage", () => {
    const state = play(open([mon({ moves: [dance] })], [mon({ moves: [POKE] })]), move(0));
    expect(state.party[0].stages.atk).toBe(2);
  });

  test("stages are lost on switching out", () => {
    const boosted = play(open([mon({ moves: [dance] }), mon({ name: "B" })], [mon({ moves: [POKE] })]), move(0));
    const back = play(boosted, { type: "switch", to: 1 }, { type: "switch", to: 0 });
    expect(back.party[0].stages.atk).toBe(0);
  });

  test("stages stop at six", () => {
    const state = play(open([mon({ moves: [dance] })], [mon({ moves: [POKE] })]), move(0), move(0), move(0), move(0));
    expect(state.party[0].stages.atk).toBe(6);
  });
});

describe("abilities", () => {
  test("Intimidate lowers the foe's attack when it comes out", () => {
    const state = open([mon({ ability: "intimidate" })], [mon()]);
    expect(state.foes[0].stages.atk).toBe(-1);
  });

  test("Clear Body blocks stat drops from the foe", () => {
    const state = open([mon({ ability: "intimidate" })], [mon({ ability: "clear-body" })]);
    expect(state.foes[0].stages.atk).toBe(0);
  });

  test("Sturdy survives a knockout blow from full HP", () => {
    const state = play(open([mon({ ability: "sturdy", moves: [POKE] })], [mon({ spe: 90, moves: [KO] })]), move(0));
    expect(state.party[0].hp).toBe(1);
  });

  test("Levitate is untouched by Ground moves", () => {
    const quake = hit({ type: 5, power: 5000 });
    const state = play(open([mon({ ability: "levitate", moves: [POKE] })], [mon({ moves: [quake] })]), move(0));
    expect(state.party[0].hp).toBe(100);
  });

  test("Static paralyses about three attackers in ten", () => {
    const paralysed = rate(
      (seed) => open([mon({ moves: [POKE] })], [mon({ ability: "static", moves: [hit({ power: 0, heal: 0 })] })], { seed }),
      move(0),
      (s) => s.party[0].status === "paralysis",
    );
    expect(paralysed).toBeGreaterThan(0.2);
    expect(paralysed).toBeLessThan(0.4);
  });

  test("Moxie raises attack after a knockout", () => {
    const state = play(open([mon({ spe: 90, ability: "moxie" })], [mon(), mon()]), move(1));
    expect(state.party[0].stages.atk).toBe(1);
  });

  test("Regenerator heals a third on switching out", () => {
    const state = play(
      open([mon({ hp: 10, ability: "regenerator" }), mon({ name: "B" })], [mon({ moves: [hit({ power: 0, heal: 0 })] })]),
      { type: "switch", to: 1 },
    );
    expect(state.party[0].hp).toBe(43);
  });
});

describe("held items", () => {
  const idle = mon({ name: "Foe", moves: [hit({ power: 0, heal: 0 })] });

  test("Leftovers heals a sixteenth at the end of the turn", () => {
    const state = play(open([mon({ hp: 50, item: "leftovers", moves: [POKE] })], [idle]), move(0));
    expect(state.party[0].hp).toBe(56);
  });

  test("a Focus Sash survives one knockout blow, then is gone", () => {
    const state = play(open([mon({ item: "focus-sash", moves: [POKE] })], [mon({ spe: 90, moves: [KO] })]), move(0));
    expect(state.party[0].hp).toBe(1);
    expect(state.party[0].item).toBeUndefined();
  });

  test("a Sitrus Berry heals a quarter once HP drops to half", () => {
    const state = play(
      open([mon({ hp: 60, item: "sitrus-berry", moves: [POKE] })], [mon({ atk: 50, moves: [hit({ power: 60 })] })]),
      move(0),
    );
    expect(state.party[0].item).toBeUndefined();
    expect(state.party[0].hp).toBeGreaterThan(50);
  });

  test("a Lum Berry cures a status at once", () => {
    const burn = hit({ power: 0, status: { kind: "burn", chance: 100 } });
    const state = play(open([mon({ item: "lum-berry", moves: [POKE] })], [mon({ spe: 90, moves: [burn] })]), move(0));
    expect(state.party[0].status).toBeUndefined();
    expect(state.party[0].item).toBeUndefined();
  });

  test("a Life Orb costs a tenth of max HP per attack", () => {
    const state = play(open([mon({ item: "life-orb", moves: [POKE] })], [idle]), move(0));
    expect(state.party[0].hp).toBe(90);
  });

  test("a Rocky Helmet hurts whoever strikes the holder", () => {
    const state = play(open([mon({ moves: [POKE] })], [{ ...idle, item: "rocky-helmet" }]), move(0));
    expect(state.party[0].hp).toBe(88);
  });
});

describe("opponent choices", () => {
  test("a smart opponent picks its super effective move", () => {
    const foe = mon({ name: "Foe", spe: 90, moves: [hit({ name: "Plain" }), hit({ name: "Splash", type: 11 })] });
    for (let seed = 1; seed <= 30; seed++) {
      const state = open([mon({ types: [10], moves: [POKE] })], [foe], { kind: "boss", seed });
      expect(texts(state, move(0)).some((t) => t.includes("used Splash"))).toBe(true);
    }
  });

  test("a hurt opponent sometimes uses Recover", () => {
    const foe = mon({ name: "Foe", hp: 20, moves: [POKE, hit({ name: "Recover", power: 0, heal: 0.4 })] });
    const healed = rate((seed) => open([mon({ moves: [hit({ power: 0, heal: 0 })] })], [foe], { seed }), move(0), (s) => s.foes[0].hp > 20);
    expect(healed).toBeGreaterThan(0.3);
    expect(healed).toBeLessThan(0.7);
  });
});
