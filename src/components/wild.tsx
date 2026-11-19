/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs */
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { catchPokemon } from "@/lib/actions";
import { MAX_DEX, sprite } from "@/lib/partners";
import { cry, play } from "@/lib/sfx";

const FIRST_AFTER_MS = 3500;
const GAP_MS = [5000, 11000]; // quiet time between visitors
const STAY_MS = 11000; // how long one takes to cross the scene (matches .wild in globals.css)
const THROW_MS = 1900;

type Visitor = { dex: number; key: number; state: "walking" | "ball" | "gone" };

/**
 * Wild Pokémon wander through the Home scene at random. Tap one to throw a
 * Poké Ball; each entry you log earns one ball. Caught Pokémon go to the Dex tab.
 */
export function WildPokemon({ balls, caught, names }: { balls: number; caught: number[]; names: string[] }) {
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;
  const say = (text: string) => {
    setMessage(text);
    later(() => setMessage(""), 3200);
  };

  // Spawn loop: wait, send one across, wait again.
  useEffect(() => {
    const pending = timers.current;
    const spawn = () => {
      const dex = 1 + Math.floor(Math.random() * MAX_DEX);
      const key = Date.now();
      setVisitor({ dex, key, state: "walking" });
      play("appear");
      later(() => {
        // Leave quietly unless it is mid-catch.
        setVisitor((v) => (v?.key === key && v.state === "walking" ? null : v));
        later(spawn, GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]));
      }, STAY_MS);
    };
    later(spawn, FIRST_AFTER_MS);
    return () => pending.forEach(clearTimeout);
  }, []);

  function onTap(v: Visitor) {
    if (v.state !== "walking") return;
    if (caught.includes(v.dex)) {
      cry(v.dex);
      return say(`${nameOf(v.dex)} is already in your Pokédex.`);
    }
    if (balls <= 0) {
      play("error");
      return say("No Poké Balls left! Log an entry to earn one.");
    }
    play("throw");
    setVisitor({ ...v, state: "ball" });
    startTransition(async () => {
      const [result] = await Promise.all([catchPokemon(v.dex), new Promise((done) => setTimeout(done, THROW_MS))]);
      setVisitor((now) => (now?.key === v.key ? null : now));
      if (result.ok) {
        play("caught");
        say(`Gotcha! ${nameOf(v.dex)} was caught!`);
      } else {
        play("error");
        say(result.message ?? `${nameOf(v.dex)} broke free!`);
      }
    });
  }

  return (
    <>
      <span className="ball-count" title="Poké Balls: one for every entry you log, minus Pokémon caught">
        <img src={sprite.item("poke-ball")} alt="Poké Balls" width={24} height={24} className="pixel" />×{balls}
      </span>

      {visitor && (
        <button
          key={visitor.key}
          type="button"
          className={`wild ${visitor.state === "ball" ? "caught" : ""}`}
          data-sfx="none"
          aria-label={`A wild ${nameOf(visitor.dex)}. Throw a Poké Ball.`}
          onClick={() => onTap(visitor)}
        >
          {visitor.state === "ball" ? (
            <img src={sprite.item("poke-ball")} alt="" width={48} height={48} className="pixel wobble" />
          ) : (
            <img src={sprite.pokemon(visitor.dex)} alt="" className="pixel h-16" />
          )}
        </button>
      )}

      {message && (
        <p className="scene-toast" role="status">
          {message}
        </p>
      )}
    </>
  );
}
