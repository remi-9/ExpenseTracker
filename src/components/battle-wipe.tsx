"use client";

// The screen wipe that leads into a battle: two flashes, the screen closes to black
// in one of a few patterns, the battle is put in place behind it, and it opens again.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { EncounterKind } from "@/lib/fight";

export type WipeStyle = "blinds" | "tiles" | "shutters" | "jaws" | "iris";

/** Which wipe a battle gets: tougher opponents get the more dramatic ones, wild ones take turns. */
export const wipeFor = (kind: EncounterKind, count: number): WipeStyle =>
  kind === "boss" ? "iris" : kind === "elite" ? "jaws" : kind === "trainer" ? "shutters" : count % 2 === 0 ? "blinds" : "tiles";

/** How long the flashes and the closing take, and the opening. Matched by the animations in globals.css. */
const COVER_MS = 1250;
const REVEAL_MS = 520;

const PIECES: Record<WipeStyle, number> = { blinds: 8, tiles: 96, shutters: 10, jaws: 2, iris: 1 };
const TILE_COLUMNS = 12;

export function BattleWipe({
  style,
  startCovered,
  stayCovered,
  onCovered,
  onDone,
}: {
  style: WipeStyle;
  /** Begin with the screen already black and only open it: for a battle that starts with the page. */
  startCovered?: boolean;
  /** Close and stay black: for leaving to another page, whose own wipe does the opening. */
  stayCovered?: boolean;
  /** The screen is fully black: the moment to swap what is behind it. */
  onCovered?: () => void;
  /** The wipe has opened again and can be taken away. */
  onDone?: () => void;
}) {
  const [stage, setStage] = useState<"cover" | "reveal">(startCovered ? "reveal" : "cover");
  const covered = useRef(onCovered);
  const done = useRef(onDone);
  useEffect(() => {
    covered.current = onCovered;
    done.current = onDone;
  });

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let second: ReturnType<typeof setTimeout>;
    const first = setTimeout(
      () => {
        covered.current?.();
        if (stayCovered) return;
        setStage("reveal");
        second = setTimeout(() => done.current?.(), still ? 0 : REVEAL_MS);
      },
      startCovered || still ? 0 : COVER_MS,
    );
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [startCovered, stayCovered]);

  return (
    <div className="wipe" data-style={style} data-stage={stage} aria-hidden>
      {Array.from({ length: PIECES[style] }, (_, i) => (
        // Tiles close in along the diagonal; everything else one after another.
        <span key={i} style={{ "--i": style === "tiles" ? (i % TILE_COLUMNS) + Math.floor(i / TILE_COLUMNS) : i } as CSSProperties} />
      ))}
      <i className="wipe-flash" />
    </div>
  );
}
