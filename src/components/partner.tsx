/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs; next/image adds nothing */
"use client";

import { useState } from "react";
import { choosePartner } from "@/lib/actions";
import { PARTNERS, sprite } from "@/lib/partners";
import { cry } from "@/lib/sfx";

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
      aria-label={`${shiny ? "Shiny " : ""}${name} looks ${mood}. Pet it.`}
      onClick={() => {
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

/** Starter selection. Posts the choice to a cookie-setting server action. */
export function PartnerPicker({ current }: { current?: string }) {
  return (
    <form action={choosePartner} className="grid grid-cols-3 sm:grid-cols-4">
      {PARTNERS.map((p) => (
        <button
          key={p.id}
          name="partner"
          value={p.id}
          className={`btn flex-col gap-0! px-1! ${p.id === current ? "btn-selected" : ""}`}
          aria-pressed={p.id === current}
        >
          <img src={sprite.still(p.stages[0].dex)} alt="" width={64} height={64} className="pixel" />
          <span className="max-w-full truncate">{p.stages[0].name}</span>
        </button>
      ))}
    </form>
  );
}
