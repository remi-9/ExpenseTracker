// The page backdrop, in two parts: a colour, and a generated pattern drifting over it.
// Day and night each get their own pair of layers; the theme shows one of them.
import type { CSSProperties } from "react";
import { markColor, patternTile, TONE_COLORS, type Pattern, type Tone } from "@/lib/backdrop";

export function Backdrop({ tone, pattern }: { tone: Tone; pattern: Pattern }) {
  return (
    <div className="backdrop" aria-hidden>
      {(["day", "night"] as const).map((time) => {
        const tile = patternTile(pattern, markColor(tone, time));
        const style = { backgroundImage: tile.image, "--tile": `${tile.size}px` } as CSSProperties;
        return (
          <div key={time} className={`backdrop-color by-${time}`} style={{ background: TONE_COLORS[tone][time] }}>
            <div className="backdrop-pattern" style={style} />
          </div>
        );
      })}
    </div>
  );
}
