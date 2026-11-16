"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { blip, chime, isSoundOn, resumeAudio, setSoundOn, startMusic, stopMusic, subscribeSound } from "@/lib/sfx";

// Optional: your own track replaces the built-in loop. Set at build time by next.config.ts
// when public/audio/pokemon-center.mp3 exists.
const MUSIC_SRC = process.env.NEXT_PUBLIC_MUSIC_SRC;
const MUSIC_VOLUME = 0.12;

/** Header button that switches sound on or off. Also owns the menu ticks and background music. */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => false);
  const music = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = music.current;
    if (audio) {
      audio.volume = MUSIC_VOLUME;
      if (on) audio.play().catch(() => {}); // browsers block this until the first click; see below
      else audio.pause();
    }
    if (!on) return;
    if (!audio) startMusic(); // built-in loop

    const onClick = (event: MouseEvent) => {
      resumeAudio();
      if (audio?.paused) audio.play().catch(() => {});
      if ((event.target as Element).closest("a, button, .chip")) blip();
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      stopMusic();
    };
  }, [on]);

  return (
    <>
      <button type="button" className="btn" aria-pressed={on} onClick={() => setSoundOn(!on)}>
        {on ? "♪ On" : "♪ Off"}
      </button>
      {MUSIC_SRC && <audio ref={music} src={MUSIC_SRC} loop preload="none" />}
    </>
  );
}

/** Plays the "saved" chime once when it appears on the page. */
export function SavedChime() {
  useEffect(() => chime(), []);
  return null;
}
