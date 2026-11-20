import { describe, expect, test } from "bun:test";
import type { BattleData } from "./fight";
import { drawInt } from "./rng";
import {
  afterBattle,
  buildArea,
  buy,
  careerOf,
  chooseEvent,
  enterNode,
  fightTurn,
  giveItem,
  leaveShop,
  perksFor,
  pickReward,
  pickTutor,
  reachable,
  recordsOf,
  retire,
  startItems,
  startRun,
  summarize,
  teachMove,
  themeType,
  type NodeKind,
  type Run,
  type RunSetup,
} from "./run";

// Six made-up species. No. 1 evolves into No. 2 at level 7.
const data: BattleData = {
  species: [
    { t: [12], s: [45, 49, 49, 65, 65, 45], e: [2, 7] },
    { t: [12], s: [60, 62, 63, 80, 80, 60] },
    { t: [10], s: [39, 52, 43, 60, 50, 65] },
    { t: [11], s: [44, 48, 65, 50, 64, 43] },
    { t: [1], s: [40, 45, 40, 35, 35, 56] },
    { t: [13], s: [35, 55, 40, 50, 50, 90] },
  ],
  chart: Array.from({ length: 19 }, () => Array(19).fill(1)),
};
const ctx = { data, names: ["Sprout", "Bloom", "Ember", "Drop", "Plain", "Spark"] };

const setup = (over: Partial<RunSetup> = {}): RunSetup => ({
  partyDex: [3, 4],
  level: 5,
  potions: 2,
  tired: false,
  items: [],
  amulet: false,
  finalType: null,
  perks: [],
  ...over,
});
const start = (over: Partial<RunSetup> = {}, seed = 11) => startRun(setup(over), ctx, seed);

/** A run standing in front of a node of the given kind, wherever the map put one. */
function at(kind: NodeKind, over: Partial<RunSetup> = {}): { run: Run; node: number } {
  for (let seed = 1; seed < 500; seed++) {
    const run = start(over, seed);
    const node = reachable(run).find((n) => n.kind === kind);
    if (node) return { run, node: node.id };
  }
  throw new Error(`no ${kind} node on the first row in 500 maps`);
}

/** Enter a battle node and end the battle the given way without playing it. */
function fought(kind: NodeKind, phase: "won" | "lost" | "caught" | "fled", over: Partial<RunSetup> = {}) {
  const { run, node } = at(kind, over);
  const entered = enterNode(run, node, ctx).run;
  if (entered.phase.name !== "fight") throw new Error("expected a fight");
  const ended: Run = { ...entered, phase: { ...entered.phase, battle: { ...entered.phase.battle, phase } } };
  return { before: run, after: afterBattle(ended, ctx) };
}

describe("the area map", () => {
  const maps = Array.from({ length: 60 }, (_, i) => buildArea({ seed: i + 1 }));

  test("has five rows ending in a single gym battle", () => {
    for (const nodes of maps) {
      expect(Math.max(...nodes.map((n) => n.row))).toBe(5);
      expect(nodes.filter((n) => n.row === 5).map((n) => n.kind)).toEqual(["boss"]);
    }
  });

  test("every stop leads on to the next row", () => {
    for (const nodes of maps) {
      for (const node of nodes.filter((n) => n.row < 5)) {
        expect(node.next.length).toBeGreaterThan(0);
        for (const id of node.next) expect(nodes[id].row).toBe(node.row + 1);
      }
    }
  });

  test("every stop can be reached from the row before", () => {
    for (const nodes of maps) {
      for (const node of nodes.filter((n) => n.row > 1)) {
        expect(nodes.some((from) => from.next.includes(node.id))).toBe(true);
      }
    }
  });

  test("the first row always offers tall grass and the fourth a Pokémon Center", () => {
    for (const nodes of maps) {
      expect(nodes.some((n) => n.row === 1 && n.kind === "wild")).toBe(true);
      expect(nodes.some((n) => n.row === 4 && n.kind === "rest")).toBe(true);
    }
  });
});

describe("starting a run", () => {
  test("builds the team at the starting level", () => {
    const run = start();
    expect(run.party.map((p) => p.dex)).toEqual([3, 4]);
    expect(run.party.every((p) => p.level === 5 && p.hp === p.maxHp)).toBe(true);
    expect(run.floor).toBe(1);
  });

  test("an overspent month starts the team at 70% HP", () => {
    const run = start({ tired: true });
    expect(run.party[0].hp).toBe(Math.ceil(run.party[0].maxHp * 0.7));
  });

  test("starting items go to the first team members in order", () => {
    const run = start({ items: ["sitrus-berry", "quick-claw", "leftovers"] });
    expect(run.party.map((p) => p.item)).toEqual(["sitrus-berry", "quick-claw"]);
  });

  test("the same seed gives the same run", () => {
    expect(start({}, 42)).toEqual(start({}, 42));
  });

  test("perks add coins, a Potion and levels", () => {
    const run = start({ perks: ["coins", "potion", "levels"] });
    expect(run.coins).toBe(100);
    expect(run.potions).toBe(3);
    expect(run.level).toBe(7);
  });
});

describe("moving through the map", () => {
  test("the first row is reachable at the start", () => {
    const run = start();
    expect(reachable(run).every((n) => n.row === 1)).toBe(true);
    expect(reachable(run).length).toBeGreaterThan(1);
  });

  test("a stop that is not reachable cannot be entered", () => {
    const run = start();
    const far = run.nodes.find((n) => n.row === 3)!;
    expect(enterNode(run, far.id, ctx).run).toEqual(run);
  });

  test("after a stop, only the stops it leads to are reachable", () => {
    const { before, after } = fought("wild", "won");
    const entered = before.nodes[after.at!];
    expect(reachable(after).map((n) => n.id)).toEqual(entered.next);
  });
});

describe("battles in a run", () => {
  test("running from a wild Pokémon does not move you up a floor", () => {
    const { before, after } = fought("wild", "fled");
    expect(after.floor).toBe(before.floor);
    expect(after.at).toBe(before.at);
    expect(after.phase.name).toBe("map");
  });

  test("running away in the real battle flow keeps the floor too", () => {
    const { run, node } = at("wild");
    const entered = enterNode(run, node, ctx).run;
    const fled = fightTurn(entered, { type: "run" }, ctx).run;
    expect(afterBattle(fled, ctx).floor).toBe(run.floor);
  });

  test("a win is worth a level, coins and the next floor", () => {
    const { before, after } = fought("wild", "won");
    expect(after.level).toBe(before.level + 1);
    expect(after.floor).toBe(before.floor + 1);
    expect(after.coins).toBeGreaterThan(before.coins);
    expect(after.wins).toBe(1);
  });

  test("an Amulet Coin makes wins pay half again as much", () => {
    const plain = fought("wild", "won").after.coins;
    const blessed = fought("wild", "won", { amulet: true }).after.coins;
    expect(blessed).toBe(Math.floor(plain * 1.5));
  });

  test("losing ends the run", () => {
    const { after } = fought("wild", "lost");
    expect(after.phase).toEqual({ name: "over" });
  });

  test("a caught Pokémon joins the team", () => {
    const { before, after } = fought("wild", "caught");
    expect(after.party.length).toBe(before.party.length + 1);
    expect(after.caught.length).toBe(1);
    expect(after.floor).toBe(before.floor + 1);
  });

  test("an unfinished battle is not settled", () => {
    const { run, node } = at("wild");
    const entered = enterNode(run, node, ctx).run;
    expect(afterBattle(entered, ctx)).toEqual(entered);
  });

  test("status conditions are cleared after a battle", () => {
    const { run, node } = at("wild");
    const entered = enterNode(run, node, ctx).run;
    if (entered.phase.name !== "fight") throw new Error("expected a fight");
    const battle = structuredClone(entered.phase.battle);
    battle.party[0].status = "burn";
    battle.phase = "won";
    const after = afterBattle({ ...entered, phase: { ...entered.phase, battle } }, ctx);
    expect(after.party[0].status).toBeUndefined();
  });
});

describe("rewards", () => {
  test("beating a trainer offers three different rewards", () => {
    const { after } = fought("trainer", "won");
    if (after.phase.name !== "reward") throw new Error("expected rewards");
    expect(after.phase.options.length).toBe(3);
    expect(new Set(after.phase.options.map((o) => JSON.stringify(o))).size).toBe(3);
    expect(after.floor).toBe(1);
  });

  const withReward = (reward: unknown): Run => {
    const { after } = fought("trainer", "won");
    return { ...after, phase: { name: "reward", note: "", options: [reward] } } as Run;
  };

  test("a team upgrade applies at once and moves you on", () => {
    const run = withReward({ kind: "boon", id: "hp-up" });
    const next = pickReward(run, 0, ctx);
    expect(next.boons["hp-up"]).toBe(1);
    expect(next.party[0].maxHp).toBeGreaterThan(run.party[0].maxHp);
    expect(next.floor).toBe(2);
    expect(next.phase.name).toBe("map");
  });

  test("a held item goes to the Pokémon you choose", () => {
    const asked = pickReward(withReward({ kind: "item", id: "leftovers" }), 0, ctx);
    expect(asked.phase.name).toBe("give");
    const given = giveItem(asked, 1);
    expect(given.party[1].item).toBe("leftovers");
    expect(given.floor).toBe(2);
  });

  test("a new move replaces the one you choose to forget", () => {
    const move = { name: "Test Beam", type: 10, power: 80, accuracy: 100 };
    const asked = pickReward(withReward({ kind: "move", move, who: 0 }), 0, ctx);
    expect(asked.phase.name).toBe("teach");
    const taught = teachMove(asked, 2);
    expect(taught.party[0].moves[2].name).toBe("Test Beam");
    expect(taught.floor).toBe(2);
  });

  test("a move can be turned down", () => {
    const move = { name: "Test Beam", type: 10, power: 80, accuracy: 100 };
    const asked = pickReward(withReward({ kind: "move", move, who: 0 }), 0, ctx);
    const kept = teachMove(asked, null);
    expect(kept.party[0].moves.some((m) => m.name === "Test Beam")).toBe(false);
    expect(kept.floor).toBe(2);
  });

  test("a learned move survives levelling up", () => {
    const move = { name: "Test Beam", type: 10, power: 80, accuracy: 100 };
    const taught = teachMove(pickReward(withReward({ kind: "move", move, who: 0 }), 0, ctx), 2);
    const candy = pickReward({ ...taught, phase: { name: "reward", note: "", options: [{ kind: "boon", id: "rare-candy" }] } }, 0, ctx);
    expect(candy.level).toBe(taught.level + 3);
    expect(candy.party[0].moves[2].name).toBe("Test Beam");
  });
});

describe("evolution", () => {
  test("a Pokémon evolves when the team reaches its level", () => {
    const { after } = fought("wild", "won", { partyDex: [1], level: 6 });
    expect(after.level).toBe(7);
    expect(after.party[0].dex).toBe(2);
    expect(after.party[0].name).toBe("Bloom");
    expect(after.news.join(" ")).toContain("evolved into Bloom");
  });

  test("it does not evolve before that", () => {
    const { after } = fought("wild", "won", { partyDex: [1], level: 4 });
    expect(after.party[0].dex).toBe(1);
  });
});

describe("other stops", () => {
  test("a Pokémon Center heals half and revives", () => {
    const { run, node } = at("wild");
    const hurt: Run = { ...run, party: run.party.map((p, i) => ({ ...p, hp: i === 0 ? 0 : 1 })) };
    const rest = hurt.nodes.find((n) => n.id === node)!;
    rest.kind = "rest";
    const healed = enterNode(hurt, node, ctx).run;
    expect(healed.party[0].hp).toBe(Math.ceil(healed.party[0].maxHp / 2));
    expect(healed.floor).toBe(2);
  });

  const inShop = (coins: number): Run => {
    const { run, node } = at("wild");
    run.nodes.find((n) => n.id === node)!.kind = "shop";
    return enterNode({ ...run, coins }, node, ctx).run;
  };

  test("the shop sells a Potion for coins", () => {
    const shop = inShop(500);
    if (shop.phase.name !== "shop") throw new Error("expected a shop");
    const index = shop.phase.stock.findIndex((s) => s.id === "potion");
    const bought = buy(shop, index, ctx);
    expect(bought.potions).toBe(shop.potions + 1);
    expect(bought.coins).toBe(500 - shop.phase.stock[index].price);
  });

  test("the shop sells nothing you cannot afford", () => {
    const shop = inShop(0);
    expect(buy(shop, 0, ctx)).toEqual(shop);
  });

  test("leaving the shop moves you on", () => {
    expect(leaveShop(inShop(0)).floor).toBe(2);
  });

  test("an event resolves into news and the next floor", () => {
    const { run, node } = at("wild");
    run.nodes.find((n) => n.id === node)!.kind = "event";
    const event = enterNode(run, node, ctx).run;
    expect(event.phase.name).toBe("event");
    const done = chooseEvent(event, 1, ctx);
    expect(done.floor).toBe(2);
    expect(done.news.length).toBeGreaterThan(0);
  });
});

describe("areas and the champion", () => {
  /** A run that has just won the gym battle on `floor`. */
  const beatBoss = (floor: number) => {
    const run = start();
    const boss = run.nodes.find((n) => n.kind === "boss")!;
    const before = run.nodes.find((n) => n.next.includes(boss.id))!;
    const entered = enterNode({ ...run, floor, at: before.id }, boss.id, ctx).run;
    if (entered.phase.name !== "fight") throw new Error("expected a fight");
    const won: Run = { ...entered, phase: { ...entered.phase, battle: { ...entered.phase.battle, phase: "won" } } };
    const reward = afterBattle(won, ctx);
    return pickReward({ ...reward, phase: { name: "reward", note: "", options: [{ kind: "boon", id: "iron" }] } }, 0, ctx);
  };

  test("a new area begins after the gym battle", () => {
    const run = beatBoss(5);
    expect(run.floor).toBe(6);
    expect(run.at).toBeNull();
    expect(reachable(run).every((n) => n.row === 1)).toBe(true);
  });

  test("a gym leader heals the team", () => {
    const run = beatBoss(5);
    expect(run.party.every((p) => p.hp === p.maxHp)).toBe(true);
  });

  test("beating the champion on floor 25 clears the run", () => {
    expect(beatBoss(5).cleared).toBe(false);
    expect(beatBoss(25).cleared).toBe(true);
  });
});

describe("ending a run", () => {
  test("retiring ends it", () => {
    expect(retire(start()).phase).toEqual({ name: "over" });
  });

  test("the summary lists the floor reached and each Pokémon's knockouts", () => {
    const run = start();
    run.party[0].kos = 3;
    expect(summarize({ ...run, floor: 8, wins: 6 })).toEqual({
      floor: 8,
      wins: 6,
      cleared: false,
      caught: [],
      party: [
        { dex: 3, kos: 3 },
        { dex: 4, kos: 0 },
      ],
    });
  });
});

describe("what your budget and past runs give you", () => {
  test("every four badges is one starting item", () => {
    expect(startItems(3)).toEqual([]);
    expect(startItems(4).length).toBe(1);
    expect(startItems(13).length).toBe(3);
  });

  test("a category always maps to the same type", () => {
    expect(themeType("Food")).toBe(themeType("Food"));
    expect(themeType("Food")).toBeGreaterThanOrEqual(1);
    expect(themeType("Food")).toBeLessThanOrEqual(18);
  });

  test("perks unlock with the best floor and with clears", () => {
    expect(perksFor({ best: 0, clears: 0, runs: 0 })).toEqual([]);
    expect(perksFor({ best: 5, clears: 0, runs: 1 })).toEqual(["coins"]);
    expect(perksFor({ best: 12, clears: 0, runs: 3 })).toEqual(["coins", "potion"]);
    expect(perksFor({ best: 25, clears: 1, runs: 9 })).toEqual(["coins", "potion", "item", "levels"]);
  });
});

describe("the record past runs leave", () => {
  const history = [
    { floor: 7, wins: 5, cleared: false, caught: [4], party: [{ dex: 3, kos: 4 }, { dex: 4, kos: 1 }] },
    { floor: 26, wins: 22, cleared: true, caught: [], party: [{ dex: 3, kos: 15 }] },
  ];

  test("a career is the best floor, the clears and the number of runs", () => {
    expect(careerOf(history)).toEqual({ best: 26, clears: 1, runs: 2 });
    expect(careerOf([])).toEqual({ best: 0, clears: 0, runs: 0 });
  });

  test("each Pokémon's record adds up its runs, knockouts and best floor", () => {
    const records = recordsOf(history);
    expect(records.get(3)).toEqual({ runs: 2, kos: 19, best: 26 });
    expect(records.get(4)).toEqual({ runs: 1, kos: 1, best: 7 });
    expect(records.get(99)).toBeUndefined();
  });
});

describe("whole runs", () => {
  /** Play a run with random choices until it ends or `limit` steps pass. */
  function playOut(seed: number, limit = 4000): Run {
    const dice = { seed: seed * 7919 };
    let run = start({ partyDex: [1, 3, 4], level: 8 }, seed);
    for (let i = 0; i < limit && run.phase.name !== "over"; i++) {
      const phase = run.phase;
      const before = run;
      if (phase.name === "map") {
        const open = reachable(run);
        run = enterNode(run, open[drawInt(dice, open.length)].id, ctx).run;
      } else if (phase.name === "fight") {
        const b = phase.battle;
        if (b.phase === "choose" || b.phase === "forced") {
          const alive = b.party.map((p, at) => (p.hp > 0 && at !== b.me ? at : -1)).filter((at) => at >= 0);
          const roll = drawInt(dice, 10);
          const action =
            b.phase === "forced" || (roll === 0 && alive.length > 0)
              ? ({ type: "switch", to: alive[drawInt(dice, alive.length)] } as const)
              : roll === 1
                ? ({ type: "potion" } as const)
                : roll === 2 && b.kind === "wild"
                  ? ({ type: "ball" } as const)
                  : ({ type: "move", index: drawInt(dice, 4) } as const);
          run = fightTurn(run, action, ctx).run;
        } else run = afterBattle(run, ctx);
      } else if (phase.name === "reward") run = pickReward(run, drawInt(dice, phase.options.length), ctx);
      else if (phase.name === "give") run = giveItem(run, drawInt(dice, run.party.length));
      else if (phase.name === "teach") run = teachMove(run, drawInt(dice, 4));
      else if (phase.name === "tutor") run = pickTutor(run, drawInt(dice, phase.options.length));
      else if (phase.name === "shop") run = drawInt(dice, 3) === 0 ? leaveShop(run) : buy(run, drawInt(dice, phase.stock.length), ctx);
      else if (phase.name === "event") run = chooseEvent(run, drawInt(dice, 2) as 0 | 1, ctx);

      for (const p of run.party) {
        expect(p.hp).toBeGreaterThanOrEqual(0);
        expect(p.hp).toBeLessThanOrEqual(p.maxHp);
        expect(p.moves.length).toBe(4);
      }
      expect(run.coins).toBeGreaterThanOrEqual(0);
      expect(run.step).toBeGreaterThanOrEqual(before.step);
    }
    return run;
  }

  test("random play never breaks a run, and every run ends", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = playOut(seed);
      expect(run.phase.name).toBe("over");
      expect(run.floor).toBeGreaterThanOrEqual(1);
    }
  });

  test("a run in any phase survives being saved as JSON", () => {
    for (const steps of [1, 5, 20, 60, 150]) {
      const run = playOut(9, steps);
      expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    }
  });
});
