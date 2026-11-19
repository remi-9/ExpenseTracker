/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
"use client";

// The roguelike: climb floor by floor, choosing a path each time. HP carries over
// between battles, trainers and gym leaders hand out upgrades, caught Pokémon join
// the team, and the run ends when everyone has fainted.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  biomeAt,
  BOONS,
  boostsFrom,
  buildEncounter,
  backdrop,
  FLOORS_PER_BIOME,
  makeBattler,
  pathsFor,
  randomBoons,
  type BattleData,
  type Battler,
  type BoonId,
  type Boons,
  type Encounter,
  type PathNode,
} from "@/lib/fight";
import { sprite } from "@/lib/partners";
import { play, setMusicTheme } from "@/lib/sfx";
import { Fight, type FightResult } from "./fight";
import { PartyScreen } from "./party";

type Run = {
  floor: number;
  /** Team level: starts from your trainer level and rises by one per battle won. */
  level: number;
  party: Battler[];
  potions: number;
  boons: Boons;
  wins: number;
  caught: number[];
};

type Phase =
  | { name: "lobby" }
  | { name: "map"; paths: PathNode[] }
  | { name: "fight"; encounter: Encounter; nonce: number }
  | { name: "boon"; options: BoonId[]; note: string }
  | { name: "over" }
  | { name: "single"; text: string };

type Best = { floor: number; wins: number };

// Saved in this browser: the run in progress and your best result.
const RUN_KEY = "expedition-run";
const BEST_KEY = "expedition-best";
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
const useSaved = <T,>(key: string): T | null => {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  return raw ? (JSON.parse(raw) as T) : null;
};

export function Expedition({
  data,
  names,
  partyDex,
  level,
  potions,
  tired,
  supplies,
  balls,
  wild,
}: {
  data: BattleData;
  names: string[];
  /** Your partner first, then your team. */
  partyDex: number[];
  /** Battle level your team starts at. */
  level: number;
  /** Potions you start a run with. */
  potions: number;
  /** An overspent month: the team starts a run at 70% HP. */
  tired: boolean;
  /** Plain-language lines explaining how your budget set the numbers above. */
  supplies: string[];
  balls: number;
  /** Dex number of a wild Pokémon met on Home: fight it right away, outside a run. */
  wild?: number;
}) {
  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;
  const fresh = (dexes: number[], lv: number, boons: Boons = {}) =>
    dexes.map((dex) => makeBattler(dex, lv, data, nameOf(dex), boostsFrom(boons)));

  const [run, setRun] = useState<Run>(() => ({
    floor: 1,
    level,
    party: fresh(partyDex, level),
    potions,
    boons: {},
    wins: 0,
    caught: [],
  }));
  const [phase, setPhase] = useState<Phase>(() =>
    wild
      ? {
          name: "fight",
          nonce: 0,
          encounter: { kind: "wild", foes: [makeBattler(wild, Math.max(2, level - 1), data, nameOf(wild))] },
        }
      : { name: "lobby" },
  );
  const [ballsLeft, setBallsLeft] = useState(balls);
  const saved = useSaved<Run>(RUN_KEY);
  const best = useSaved<Best>(BEST_KEY);
  // True while fighting the one wild Pokémon met on Home, before any expedition starts.
  const [single, setSingle] = useState(!!wild);

  // Battle music while fighting, the calmer tune otherwise.
  useEffect(() => {
    setMusicTheme(phase.name === "fight" ? "battle" : "town");
    return () => setMusicTheme("town");
  }, [phase.name]);

  /** The same team at a new level or with new upgrades, keeping each member's share of HP. */
  const rebuild = (party: Battler[], lv: number, boons: Boons) =>
    party.map((p) => {
      const next = makeBattler(p.dex, lv, data, p.name, boostsFrom(boons));
      return { ...next, hp: Math.ceil((p.hp / p.maxHp) * next.maxHp) };
    });

  function toMap(next: Run) {
    setSingle(false);
    setRun(next);
    write(RUN_KEY, next);
    if (next.floor > (best?.floor ?? 0)) write(BEST_KEY, { floor: next.floor, wins: Math.max(next.wins, best?.wins ?? 0) });
    setPhase({ name: "map", paths: pathsFor(next.floor) });
  }

  function start() {
    const party = fresh(partyDex, level).map((p) => (tired ? { ...p, hp: Math.ceil(p.maxHp * 0.7) } : p));
    toMap({ floor: 1, level, party, potions, boons: {}, wins: 0, caught: [] });
  }

  function choose(node: PathNode) {
    if (node.kind === "rest") {
      play("heal");
      const party = run.party.map((p) => ({ ...p, hp: Math.min(p.maxHp, Math.max(p.hp, 0) + Math.ceil(p.maxHp / 2)) }));
      return toMap({ ...run, party, floor: run.floor + 1 });
    }
    if (node.kind === "item") {
      play("coin");
      return toMap({ ...run, potions: run.potions + 1, floor: run.floor + 1 });
    }
    setPhase({ name: "fight", nonce: run.floor, encounter: buildEncounter(node.kind, run.floor, level, data, names) });
  }

  function onFightEnd(result: FightResult) {
    if (phase.name !== "fight") return;
    if (result.caught) setBallsLeft((n) => Math.max(0, n - 1));

    if (single) {
      const text =
        result.outcome === "caught"
          ? `${nameOf(result.caught!)} was added to your Pokédex. Put it on your team from the Dex tab.`
          : result.outcome === "win"
            ? "The wild Pokémon was beaten. Next time, throw a ball while its HP is low to catch it."
            : result.outcome === "lose"
              ? "Your team needs a rest. Logging entries raises your level, and your team's with it."
              : "You slipped away.";
      return setPhase({ name: "single", text });
    }

    if (result.outcome === "lose") {
      write(RUN_KEY, null);
      setRun({ ...run, party: result.party });
      return setPhase({ name: "over" });
    }

    const won = result.outcome === "win";
    const lv = Math.min(100, run.level + (won ? 1 : 0));
    // The team catches its breath after every battle: 15% HP back for anyone still standing.
    let party = rebuild(result.party, lv, run.boons).map((p) =>
      p.hp > 0 ? { ...p, hp: Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.15)) } : p,
    );
    // A caught Pokémon joins the run if there is room.
    if (result.caught && party.length < 6) party = [...party, makeBattler(result.caught, lv, data, nameOf(result.caught), boostsFrom(run.boons))];
    const next: Run = {
      ...run,
      level: lv,
      party,
      potions: result.potions,
      wins: run.wins + (won ? 1 : 0),
      caught: result.caught ? [...run.caught, result.caught] : run.caught,
    };

    const { kind } = phase.encounter;
    if (won && kind !== "wild") {
      if (kind === "boss") next.party = next.party.map((p) => ({ ...p, hp: p.maxHp }));
      setRun(next);
      return setPhase({
        name: "boon",
        options: randomBoons(3),
        note: kind === "boss" ? "The gym leader healed your team. Choose a reward." : "Choose a reward.",
      });
    }
    toMap({ ...next, floor: next.floor + 1 });
  }

  function takeBoon(id: BoonId) {
    play("boon");
    const next: Run = { ...run, floor: run.floor + 1 };
    if (id === "rare-candy") next.level = Math.min(100, run.level + 3);
    else if (id === "potion") next.potions = run.potions + 2;
    else if (id !== "max-revive") next.boons = { ...run.boons, [id]: (run.boons[id] ?? 0) + 1 };
    next.party = rebuild(run.party, next.level, next.boons);
    if (id === "max-revive") next.party = next.party.map((p) => ({ ...p, hp: p.maxHp }));
    toMap(next);
  }

  const biome = biomeAt(run.floor);

  // ---- Screens ---------------------------------------------------------------------

  if (phase.name === "fight") {
    return (
      <>
        {!single && <RunBar run={run} biome={biome.name} />}
        <Fight
          key={phase.nonce}
          encounter={phase.encounter}
          bg={single ? "meadow" : biome.bg}
          party={run.party}
          potions={single ? 1 : run.potions}
          balls={ballsLeft}
          boons={run.boons}
          chart={data.chart}
          onEnd={onFightEnd}
        />
      </>
    );
  }

  if (phase.name === "single") {
    return (
      <section className="box flex flex-col gap-3">
        <p className="text-xl">{phase.text}</p>
        <div className="grid grid-cols-2">
          <Link href="/" className="btn py-3!">
            Back to Home
          </Link>
          <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={() => setPhase({ name: "lobby" })}>
            Go on an expedition
          </button>
        </div>
      </section>
    );
  }

  if (phase.name === "map") {
    const untilBoss = FLOORS_PER_BIOME - (run.floor % FLOORS_PER_BIOME || FLOORS_PER_BIOME);
    return (
      <>
        <RunBar run={run} biome={biome.name} />
        <section className="box p-0!">
          <div className="arena arena-short" style={{ backgroundImage: `url(${backdrop(biome.bg)})` }}>
            <p className="battle-text absolute inset-x-2 bottom-2">
              Floor {run.floor}: {biome.name}.{" "}
              {untilBoss === 0 ? "The gym leader is waiting." : `Gym battle in ${untilBoss} ${untilBoss === 1 ? "floor" : "floors"}.`}
            </p>
          </div>
          <div className="grid gap-0 p-2 sm:grid-cols-3">
            {phase.paths.map((node) => (
              <button
                key={node.kind}
                className="window menu-item path"
                data-sfx={node.kind === "boss" ? "boss" : "confirm"}
                onClick={() => choose(node)}
              >
                <span className="flex items-center gap-2">
                  <img src={sprite.item(node.icon)} alt="" width={30} height={30} className="pixel" />
                  {node.title}
                </span>
                <span className="font-body text-lg leading-tight text-muted">{node.text}</span>
              </button>
            ))}
          </div>
        </section>
        <TeamList party={run.party} />
      </>
    );
  }

  if (phase.name === "boon") {
    return (
      <>
        <RunBar run={run} biome={biome.name} />
        <section className="box">
          <header className="panel-title">
            <h2>{phase.note}</h2>
          </header>
          <div className="grid sm:grid-cols-3">
            {phase.options.map((id) => {
              const boon = BOONS.find((b) => b.id === id)!;
              return (
                <button key={id} className="window menu-item path" data-sfx="none" onClick={() => takeBoon(id)}>
                  <span className="flex items-center gap-2">
                    <img src={sprite.item(id)} alt="" width={30} height={30} className="pixel" />
                    {boon.name}
                  </span>
                  <span className="font-body text-lg leading-tight text-muted">{boon.text}</span>
                </button>
              );
            })}
          </div>
        </section>
        <TeamList party={run.party} />
      </>
    );
  }

  if (phase.name === "over") {
    return (
      <section className="box flex flex-col gap-3">
        <header className="panel-title">
          <h2>Expedition over</h2>
        </header>
        <p className="text-xl">
          Your team blacked out on floor {run.floor} in {biome.name}, after {run.wins} {run.wins === 1 ? "win" : "wins"}
          {run.caught.length > 0 && ` and ${run.caught.length} ${run.caught.length === 1 ? "catch" : "catches"}`}.
        </p>
        {best && <p className="text-muted">Best so far: floor {best.floor}.</p>}
        {run.caught.length > 0 && (
          <p className="flex flex-wrap items-center">
            Caught this run:
            {run.caught.map((dex, i) => (
              <img key={i} src={sprite.icon(dex)} alt={nameOf(dex)} title={nameOf(dex)} width={40} height={30} className="pixel" />
            ))}
          </p>
        )}
        <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={start}>
          Try again
        </button>
      </section>
    );
  }

  // Lobby
  return (
    <>
      <section className="box p-0!">
        <div className="arena arena-short" style={{ backgroundImage: `url(${backdrop("route")})` }}>
          <p className="battle-text absolute inset-x-2 bottom-2">
            Climb as far as you can. HP carries over between battles, and the run ends when your whole team has fainted.
          </p>
        </div>
        <div className="flex flex-col gap-3 p-3">
          <ul className="flex flex-col gap-1">
            {supplies.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="star mt-3 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-muted">
            Every fifth floor is a gym battle. Trainers and gym leaders give upgrades; wild Pokémon you catch join the
            run, so a small team should head for tall grass first. {best ? `Your best: floor ${best.floor}.` : ""}
          </p>
          <div className="grid gap-0 sm:grid-cols-2">
            {saved && (
              <button className="btn py-3!" data-sfx="confirm" onClick={() => toMap(saved)}>
                Continue from floor {saved.floor}
              </button>
            )}
            <button className="btn btn-primary py-3!" data-sfx="confirm" onClick={start}>
              Start a new expedition
            </button>
          </div>
        </div>
      </section>
      <TeamList party={fresh(partyDex, level)} />
    </>
  );
}

/** Floor, area, potions and upgrades for the run in progress. */
function RunBar({ run, biome }: { run: Run; biome: string }) {
  const owned = BOONS.filter((b) => run.boons[b.id]);
  return (
    <section className="box hud items-center" aria-label="Expedition status">
      <div>
        <span className="text-muted">Floor</span>
        <strong>
          {run.floor} · {biome}
        </strong>
      </div>
      <div>
        <span className="text-muted">Supplies</span>
        <span className="flex flex-wrap items-center gap-x-2">
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
      <PartyScreen party={party} />
    </section>
  );
}
