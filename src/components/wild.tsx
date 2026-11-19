/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MAX_DEX, sprite } from "@/lib/partners";
import { play } from "@/lib/sfx";

const FIRST_AFTER_MS = 2500;
const GAP_MS = [4000, 9000]; // quiet time between visitors
const STAY_MS = 14000; // how long one waits before wandering off

type Visitor = { dex: number; key: number };

/**
 * Wild Pokémon turn up in the Home scene at random, where an opponent would stand.
 * Tap one to battle it; weaken it there and throw a ball to catch it.
 */
export function WildPokemon({ balls, caught, names }: { balls: number; caught: number[]; names: string[] }) {
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;

  // Spawn loop: wait, show one, wait again.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      setVisitor({ dex: 1 + Math.floor(Math.random() * MAX_DEX), key: Date.now() });
      play("appear");
      timer = setTimeout(() => {
        setVisitor(null);
        timer = setTimeout(spawn, GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]));
      }, STAY_MS);
    };
    timer = setTimeout(spawn, FIRST_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <span className="ball-count" title="Poké Balls: one for every entry you log, minus Pokémon caught">
        <img src={sprite.item("poke-ball")} alt="Poké Balls" width={24} height={24} className="pixel" />×{balls}
      </span>

      {visitor && (
        <Link
          key={visitor.key}
          href={`/battle?wild=${visitor.dex}`}
          className="wild"
          data-sfx="confirm"
          aria-label={`A wild ${nameOf(visitor.dex)} appeared. Battle it.`}
        >
          <span className="wild-alert" aria-hidden>
            !
          </span>
          <img src={sprite.pokemon(visitor.dex)} alt="" className="pixel sprite" />
          <span className="wild-name">
            {caught.includes(visitor.dex) && (
              <img src={sprite.item("poke-ball")} alt="Already caught" width={20} height={20} className="pixel" />
            )}
            Battle wild {nameOf(visitor.dex)}
          </span>
        </Link>
      )}
    </>
  );
}
