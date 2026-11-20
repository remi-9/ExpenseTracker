// Player options, as in a game's Options screen. Saved as cookies by setOption
// and put on the page as data-frame / data-speed attributes (see the game layout).

import { DEFAULT_BACKDROP } from "./backdrop";

/** Window frame colours. The id is the cookie value; the colour is set in globals.css. */
export const FRAMES = ["1", "2", "3", "4", "5", "6"] as const;
export const SPEEDS = ["slow", "mid", "fast"] as const;
export type Speed = (typeof SPEEDS)[number];
/** The Home scene: shown in full, or folded down to a short band (the default). */
export const SCENES = ["full", "compact"] as const;
export type SceneSize = (typeof SCENES)[number];

export const DEFAULT_OPTIONS = { frame: "1", speed: "mid" as Speed, scene: "compact" as SceneSize, ...DEFAULT_BACKDROP };

/** Browser-only: how fast text should move. 1 is normal; smaller is faster. */
export function textPace(): number {
  const speed = document.querySelector<HTMLElement>("[data-speed]")?.dataset.speed;
  return speed === "slow" ? 1.6 : speed === "fast" ? 0.45 : 1;
}
