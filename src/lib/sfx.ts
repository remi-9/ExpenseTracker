// Sound, browser-only. Effects are synthesized square-wave beeps (no audio files);
// cries stream from PokeAPI. Everything is quiet by design and off until switched on.

const KEY = "sound";
const EVENT = "soundchange";

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSound(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

let ctx: AudioContext | null = null;

/** One short square-wave note. `at` and `length` are in seconds. */
function note(frequency: number, at: number, length: number, volume = 0.03) {
  ctx ??= new AudioContext();
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length);
}

/** Menu tick, for buttons and tabs. */
export function blip() {
  if (isSoundOn()) note(1320, 0, 0.05, 0.02);
}

/** Rising four-note chime, for a saved entry. */
export function chime() {
  if (!isSoundOn()) return;
  [659, 784, 988, 1319].forEach((f, i) => note(f, i * 0.09, 0.16));
}

export function cry(dex: number) {
  if (!isSoundOn()) return;
  const audio = new Audio(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`);
  audio.volume = 0.2;
  audio.play().catch(() => {}); // unsupported format or blocked: stay silent
}
