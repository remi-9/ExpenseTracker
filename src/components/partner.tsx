/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs; next/image adds nothing */
"use client";

import { choosePartner } from "@/lib/actions";
import { PARTNERS, sprite } from "@/lib/partners";
import { cry } from "@/lib/sfx";

export type Mood = "happy" | "worried" | "fainted";

/** The partner's animated sprite. Click it to hear its cry (when sound is on). */
export function PartnerSprite({
  dex,
  name,
  mood = "happy",
  height = 112,
}: {
  dex: number;
  name: string;
  mood?: Mood;
  height?: number;
}) {
  return (
    <button type="button" onClick={() => cry(dex)} aria-label={`${name} looks ${mood}. Play its cry.`} className="block">
      <img src={sprite.pokemon(dex)} alt="" style={{ height }} className={`pixel mood-${mood}`} />
    </button>
  );
}

/** Starter selection. Posts the choice to a cookie-setting server action. */
export function PartnerPicker({ current }: { current?: string }) {
  return (
    <form action={choosePartner} className="grid grid-cols-3 sm:grid-cols-6">
      {PARTNERS.map((p) => (
        <button
          key={p.id}
          name="partner"
          value={p.id}
          className={`btn flex-col gap-0! px-1! ${p.id === current ? "btn-selected" : ""}`}
          aria-pressed={p.id === current}
        >
          <img src={sprite.still(p.stages[0].dex)} alt="" width={64} height={64} className="pixel" />
          {p.stages[0].name}
        </button>
      ))}
    </form>
  );
}
