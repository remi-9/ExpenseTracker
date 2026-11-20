"use client";

import { useState, type ReactNode } from "react";
import { play } from "@/lib/sfx";

const YEAR = 60 * 60 * 24 * 365;

/**
 * The Home status box: the scene on top, and under it the message and the XP bar. The
 * scene folds down smoothly to a short band that is still alive: the same trainer and
 * partner, in less room. The choice is kept in a cookie so the page opens the same way.
 */
export function SceneBox({
  startFolded,
  scene,
  strip,
  status,
  message,
  xp,
}: {
  startFolded: boolean;
  scene: ReactNode;
  /** The compact scene, shown while the full one is folded away. */
  strip: ReactNode;
  /** Name, level and HP for phones, where neither scene has room for the status box. */
  status: ReactNode;
  /** What the partner has to say about the month. */
  message: ReactNode;
  /** The XP label, bar and numbers: three cells of the strip's last row. */
  xp: ReactNode;
}) {
  const [folded, setFolded] = useState(startFolded);
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    play("page");
    document.cookie = `scene=${next ? "compact" : "full"}; path=/; max-age=${YEAR}; samesite=lax`;
  };

  return (
    <section className="box scene-box p-0!" data-folded={folded || undefined} aria-label="Wallet status">
      <div className="fold fold-scene" inert={folded}>
        <div>{scene}</div>
      </div>
      <div className="fold fold-strip" inert={!folded}>
        <div>{strip}</div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="scene-status-row">{status}</div>
        {message}
        <div className="grid grid-cols-[1.75rem_1fr_auto_auto] items-center gap-x-2">
          {xp}
          <button type="button" className="btn scene-toggle" data-sfx="none" aria-expanded={!folded} onClick={toggle}>
            {folded ? "Show scene" : "Hide scene"}
          </button>
        </div>
      </div>
    </section>
  );
}
