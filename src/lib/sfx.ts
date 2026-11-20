// Sound, browser-only. Every effect and the music are synthesized here with the
// Web Audio API (square, triangle and noise channels, like an 8-bit console), so
// there are no audio files. Cries stream from PokeAPI. Quiet by design, and off
// until switched on with the note button in the header.

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

// ---- The synth ----------------------------------------------------------------

let ctx: AudioContext | null = null;
let hiss: AudioBuffer | null = null;

function audio() {
  ctx ??= new AudioContext();
  return ctx;
}

type Tone = {
  /** Frequency in Hz. */
  f: number;
  /** Slide to this frequency over the note (for swoops and thuds). */
  to?: number;
  /** Seconds from now. */
  at?: number;
  len: number;
  vol?: number;
  type?: OscillatorType;
};

function tone({ f, to, at = 0, len, vol = 0.03, type = "square" }: Tone) {
  const a = audio();
  const start = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + len);
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + len);
}

/** A burst of noise: drums, impacts, static. `bright` keeps only the hiss (hi-hats). */
function noise({ at = 0, len, vol = 0.03, bright = false }: { at?: number; len: number; vol?: number; bright?: boolean }) {
  const a = audio();
  if (!hiss) {
    hiss = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = hiss.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = a.currentTime + at;
  const source = a.createBufferSource();
  const gain = a.createGain();
  const filter = a.createBiquadFilter();
  source.buffer = hiss;
  filter.type = bright ? "highpass" : "lowpass";
  filter.frequency.value = bright ? 6000 : 1800;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
  source.connect(filter).connect(gain).connect(a.destination);
  source.start(start);
  source.stop(start + len);
}

/** Play notes one after another. */
const run = (notes: number[], step: number, extra: Partial<Tone> = {}, at = 0) =>
  notes.forEach((f, i) => tone({ f, at: at + i * step, len: step * 1.8, ...extra }));

// ---- Sound effects ------------------------------------------------------------
// Give an element data-sfx="name" to choose its click sound (see components/sound.tsx),
// or call play("name") from code. Add a sound by adding an entry here.

const SOUNDS = {
  /** Default button press. */
  select: () => tone({ f: 1320, len: 0.05, vol: 0.02 }),
  /** The warning chirp when HP is in the red. */
  lowHp: () => run([988, 784], 0.11, { vol: 0.022 }),
  /** A battle is about to start: the alarm that goes with the screen flashing. */
  encounter: () => {
    run([330, 494, 330, 494, 330, 494, 659, 988], 0.055, { vol: 0.03 });
    noise({ at: 0.46, len: 0.3, vol: 0.018 });
  },
  /** Final action of a form. */
  confirm: () => run([880, 1320], 0.06, { vol: 0.025 }),
  tab: () => run([660, 990], 0.045, { vol: 0.02, type: "triangle" }),
  /** Month arrows: a page turning. */
  page: () => {
    noise({ len: 0.06, vol: 0.012, bright: true });
    tone({ f: 520, to: 780, len: 0.07, vol: 0.02, type: "triangle" });
  },
  chip: () => tone({ f: 990, len: 0.04, vol: 0.025, type: "triangle" }),
  toggle: () => run([440, 660, 880], 0.05, { vol: 0.02 }),
  /** One character of dialog text. */
  tick: () => tone({ f: 1760, len: 0.012, vol: 0.006 }),
  error: () => {
    tone({ f: 160, len: 0.14, vol: 0.04, type: "sawtooth" });
    tone({ f: 120, at: 0.16, len: 0.2, vol: 0.04, type: "sawtooth" });
  },
  delete: () => {
    tone({ f: 600, to: 110, len: 0.22, vol: 0.03 });
    noise({ at: 0.05, len: 0.15, vol: 0.02 });
  },
  /** Spending lands on your partner. */
  hit: () => {
    noise({ at: 0.2, len: 0.14, vol: 0.06 });
    tone({ f: 320, to: 70, at: 0.2, len: 0.2, vol: 0.05 });
    noise({ at: 0.36, len: 0.08, vol: 0.03 });
  },
  /** Income restores HP. */
  heal: () => {
    run([523, 659, 784, 1047, 1319], 0.07, { vol: 0.03, type: "triangle" }, 0.2);
    run([1047, 1319, 1568, 2093], 0.07, { vol: 0.012 }, 0.27);
  },
  coin: () => {
    tone({ f: 1175, len: 0.07, vol: 0.025 });
    tone({ f: 1568, at: 0.07, len: 0.3, vol: 0.025 });
  },
  /** Savings drop into the PC. */
  deposit: () => {
    [0.2, 0.32, 0.44].forEach((at) => tone({ f: 1568, at, len: 0.1, vol: 0.02 }));
    tone({ f: 196, to: 98, at: 0.6, len: 0.2, vol: 0.05, type: "triangle" });
    run([784, 1175], 0.1, { vol: 0.025 }, 0.75);
  },
  levelUp: () => {
    run([523, 523, 523, 659, 784], 0.09, { vol: 0.03 }, 1.2);
    tone({ f: 1047, at: 1.65, len: 0.5, vol: 0.035 });
    tone({ f: 784, at: 1.65, len: 0.5, vol: 0.02, type: "triangle" });
  },
  /** Plays under the evolution flicker (about 2.6 s), then resolves. */
  evolve: () => {
    for (let i = 0; i < 12; i++) tone({ f: 330 * 2 ** (i / 12), at: 1 + i * 0.21, len: 0.18, vol: 0.02, type: "triangle" });
    for (let i = 0; i < 24; i++) tone({ f: i % 2 ? 1319 : 1047, at: 1 + i * 0.105, len: 0.05, vol: 0.008 });
    run([784, 988, 1175, 1568], 0.12, { vol: 0.035 }, 3.7);
    tone({ f: 1568, at: 4.2, len: 0.7, vol: 0.03 });
    tone({ f: 1175, at: 4.2, len: 0.7, vol: 0.02, type: "triangle" });
  },
  pet: () => tone({ f: 700, to: 1250, len: 0.13, vol: 0.025, type: "triangle" }),
  /** A wild Pokémon wanders in. */
  appear: () => run([988, 1319, 988, 1319], 0.055, { vol: 0.018 }),
  throw: () => {
    tone({ f: 420, to: 1300, len: 0.28, vol: 0.025, type: "triangle" });
    noise({ at: 0.3, len: 0.06, vol: 0.03 });
    [0.6, 1.0, 1.4].forEach((at) => tone({ f: 260, to: 200, at, len: 0.09, vol: 0.03 }));
  },
  caught: () => {
    noise({ len: 0.04, vol: 0.03, bright: true });
    run([784, 988, 1175, 1568, 1175, 1568], 0.08, { vol: 0.03 }, 0.05);
    tone({ f: 2093, at: 0.55, len: 0.4, vol: 0.025 });
  },
  shiny: () => run([2093, 2637, 3136, 4186], 0.06, { vol: 0.012 }),
  // ---- Battles ----
  /** A move connects. */
  strike: () => {
    noise({ len: 0.1, vol: 0.05 });
    tone({ f: 260, to: 90, len: 0.14, vol: 0.04 });
  },
  super: () => {
    noise({ len: 0.16, vol: 0.07 });
    tone({ f: 520, to: 110, len: 0.22, vol: 0.05 });
    tone({ f: 1568, at: 0.05, len: 0.12, vol: 0.02 });
  },
  weak: () => tone({ f: 180, to: 140, len: 0.12, vol: 0.03, type: "triangle" }),
  miss: () => noise({ len: 0.12, vol: 0.012, bright: true }),
  crit: () => run([1568, 2093], 0.05, { vol: 0.025 }),
  faint: () => tone({ f: 660, to: 70, len: 0.7, vol: 0.04 }),
  sendOut: () => {
    noise({ len: 0.05, vol: 0.03, bright: true });
    tone({ f: 500, to: 1000, at: 0.03, len: 0.15, vol: 0.025, type: "triangle" });
  },
  /** A gym leader steps forward. */
  boss: () => {
    run([110, 104, 110, 104], 0.16, { vol: 0.05, type: "sawtooth" });
    run([440, 415, 440, 523], 0.16, { vol: 0.025 }, 0.02);
  },
  victory: () => {
    run([523, 659, 784, 1047, 784, 1047], 0.1, { vol: 0.035 });
    tone({ f: 1319, at: 0.62, len: 0.6, vol: 0.035 });
    tone({ f: 1047, at: 0.62, len: 0.6, vol: 0.02, type: "triangle" });
  },
  defeat: () => run([392, 370, 349, 330, 294, 262], 0.16, { vol: 0.03, type: "triangle" }),
  /** Choosing an upgrade. */
  boon: () => run([784, 1047, 1319, 1568, 2093], 0.06, { vol: 0.025, type: "triangle" }),
} as const;

export type SfxName = keyof typeof SOUNDS;

export function play(name: SfxName) {
  if (isSoundOn() && name in SOUNDS) SOUNDS[name]();
}

export function cry(dex: number) {
  if (!isSoundOn()) return;
  const clip = new Audio(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`);
  clip.volume = 0.2;
  clip.play().catch(() => {}); // unsupported format or blocked: stay silent
}

// ---- Background music -----------------------------------------------------------
// Two original chiptune loops written for this app: a relaxed one for the menus
// and a quicker minor-key one for battles. Each has a lead, bass, a soft arpeggio
// and light drums. Numbers are MIDI notes (60 = middle C); 0 is a rest.
// Eight eighth-notes per bar. Edit the lists to change a tune.

type Song = {
  /** Seconds per eighth-note. */
  step: number;
  lead: number[][];
  /** Chord root for each half bar. */
  bass: number[][];
  /** Roots whose chords are minor. */
  minor: number[];
};

const SONGS: Record<"town" | "battle", Song> = {
  town: {
    step: 0.25,
    minor: [40, 45],
    lead: [
      [76, 0, 79, 0, 84, 0, 79, 76],
      [81, 0, 76, 0, 72, 0, 76, 0],
      [77, 0, 81, 0, 84, 0, 81, 77],
      [74, 0, 79, 0, 83, 0, 79, 0],
      [76, 79, 84, 0, 88, 0, 84, 79],
      [83, 0, 79, 0, 76, 0, 79, 83],
      [81, 0, 77, 81, 83, 0, 79, 74],
      [72, 0, 76, 79, 84, 0, 0, 0],
      [81, 0, 84, 0, 89, 0, 84, 81],
      [83, 0, 86, 0, 91, 0, 86, 83],
      [79, 0, 83, 0, 88, 0, 83, 79],
      [81, 0, 84, 0, 88, 0, 84, 0],
      [77, 81, 84, 0, 89, 0, 84, 81],
      [79, 83, 86, 0, 91, 0, 86, 83],
      [84, 0, 79, 0, 76, 0, 79, 84],
      [72, 0, 76, 79, 84, 0, 0, 0],
    ],
    bass: [
      [48, 48], [45, 45], [41, 41], [43, 43], [48, 48], [40, 40], [41, 43], [48, 48],
      [41, 41], [43, 43], [40, 40], [45, 45], [41, 41], [43, 43], [48, 48], [48, 43],
    ],
  },
  battle: {
    step: 0.15,
    minor: [45, 40, 38],
    lead: [
      [69, 72, 76, 72, 81, 76, 72, 76],
      [69, 72, 77, 72, 81, 77, 72, 77],
      [71, 74, 79, 74, 83, 79, 74, 79],
      [71, 76, 79, 76, 83, 79, 76, 71],
      [81, 0, 81, 79, 76, 0, 72, 76],
      [77, 0, 77, 76, 72, 0, 69, 72],
      [74, 77, 81, 77, 86, 81, 77, 74],
      [76, 80, 83, 80, 88, 83, 80, 76],
    ],
    bass: [[45, 45], [41, 41], [43, 43], [40, 40], [45, 45], [41, 41], [38, 38], [40, 40]],
  },
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let theme: keyof typeof SONGS = "town";
let musicTimer: ReturnType<typeof setInterval> | undefined;

function queueBar(song: Song, bar: number, at: number) {
  const { step } = song;
  song.lead[bar].forEach((n, i) => n && tone({ f: hz(n), at: at + i * step, len: step * 1.6, vol: 0.012 }));
  song.bass[bar].forEach((root, half) => {
    const t = at + half * 4 * step;
    tone({ f: hz(root), at: t, len: step * 1.8, vol: 0.035, type: "triangle" });
    tone({ f: hz(root + 7), at: t + 2 * step, len: step * 1.2, vol: 0.025, type: "triangle" });
    // Arpeggio: the chord's three notes in sixteenths, two octaves up.
    const third = song.minor.includes(root) ? 3 : 4;
    [0, third, 7, 12, 7, third, 0, third].forEach((offset, i) =>
      tone({ f: hz(root + 24 + offset), at: t + (i * step) / 2, len: step / 2, vol: 0.004, type: "triangle" }),
    );
    // Drums: kick on the beat, snare on the back beat, hats in between.
    tone({ f: 130, to: 50, at: t, len: 0.1, vol: 0.03, type: "sine" });
    noise({ at: t + 2 * step, len: 0.07, vol: 0.008 });
    [1, 3].forEach((i) => noise({ at: t + i * step, len: 0.025, vol: 0.004, bright: true }));
  });
}

export function startMusic() {
  if (musicTimer) return;
  const a = audio();
  const song = SONGS[theme];
  let bar = 0;
  let barStart = a.currentTime + 0.1;
  // Queue each bar a little before it is due.
  const queue = () => {
    while (barStart < a.currentTime + 0.6) {
      queueBar(song, bar, barStart - a.currentTime);
      bar = (bar + 1) % song.lead.length;
      barStart += song.step * 8;
    }
  };
  queue();
  musicTimer = setInterval(queue, 200);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = undefined;
}

/** Switch between the menu tune and the battle tune. Takes effect at once if music is playing. */
export function setMusicTheme(next: keyof typeof SONGS) {
  if (next === theme) return;
  theme = next;
  if (musicTimer) {
    stopMusic();
    startMusic();
  }
}

/** Browsers keep audio suspended until the first click; call this from a click handler. */
export function resumeAudio() {
  ctx?.resume();
}
