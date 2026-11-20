/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
"use client";

// The expedition screen. The run itself is a plain object moved along by the pure
// steps in lib/run.ts; this file draws whichever phase it is in and saves it after
// every step (to Supabase, or to the browser in demo mode).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { catchPokemon, endRun, saveRun } from "@/lib/actions";
import { openBattle, takeTurn, type Action, type BattleState, type Frame } from "@/lib/battle";
import {
  ABILITIES,
  BOONS,
  FINAL_FLOOR,
  FLOORS_PER_BIOME,
  ITEMS,
  backdrop,
  biomeAt,
  describeMove,
  makeBattler,
  type BattleData,
  type Battler,
  type Move,
} from "@/lib/fight";
import { sprite } from "@/lib/partners";
import { newSeed } from "@/lib/rng";
import {
  EVENTS,
  NODE_INFO,
  PERKS,
  afterBattle,
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
  retire,
  startRun,
  summarize,
  teachMove,
  type Reward,
  type Run,
  type RunSetup,
  type RunSummary,
  type ShopItem,
} from "@/lib/run";
import { play, setMusicTheme } from "@/lib/sfx";
import { BattleWipe, wipeFor, type WipeStyle } from "./battle-wipe";
import { Fight } from "./fight";
import { PartyScreen, Type } from "./party";

// Demo mode keeps the run and its history in this browser.
const RUN_KEY = "expedition-run-v3";
const HISTORY_KEY = "expedition-history";
/** The best floor from before runs were recorded, so an old record still counts. */
const LEGACY_BEST_KEY = "expedition-best";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("expedition-save"));
  } catch {}
};
const subscribe = (callback: () => void) => {
  window.addEventListener("expedition-save", callback);
  return () => window.removeEventListener("expedition-save", callback);
};
const useStored = <T,>(key: string): T | null => {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }, [raw]);
};

type Props = {
  data: BattleData;
  names: string[];
  /** What your budget gives a new run. Perks from past runs are added here. */
  setup: Omit<RunSetup, "perks">;
  /** Plain-language lines explaining how your budget set the numbers above, each with an item sprite. */
  supplies: { icon: string; text: string }[];
  balls: number;
  /** Dex number of a wild Pokémon met on Home: fight it right away, outside a run. */
  wild?: number;
  /** The run in progress and the finished runs, from Supabase. Demo mode reads them from the browser. */
  saved: Run | null;
  history: RunSummary[];
  /** Supabase is connected, so runs are saved there. */
  remote: boolean;
};

/**
 * The expedition, with the wipe that leads into each battle laid over it. The wipe
 * lives out here so that it stays on screen while the route map gives way to the fight.
 */
export function Expedition(props: Props) {
  // A battle met on Home starts with the page, so its wipe only has to open.
  const [wipe, setWipe] = useState<{ style: WipeStyle; begin?: () => void } | null>(props.wild ? { style: "blinds" } : null);
  return (
    <>
      <Screens {...props} onBattle={(style, begin) => setWipe({ style, begin })} />
      {wipe && <BattleWipe style={wipe.style} startCovered={!wipe.begin} onCovered={wipe.begin} onDone={() => setWipe(null)} />}
    </>
  );
}

function Screens({
  data,
  names,
  setup,
  supplies,
  balls,
  wild,
  saved,
  history,
  remote,
  onBattle,
}: Props & {
  /** Play the wipe into a battle, and call `begin` once the screen is covered. */
  onBattle: (style: WipeStyle, begin: () => void) => void;
}) {
  const ctx = useMemo(() => ({ data, names }), [data, names]);
  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;

  const localRun = useStored<Run>(RUN_KEY);
  const localHistory = useStored<RunSummary[]>(HISTORY_KEY);
  const legacyBest = useStored<{ floor: number }>(LEGACY_BEST_KEY);
  const stored = remote ? saved : localRun?.v === 3 ? localRun : null;
  const past = useMemo(() => (remote ? history : (localHistory ?? [])), [remote, history, localHistory]);
  const career = useMemo(() => {
    const c = careerOf(past);
    return { ...c, best: Math.max(c.best, legacyBest?.floor ?? 0) };
  }, [past, legacyBest]);

  // The run being played. Null in the lobby.
  const [run, setRun] = useState<Run | null>(null);
  const latest = useRef<Run | null>(null);
  const [intro, setIntro] = useState<Frame[]>();
  const [battleNo, setBattleNo] = useState(0);

  // A single wild Pokémon met on Home, fought outside any run.
  const [single, setSingle] = useState<{ battle: BattleState; intro: Frame[] } | null>(() => {
    if (!wild) return null;
    const party = setup.partyDex.map((dex) => makeBattler(dex, setup.level, data, nameOf(dex)));
    const foe = makeBattler(wild, Math.max(2, setup.level - 1), data, nameOf(wild));
    const opened = openBattle({ kind: "wild", party, foes: [foe], potions: 1, seed: newSeed() }, data.chart);
    return { battle: opened.state, intro: opened.frames };
  });
  const singleNow = useRef(single?.battle ?? null);
  const [singleText, setSingleText] = useState<string | null>(null);

  const fighting = !!single || run?.phase.name === "fight";
  // Battle music while fighting, the calmer tune otherwise.
  useEffect(() => {
    setMusicTheme(fighting ? "battle" : "town");
    return () => setMusicTheme("town");
  }, [fighting]);

  /** Record a finished run and clear the save. */
  function finish(summary: RunSummary) {
    if (remote) void endRun(summary).catch(() => {});
    else {
      write(RUN_KEY, null);
      write(HISTORY_KEY, [summary, ...past].slice(0, 100));
    }
  }

  /** Show the run's next state and save it. */
  function commit(next: Run) {
    latest.current = next;
    setRun(next);
    if (next.phase.name === "over") finish(summarize(next));
    else if (remote) void saveRun(next).catch(() => {});
    else write(RUN_KEY, next);
  }

  function start() {
    // Starting afresh ends the run that was in progress, and it still counts.
    if (stored) finish(summarize(stored));
    setIntro(undefined);
    commit(startRun({ ...setup, perks: perksFor(career) }, ctx, newSeed()));
  }

  function resume() {
    if (!stored) return;
    latest.current = stored;
    setIntro(undefined);
    setRun(stored);
  }

  function choose(id: number) {
    if (!run) return;
    const kind = run.nodes[id].kind;
    const entered = enterNode(run, id, ctx);
    if (entered.run === run) return;
    const begin = () => {
      setIntro(entered.frames);
      setBattleNo((n) => n + 1);
      commit(entered.run);
    };
    if (entered.run.phase.name !== "fight") {
      if (kind === "rest") play("heal");
      return begin();
    }
    // A battle: flash, close the screen, and only then swap the map for the fight.
    play("encounter");
    onBattle(wipeFor(entered.run.phase.battle.kind, battleNo), begin);
  }

  const onTurn = (action: Action): Frame[] => {
    const turn = fightTurn(latest.current!, action, ctx);
    if (turn.frames.length > 0) commit(turn.run);
    return turn.frames;
  };

  async function onFightEnd(final: BattleState) {
    if (final.phase === "caught") await catchPokemon(final.foes[final.foe].dex).catch(() => null);
    setIntro(undefined);
    commit(afterBattle(latest.current!, ctx));
  }

  // ---- A single wild battle ---------------------------------------------------------

  if (single) {
    return (
      <Fight
        key={`wild-${wild}`}
        battle={single.battle}
        intro={single.intro}
        bg="meadow"
        balls={balls}
        chart={data.chart}
        onTurn={(action) => {
          const turn = takeTurn(singleNow.current!, action, data.chart);
          singleNow.current = turn.state;
          return turn.frames;
        }}
        onEnd={async (final) => {
          const dex = final.foes[final.foe].dex;
          const result = final.phase === "caught" ? await catchPokemon(dex).catch(() => null) : null;
          setSingleText(
            final.phase === "caught"
              ? result?.ok
                ? `${nameOf(dex)} was added to your Pokédex. Put it on your team from the Dex tab.`
                : (result?.message ?? "The catch could not be saved. Try again in a moment.")
              : final.phase === "won"
                ? "The wild Pokémon was beaten. Next time, throw a ball while its HP is low to catch it."
                : final.phase === "lost"
                  ? "Your team needs a rest. Logging entries raises your level, and your team's with it."
                  : "You slipped away.",
          );
          setSingle(null);
        }}
      />
    );
  }

  if (singleText) {
    return (
      <section className="box flex flex-col gap-3">
        <p className="text-xl">{singleText}</p>
        <div className="grid grid-cols-2">
          <Link href="/" className="btn py-3!">
            Back to Home
          </Link>
          <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={() => setSingleText(null)}>
            Go on an expedition
          </button>
        </div>
      </section>
    );
  }

  // ---- The lobby --------------------------------------------------------------------

  if (!run) {
    const lead = setup.partyDex.map((dex) => makeBattler(dex, setup.level, data, nameOf(dex)));
    setup.items.forEach((item, i) => {
      if (lead[i]) lead[i].item = item;
    });
    return (
      <>
        <section className="box p-0!">
          <div className="arena arena-short" style={{ backgroundImage: `url(${backdrop("route")})` }}>
            <p className="window battle-text absolute inset-x-1 bottom-1">
              Climb floor by floor and beat the champion on floor {FINAL_FLOOR}. HP carries over between battles, and
              the run ends when your whole team has fainted.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-4">
            <ul className="facts">
              {supplies.map(({ icon, text }) => (
                <li key={text}>
                  <img src={sprite.item(icon)} alt="" width={30} height={30} className="pixel" />
                  {text}
                </li>
              ))}
            </ul>
            <p className="text-muted">
              Five floors an area, a gym battle at the end. Pokémon you catch join the run.
            </p>
            <div className="flex flex-wrap justify-end">
              {stored && stored.phase.name !== "over" && (
                <button className="btn py-3!" data-sfx="confirm" onClick={resume}>
                  Continue from floor {stored.floor}
                </button>
              )}
              <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={start}>
                Start a new expedition
              </button>
            </div>
          </div>
        </section>

        <section className="box">
          <header className="panel-title">
            <h2>Record</h2>
            <span>
              {career.runs} {career.runs === 1 ? "run" : "runs"}
            </span>
          </header>
          <p>
            {career.best > 0 ? `Best floor: ${career.best}.` : "No runs finished yet."}
            {career.clears > 0 && ` Champion beaten ${career.clears} ${career.clears === 1 ? "time" : "times"}.`}
          </p>
          <ul className="perks mt-2">
            {PERKS.map((perk) => {
              const has = perk.has(career);
              return (
                <li key={perk.id} className={has ? "" : "locked"}>
                  <span>
                    {perk.name}: {perk.text}
                  </span>
                  <span className={has ? "text-green" : ""}>{has ? "Unlocked" : perk.how}</span>
                </li>
              );
            })}
          </ul>
          {past.length > 0 && (
            <ul className="entries mt-3">
              {past.slice(0, 5).map((h, i) => (
                <li key={i}>
                  <span className="text-muted">Floor {h.floor}</span>
                  <span className="flex items-center truncate">
                    {h.party.map((p, j) => (
                      <img key={j} src={sprite.icon(p.dex)} alt={nameOf(p.dex)} title={`${nameOf(p.dex)}: ${p.kos} knockouts`} width={40} height={30} className="pixel" />
                    ))}
                  </span>
                  <span className="amount">{h.cleared ? "Cleared" : `${h.wins} ${h.wins === 1 ? "win" : "wins"}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <TeamList party={lead} />
      </>
    );
  }

  // ---- A run in progress ------------------------------------------------------------

  const { phase } = run;
  const biome = biomeAt(run.floor);
  const news = run.news.length > 0 && (
    <ul className="box flex flex-col gap-1" role="status">
      {run.news.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );

  if (phase.name === "fight") {
    return (
      <>
        <RunBar run={run} biome={biome.name} />
        <Fight
          key={battleNo}
          battle={phase.battle}
          intro={intro}
          rival={phase.rival}
          bg={biome.bg}
          balls={balls}
          chart={data.chart}
          onTurn={onTurn}
          onEnd={onFightEnd}
        />
      </>
    );
  }

  if (phase.name === "over") {
    return (
      <section className="box flex flex-col gap-3">
        <header className="panel-title">
          <h2>{run.cleared ? "Expedition cleared" : "Expedition over"}</h2>
        </header>
        <p className="text-xl">
          {run.party.some((p) => p.hp > 0) ? "You headed home from" : "Your team blacked out on"} floor {run.floor} in{" "}
          {biome.name}, after {run.wins} {run.wins === 1 ? "win" : "wins"}
          {run.caught.length > 0 && ` and ${run.caught.length} ${run.caught.length === 1 ? "catch" : "catches"}`}.
        </p>
        <p className="text-muted">Best so far: floor {Math.max(career.best, run.floor)}.</p>
        {run.caught.length > 0 && (
          <p className="flex flex-wrap items-center">
            Caught this run:
            {run.caught.map((dex, i) => (
              <img key={i} src={sprite.icon(dex)} alt={nameOf(dex)} title={nameOf(dex)} width={40} height={30} className="pixel" />
            ))}
          </p>
        )}
        <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={() => setRun(null)}>
          Back to camp
        </button>
      </section>
    );
  }

  const step = (next: Run, sound?: Parameters<typeof play>[0]) => {
    if (next === run) return play("error");
    if (sound) play(sound);
    commit(next);
  };

  let body: React.ReactNode;
  if (phase.name === "map") {
    const row = ((run.floor - 1) % FLOORS_PER_BIOME) + 1;
    const open = reachable(run).map((n) => n.id);
    const rows = [1, 2, 3, 4, 5].map((r) => run.nodes.filter((n) => n.row === r));
    const untilBoss = FLOORS_PER_BIOME - row;
    body = (
      <section className="box p-0!">
        <div className="arena arena-short" style={{ backgroundImage: `url(${backdrop(biome.bg)})` }}>
          <p className="window battle-text absolute inset-x-1 bottom-1">
            Floor {run.floor}: {biome.name}.{" "}
            {untilBoss === 0
              ? run.floor % FINAL_FLOOR === 0
                ? "The champion is waiting."
                : "The gym leader is waiting."
              : `Gym battle in ${untilBoss} ${untilBoss === 1 ? "floor" : "floors"}.`}
          </p>
        </div>
        <div className="route" aria-label="Route through this area">
          {rows.map((stops, i) => (
            <div key={i} className={`route-row ${i + 1 === row ? "now" : ""}`} style={{ "--stops": stops.length } as CSSProperties}>
              <span className="route-floor">F{run.floor - row + i + 1}</span>
              {stops.map((node) => {
                const info = NODE_INFO[node.kind];
                const face = (
                  <>
                    <span>
                      <img src={sprite.item(info.icon)} alt="" width={24} height={24} className="pixel" />
                      {info.title}
                    </span>
                    <span className="stop-text">{info.text}</span>
                  </>
                );
                if (open.includes(node.id)) {
                  const then = [...new Set(node.next.map((id) => NODE_INFO[run.nodes[id].kind].title))];
                  return (
                    <button key={node.id} className="stop" data-sfx={node.kind === "boss" ? "boss" : "confirm"} onClick={() => choose(node.id)}>
                      {face}
                      {then.length > 0 && <span className="stop-then">Leads to: {then.join(" or ")}</span>}
                    </button>
                  );
                }
                const state = node.id === run.at ? "done" : node.row < row ? "off" : "far";
                return (
                  <div key={node.id} className={`stop ${state}`}>
                    {face}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-end p-2">
          <button className="btn" data-sfx="page" onClick={() => step(retire(run))}>
            Head home and end the run
          </button>
        </div>
      </section>
    );
  } else if (phase.name === "reward") {
    body = (
      <Choices title={phase.note}>
        {phase.options.map((reward, i) => (
          <RewardButton key={i} reward={reward} party={run.party} onClick={() => step(pickReward(run, i, ctx), "boon")} />
        ))}
      </Choices>
    );
  } else if (phase.name === "give") {
    const item = ITEMS[phase.item];
    body = (
      <section className="box flex flex-col gap-2">
        <header className="panel-title">
          <h2>Who should hold it?</h2>
        </header>
        <p className="flex items-center gap-2">
          <img src={sprite.item(phase.item)} alt="" width={30} height={30} className="pixel" />
          {item.name}: {item.text} A Pokémon holds one item; a new one replaces the old.
        </p>
        <PartyScreen party={run.party} onPick={(who) => step(giveItem(run, who), "confirm")} pickFainted />
        <button className="window menu-item w-auto!" data-sfx="page" onClick={() => step(giveItem(run, null))}>
          Leave it behind
        </button>
      </section>
    );
  } else if (phase.name === "teach") {
    const learner = run.party[phase.who];
    body = (
      <Choices title={`${learner.name} can learn ${phase.move.name}`}>
        <p className="window sm:col-span-3">
          <MoveLine move={phase.move} />
        </p>
        {learner.moves.map((move, slot) => (
          <button key={move.name} className="window menu-item path" data-sfx="none" onClick={() => step(teachMove(run, slot), "boon")}>
            <span>Forget {move.name}</span>
            <MoveLine move={move} />
          </button>
        ))}
        <button className="window menu-item path" data-sfx="page" onClick={() => step(teachMove(run, null))}>
          <span>Keep the old moves</span>
          <span className="font-body text-lg leading-tight text-muted">{phase.move.name} is not learned.</span>
        </button>
      </Choices>
    );
  } else if (phase.name === "tutor") {
    body = (
      <Choices title="The move tutor offers one lesson">
        {phase.options.map((offer, i) => (
          <RewardButton key={i} reward={{ kind: "move", ...offer }} party={run.party} onClick={() => step(pickTutor(run, i))} />
        ))}
        <button className="window menu-item path" data-sfx="page" onClick={() => step(pickTutor(run, null))}>
          <span>No thanks</span>
          <span className="font-body text-lg leading-tight text-muted">Move on without a lesson.</span>
        </button>
      </Choices>
    );
  } else if (phase.name === "shop") {
    body = (
      <Choices title="Poké Mart" aside={`${run.coins} coins`}>
        {phase.stock.map((stock, i) => (
          <ShopButton key={i} stock={stock} run={run} onClick={() => step(buy(run, i, ctx), "coin")} />
        ))}
        <button className="window menu-item path" data-sfx="page" onClick={() => step(leaveShop(run))}>
          <span>Leave</span>
          <span className="font-body text-lg leading-tight text-muted">Carry on to the next floor.</span>
        </button>
      </Choices>
    );
  } else {
    const event = EVENTS[phase.id];
    body = (
      <Choices title="Something odd">
        <p className="window battle-text sm:col-span-3">{event.text}</p>
        {event.choices.map((label, i) => (
          <button key={label} className="window menu-item path" data-sfx="confirm" onClick={() => step(chooseEvent(run, i as 0 | 1, ctx))}>
            <span>{label}</span>
          </button>
        ))}
      </Choices>
    );
  }

  return (
    <>
      <RunBar run={run} biome={biome.name} />
      {news}
      {body}
      {phase.name !== "give" && <TeamList party={run.party} />}
    </>
  );
}

/** A titled grid of choices, three across on a wide screen. */
function Choices({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="box">
      <header className="panel-title">
        <h2>{title}</h2>
        {aside && <span>{aside}</span>}
      </header>
      <div className="grid gap-2 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function MoveLine({ move }: { move: Move }) {
  return (
    <span className="flex flex-wrap items-center gap-2 font-body text-lg leading-tight text-muted">
      <Type id={move.type} />
      {describeMove(move)}
    </span>
  );
}

function RewardButton({ reward, party, onClick }: { reward: Reward; party: Battler[]; onClick: () => void }) {
  let icon: string;
  let name: string;
  let rare: boolean;
  let detail: React.ReactNode;
  if (reward.kind === "boon") {
    const boon = BOONS.find((b) => b.id === reward.id)!;
    [icon, name, rare] = [boon.id, boon.name, boon.rare];
    detail = <span className="font-body text-lg leading-tight text-muted">{boon.text}</span>;
  } else if (reward.kind === "item") {
    const item = ITEMS[reward.id];
    [icon, name, rare] = [reward.id, item.name, item.rare];
    detail = <span className="font-body text-lg leading-tight text-muted">Held item. {item.text}</span>;
  } else {
    [icon, name, rare] = ["tm-normal", `${reward.move.name} for ${party[reward.who].name}`, !!reward.move.rare];
    detail = <MoveLine move={reward.move} />;
  }
  return (
    <button className="window menu-item path" data-sfx="none" onClick={onClick}>
      <span className="flex w-full items-center gap-2">
        <img src={sprite.item(icon)} alt="" width={30} height={30} className="pixel" />
        {name}
        {rare && <span className="rare-tag">Rare</span>}
      </span>
      {detail}
    </button>
  );
}

const SHOP_BASICS = {
  potion: { name: "Potion", text: "Heals half of one Pokémon's HP in battle." },
  revive: { name: "Revive", text: "Brings the first fainted Pokémon back at half HP." },
  "rare-candy": { name: "Rare Candy", text: "+1 level for the whole team." },
};

function ShopButton({ stock, run, onClick }: { stock: ShopItem; run: Run; onClick: () => void }) {
  const info = stock.id in SHOP_BASICS ? SHOP_BASICS[stock.id as keyof typeof SHOP_BASICS] : ITEMS[stock.id as keyof typeof ITEMS];
  const noUse = stock.id === "revive" && run.party.every((p) => p.hp > 0);
  return (
    <button className="window menu-item path" data-sfx="none" disabled={stock.sold || noUse || run.coins < stock.price} onClick={onClick}>
      <span className="flex w-full items-center gap-2">
        <img src={sprite.item(stock.id)} alt="" width={30} height={30} className="pixel" />
        {info.name}
        <span className="ml-auto">{stock.sold ? "Sold" : `${stock.price}c`}</span>
      </span>
      <span className="font-body text-lg leading-tight text-muted">{noUse ? "Nobody has fainted." : info.text}</span>
    </button>
  );
}

/** Floor, area, coins, potions and upgrades for the run in progress. */
function RunBar({ run, biome }: { run: Run; biome: string }) {
  const owned = BOONS.filter((b) => run.boons[b.id]);
  return (
    <section className="box hud items-center" aria-label="Expedition status">
      <div>
        <span className="text-muted">Floor {run.floor}</span>
        <strong>{biome}</strong>
      </div>
      <div>
        <span className="text-muted">Supplies</span>
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="flex items-center" title={run.amulet ? "Coins. Your Amulet Coin adds half again to every win." : "Coins"}>
            <img src={sprite.item(run.amulet ? "amulet-coin" : "nugget")} alt="Coins" width={24} height={24} className="pixel" />
            {run.coins}
          </span>
          <span className="flex items-center">
            <img src={sprite.item("potion")} alt="Potions" width={24} height={24} className="pixel" />×{run.potions}
          </span>
          {owned.map((b) => (
            <span key={b.id} className="flex items-center" title={`${b.name}: ${b.text}`}>
              <img src={sprite.item(b.id)} alt={b.name} width={24} height={24} className="pixel" />
              {run.boons[b.id]! > 1 && `×${run.boons[b.id]}`}
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}

function TeamList({ party }: { party: Battler[] }) {
  return (
    <section className="box">
      <header className="panel-title">
        <h2>Pokémon</h2>
        <span>Lv {party[0]?.level}</span>
      </header>
      <PartyScreen party={party} note={(i) => ABILITIES[party[i].ability].name || undefined} />
    </section>
  );
}
