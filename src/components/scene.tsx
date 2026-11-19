// The Home scene: a battle-style view that travels between places.
// Backdrops are Pokémon Showdown's battle backgrounds (see Pokémon resources in the README),
// loaded at runtime. They fade from one to the next and drift slowly sideways.
import type { ReactNode } from "react";
import { backdrop } from "@/lib/fight";

/** Places visited, in order. Any bg-*.png name from Showdown's /fx folder works. */
const PLACES = ["route", "meadow", "forest", "river", "beach", "mountain", "city", "desert"];

/** Seconds each place stays on screen. */
const SLOT = 12;

export function Scene({ children }: { children: ReactNode }) {
  const share = 100 / PLACES.length;
  // Each place fades in, holds for its slot, then fades out; delays stagger them.
  const keyframes = `@keyframes place-cycle{0%{opacity:0}2%{opacity:1}${share}%{opacity:1}${share + 2}%{opacity:0}100%{opacity:0}}`;
  return (
    <div className="scene" style={{ backgroundImage: `url(${backdrop(PLACES[0])})` }}>
      <style>{keyframes}</style>
      {PLACES.map((place, i) => (
        <div
          key={place}
          className="place"
          style={{
            backgroundImage: `url(${backdrop(place)})`,
            animationDuration: `${PLACES.length * SLOT}s, 24s`,
            animationDelay: `${i * SLOT}s, 0s`,
          }}
        />
      ))}
      {children}
    </div>
  );
}
