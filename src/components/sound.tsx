"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  isSoundOn,
  play,
  resumeAudio,
  setSoundOn,
  startMusic,
  stopMusic,
  subscribeSound,
  type SfxName,
} from "@/lib/sfx";

// Optional: your own track replaces the built-in loop. Set at build time by next.config.ts
// when public/audio/pokemon-center.mp3 exists.
const MUSIC_SRC = process.env.NEXT_PUBLIC_MUSIC_SRC;
const MUSIC_VOLUME = 0.12;

/**
 * Header button that switches sound on or off. While on, it also plays the music
 * and gives every click a sound: an element's data-sfx attribute names the effect
 * (see SOUNDS in lib/sfx.ts), "none" keeps it silent, and plain buttons and links
 * get the default "select".
 */
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
      const target = (event.target as Element).closest<HTMLElement>("[data-sfx], a, button, .chip");
      if (!target) return;
      const name = target.dataset.sfx ?? (target.classList.contains("chip") ? "chip" : "select");
      if (name !== "none") play(name as SfxName);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      stopMusic();
    };
  }, [on]);

  return (
    <>
      <button
        type="button"
        className="btn"
        data-sfx="none"
        aria-pressed={on}
        onClick={() => {
          setSoundOn(!on);
          play("toggle");
        }}
      >
        {on ? "♪ On" : "♪ Off"}
      </button>
      {MUSIC_SRC && <audio ref={music} src={MUSIC_SRC} loop preload="none" />}
    </>
  );
}

/** A second on/off switch (Options screen). The header's SoundToggle does the actual work. */
export function SoundSwitch() {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => false);
  return (
    <button type="button" className="btn" data-sfx="none" aria-pressed={on} onClick={() => setSoundOn(!on)}>
      {on ? "♪ On" : "♪ Off"}
    </button>
  );
}

/** Plays effects once when it appears on the page, e.g. the result of a just-logged entry. */
export function PlayOnMount({ sounds }: { sounds: SfxName[] }) {
  const key = sounds.join();
  useEffect(() => {
    key.split(",").forEach((name) => play(name as SfxName));
  }, [key]);
  return null;
}
