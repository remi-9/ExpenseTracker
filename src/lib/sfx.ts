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
function note(frequency: number, at: number, length: number, volume = 0.03, type: OscillatorType = "square") {
  ctx ??= new AudioContext();
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
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

/** What an entry sounds like: a thud for spending, a rising sparkle for income, a ding for savings. */
export function entrySound(kind: "expense" | "income" | "saving") {
  if (!isSoundOn()) return;
  if (kind === "expense") [196, 147].forEach((f, i) => note(f, 0.2 + i * 0.09, 0.14, 0.05));
  if (kind === "income") [523, 659, 784, 1047].forEach((f, i) => note(f, 0.2 + i * 0.08, 0.16, 0.035, "triangle"));
  if (kind === "saving") [988, 1319].forEach((f, i) => note(f, 0.2 + i * 0.12, 0.25));
}

/** Short fanfare for a new level. `at` delays it so it follows the entry sound. */
export function levelUpSound(at = 1.2) {
  if (!isSoundOn()) return;
  [523, 523, 523, 659, 784, 1047].forEach((f, i) => note(f, at + i * 0.1, i === 5 ? 0.5 : 0.09, 0.035));
}

export function cry(dex: number) {
  if (!isSoundOn()) return;
  const audio = new Audio(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`);
  audio.volume = 0.2;
  audio.play().catch(() => {}); // unsupported format or blocked: stay silent
}

// ---- Background music -------------------------------------------------------
// An original eight-bar chiptune loop, written for this app and played by the
// synth above, so there is no audio file and nothing to license.
// Numbers are MIDI notes (60 = middle C); 0 is a rest. Eight eighth-notes per bar.

const LEAD = [
  [76, 0, 79, 0, 84, 0, 79, 76],
  [81, 0, 76, 0, 72, 0, 76, 0],
  [77, 0, 81, 0, 84, 0, 81, 77],
  [74, 0, 79, 0, 83, 0, 79, 0],
  [76, 79, 84, 0, 88, 0, 84, 79],
  [83, 0, 79, 0, 76, 0, 79, 83],
  [81, 0, 77, 81, 83, 0, 79, 74],
  [72, 0, 76, 79, 84, 0, 0, 0],
];
/** Bass root for each half bar. */
const BASS = [[48, 48], [45, 45], [41, 41], [43, 43], [48, 48], [40, 40], [41, 43], [48, 48]];
const STEP = 0.25; // seconds per eighth-note
const BAR = STEP * 8;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let musicTimer: ReturnType<typeof setInterval> | undefined;

export function startMusic() {
  if (musicTimer) return;
  ctx ??= new AudioContext();
  let bar = 0;
  let barStart = ctx.currentTime + 0.1;
  // Queue each bar a little before it is due.
  const queue = () => {
    while (barStart < ctx!.currentTime + 1) {
      const at = barStart - ctx!.currentTime;
      LEAD[bar].forEach((n, i) => n && note(hz(n), at + i * STEP, STEP * 1.6, 0.012));
      BASS[bar].forEach((root, half) => {
        note(hz(root), at + half * 4 * STEP, STEP * 1.8, 0.035, "triangle");
        note(hz(root + 7), at + (half * 4 + 2) * STEP, STEP * 1.2, 0.025, "triangle");
      });
      bar = (bar + 1) % LEAD.length;
      barStart += BAR;
    }
  };
  queue();
  musicTimer = setInterval(queue, 250);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = undefined;
}

/** Browsers keep audio suspended until the first click; call this from a click handler. */
export function resumeAudio() {
  ctx?.resume();
}
