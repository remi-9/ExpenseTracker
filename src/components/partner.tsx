/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs; next/image adds nothing */
"use client";

import { useState } from "react";
import { choosePartner, chooseTrainer } from "@/lib/actions";
import { PARTNERS, sprite, TRAINERS } from "@/lib/partners";
import { cry, play } from "@/lib/sfx";

export type Mood = "happy" | "worried" | "fainted";

/**
 * The partner's animated sprite. Click to pet it: it jumps, shows a heart
 * and (when sound is on) plays its cry. Shiny partners get sparkles.
 */
export function PartnerSprite({
  dex,
  name,
  mood = "happy",
  shiny = false,
  height = 112,
}: {
  dex: number;
  name: string;
  mood?: Mood;
  shiny?: boolean;
  height?: number;
}) {
  const [pets, setPets] = useState(0);
  return (
    <button
      type="button"
      className="relative block"
      data-sfx="none"
      aria-label={`${shiny ? "Shiny " : ""}${name} looks ${mood}. Pet it.`}
      onClick={() => {
        play(shiny ? "shiny" : "pet");
        cry(dex);
        setPets((n) => n + 1);
      }}
    >
      {/* Re-keyed on every pet so the jump animation restarts. */}
      <span key={pets} className={`block ${pets ? "pet-jump" : ""}`}>
        <img src={sprite.pokemon(dex, shiny)} alt="" style={{ height }} className={`pixel mood-${mood}`} />
      </span>
      {pets > 0 && (
        <span key={`heart-${pets}`} className="emote" aria-hidden>
          ♥
        </span>
      )}
      {shiny && (
        <>
          <span className="sparkle" style={{ left: "0%", top: "5%" }} aria-hidden />
          <span className="sparkle" style={{ right: "0%", top: "40%", animationDelay: "0.6s" }} aria-hidden />
          <span className="sparkle" style={{ left: "30%", bottom: "0%", animationDelay: "1.1s" }} aria-hidden />
        </>
      )}
    </button>
  );
}

/**
 * Partner selection: the twelve starter lines (which evolve as you level up),
 * plus any Pokémon you have caught. Posts to a cookie-setting server action.
 */
export function PartnerPicker({
  current,
  caught = [],
  names = [],
}: {
  current?: string;
  caught?: number[];
  names?: string[];
}) {
  return (
    <form action={choosePartner} className="flex flex-col gap-3">
      <div className="grid grid-cols-3 sm:grid-cols-4">
        {PARTNERS.map((p) => (
          <button
            key={p.id}
            name="partner"
            value={p.id}
            data-sfx="confirm"
            className={`btn flex-col gap-0! px-1! ${p.id === current ? "btn-selected" : ""}`}
            aria-pressed={p.id === current}
          >
            <img src={sprite.still(p.stages[0].dex)} alt="" width={64} height={64} className="pixel" />
            <span className="max-w-full truncate">{p.stages[0].name}</span>
          </button>
        ))}
      </div>
      {caught.length > 0 && (
        <div>
          <p className="mb-1 text-muted">Or one you caught (these stay as they are):</p>
          <div className="flex flex-wrap">
            {caught.map((dex) => (
              <button
                key={dex}
                name="partner"
                value={`dex:${dex}`}
                data-sfx="confirm"
                title={names[dex - 1] ?? `No. ${dex}`}
                aria-label={names[dex - 1] ?? `No. ${dex}`}
                aria-pressed={current === `dex:${dex}`}
                className={`btn p-1! ${current === `dex:${dex}` ? "btn-selected" : ""}`}
              >
                <img src={sprite.icon(dex)} alt="" width={40} height={30} className="pixel" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

/** Choose which famous trainer represents you. */
export function TrainerPicker({ current }: { current: string }) {
  return (
    <form action={chooseTrainer} className="grid grid-cols-4 sm:grid-cols-5">
      {TRAINERS.map((t) => (
        <button
          key={t.id}
          name="trainer"
          value={t.id}
          data-sfx="confirm"
          className={`btn flex-col gap-0! px-1! ${t.id === current ? "btn-selected" : ""}`}
          aria-pressed={t.id === current}
        >
          <img src={sprite.trainer(t.id)} alt="" width={64} height={64} className="pixel" loading="lazy" />
          <span className="max-w-full truncate">{t.name}</span>
        </button>
      ))}
    </form>
  );
}
