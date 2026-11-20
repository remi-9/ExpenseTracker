"use client";

import { useState, type ReactNode } from "react";
import { play } from "@/lib/sfx";

const YEAR = 60 * 60 * 24 * 365;

/**
 * The Home status box: the scene on top, and under it a strip with the XP bar. The
 * scene folds away smoothly, leaving the strip, which then also carries the name and
 * HP that the scene shows. The choice is kept in a cookie so the page opens the same way.
 */
export function SceneBox({
  startFolded,
  scene,
  status,
  xp,
}: {
  startFolded: boolean;
  scene: ReactNode;
  /** Name, level and HP: shown in the strip on phones, and on any screen once the scene is folded. */
  status: ReactNode;
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
      <div className="flex flex-col gap-2 p-3">
        <div className="fold fold-status">
          <div>{status}</div>
        </div>
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
