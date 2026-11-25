// Background music, browser-only. Each tune in lib/tunes.ts is rendered once into a
// buffer that loops without a seam (the notes still ringing at the end are folded
// back into the start), then played. The clock picks the tune; battles swap in their
// own. A change fades one tune out while the next fades in.

import { audio, bus } from "./sfx";
import { loopLength, noteEvents, TUNES, tuneFor, type Instrument, type TuneName } from "./tunes";

// ---- Instruments --------------------------------------------------------------
// Every voice fades in and out, so nothing starts or stops with a jump (a click).

type Ctx = BaseAudioContext;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** An envelope on `gain`: in over `attack`, down toward `sustain` with time constant `decay`, out after `len`. Returns when it is silent. */
function envelope(
  gain: GainNode,
  at: number,
  len: number,
  { vol, attack = 0.008, decay = 0, sustain = 1, release = 0.08 }: { vol: number; attack?: number; decay?: number; sustain?: number; release?: number },
) {
  const g = gain.gain;
  g.setValueAtTime(0, at);
  g.linearRampToValueAtTime(vol, at + attack);
  if (decay) g.setTargetAtTime(vol * sustain, at + attack, decay);
  g.setTargetAtTime(0, at + Math.max(len, attack), release);
  return at + Math.max(len, attack) + release * 7;
}

const pulseWaves = new WeakMap<Ctx, PeriodicWave>();
/** A 25% pulse wave, rounder than a square. */
function pulseWave(a: Ctx) {
  let wave = pulseWaves.get(a);
  if (!wave) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(2 * k * Math.PI * 0.25);
      imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * k * Math.PI * 0.25));
    }
    wave = a.createPeriodicWave(real, imag);
    pulseWaves.set(a, wave);
  }
  return wave;
}

const noises = new WeakMap<Ctx, AudioBuffer>();
function noise(a: Ctx) {
  let buffer = noises.get(a);
  if (!buffer) {
    buffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(a, buffer);
  }
  return buffer;
}

function osc(a: Ctx, type: OscillatorType | "pulse", f: number, at: number, end: number, detune = 0) {
  const o = a.createOscillator();
  if (type === "pulse") o.setPeriodicWave(pulseWave(a));
  else o.type = type;
  o.frequency.setValueAtTime(f, at);
  o.detune.value = detune;
  o.start(at);
  o.stop(end);
  return o;
}

function lowpass(a: Ctx, frequency: number, q = 0.7) {
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

type Voice = (a: Ctx, out: AudioNode, f: number, at: number, len: number, vol: number) => void;

const VOICES: Record<Instrument, Voice> = {
  /** Electric piano: a sine with a quieter octave "tine" that fades first. */
  epiano(a, out, f, at, len, vol) {
    const body = a.createGain();
    osc(a, "sine", f, at, envelope(body, at, len, { vol, attack: 0.006, decay: 0.7, sustain: 0.35, release: 0.12 })).connect(body);
    const tine = a.createGain();
    osc(a, "sine", f * 2, at, envelope(tine, at, Math.min(len, 0.25), { vol: vol * 0.35, attack: 0.004, decay: 0.12, sustain: 0, release: 0.05 }), 4).connect(tine);
    body.connect(out);
    tine.connect(out);
  },
  /** Music box: a sine and two bright partials, ringing down. */
  bell(a, out, f, at, len, vol) {
    for (const [mul, share, decay] of [
      [1, 1, 0.9],
      [2, 0.35, 0.35],
      [3.01, 0.15, 0.18],
    ]) {
      const g = a.createGain();
      osc(a, "sine", f * mul, at, envelope(g, at, len + 1.2, { vol: vol * share, attack: 0.003, decay, sustain: 0, release: 0.2 })).connect(g);
      g.connect(out);
    }
  },
  /** Soft pad: two detuned triangles through a low-pass, slow in and out. */
  pad(a, out, f, at, len, vol) {
    const filter = lowpass(a, 1100);
    const g = a.createGain();
    const end = envelope(g, at, len, { vol, attack: 0.35, release: 0.35 });
    osc(a, "triangle", f, at, end, -7).connect(filter);
    osc(a, "triangle", f, at, end, 7).connect(filter);
    filter.connect(g).connect(out);
  },
  /** Round bass: a triangle and a sine, low-passed so it is warm rather than buzzy. */
  bass(a, out, f, at, len, vol) {
    const filter = lowpass(a, 500, 0.5);
    const g = a.createGain();
    const end = envelope(g, at, len, { vol, attack: 0.01, decay: 0.9, sustain: 0.6, release: 0.06 });
    osc(a, "triangle", f, at, end).connect(filter);
    osc(a, "sine", f, at, end).connect(filter);
    filter.connect(g).connect(out);
  },
  /** Chiptune lead: a 25% pulse, low-passed, with a little vibrato once held. */
  lead(a, out, f, at, len, vol) {
    const filter = lowpass(a, 3200);
    const g = a.createGain();
    const end = envelope(g, at, len, { vol, attack: 0.008, decay: 0.35, sustain: 0.7, release: 0.05 });
    const o = osc(a, "pulse", f, at, end);
    if (len > 0.3) {
      const lfo = a.createOscillator();
      const depth = a.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(9, at + 0.35);
      lfo.connect(depth).connect(o.detune);
      lfo.start(at);
      lfo.stop(end);
    }
    o.connect(filter).connect(g).connect(out);
  },
  /** A short triangle stab. */
  pluck(a, out, f, at, len, vol) {
    const g = a.createGain();
    osc(a, "triangle", f, at, envelope(g, at, Math.min(len, 0.2), { vol, attack: 0.004, decay: 0.09, sustain: 0, release: 0.04 })).connect(g);
    g.connect(out);
  },
  /** The battle lead: a square that rings down, softened a little. */
  chip(a, out, f, at, len, vol) {
    const filter = lowpass(a, 4000);
    const g = a.createGain();
    const end = envelope(g, at, len, { vol, attack: 0.005, decay: len / 4, sustain: 0, release: 0.03 });
    osc(a, "square", f, at, end).connect(filter);
    filter.connect(g).connect(out);
  },
  /** The battle arpeggio: quick, quiet triangles. */
  arp(a, out, f, at, len, vol) {
    const g = a.createGain();
    osc(a, "triangle", f, at, envelope(g, at, len, { vol, attack: 0.004, decay: len / 3, sustain: 0, release: 0.02 })).connect(g);
    g.connect(out);
  },
  kick(a, out, _f, at, _len, vol) {
    const g = a.createGain();
    const o = osc(a, "sine", 110, at, envelope(g, at, 0.12, { vol, attack: 0.003, decay: 0.06, sustain: 0, release: 0.05 }));
    o.frequency.exponentialRampToValueAtTime(45, at + 0.16);
    o.connect(g);
    g.connect(out);
  },
  snare(a, out, _f, at, _len, vol) {
    const band = a.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 0.7;
    const g = a.createGain();
    const end = envelope(g, at, 0.08, { vol, attack: 0.004, decay: 0.05, sustain: 0, release: 0.05 });
    const source = a.createBufferSource();
    source.buffer = noise(a);
    source.start(at, Math.random() * 0.5);
    source.stop(end);
    source.connect(band).connect(g).connect(out);
  },
};

// ---- Rendering ----------------------------------------------------------------

/** How loud a tune is rendered (RMS), matching the music the app had before. */
const LOUDNESS = 0.006;
/** Room after the loop for notes that are still ringing. */
const TAIL = 3;

/** Render one pass of a tune into a buffer that loops seamlessly. */
async function render(name: TuneName, sampleRate: number) {
  const tune = TUNES[name];
  const frames = Math.round(loopLength(tune) * sampleRate);
  const offline = new OfflineAudioContext(1, frames + Math.round(TAIL * sampleRate), sampleRate);
  for (const e of noteEvents(tune)) VOICES[e.instrument](offline, offline.destination, hz(e.midi), e.at, e.len, e.vol);
  const rendered = await offline.startRendering();

  // Fold the tail into the start, so the loop's end flows into its beginning.
  const all = rendered.getChannelData(0);
  const loop = new Float32Array(frames);
  loop.set(all.subarray(0, frames));
  for (let i = frames; i < all.length; i++) loop[i - frames] += all[i];

  // Every tune at the same loudness.
  let squares = 0;
  for (const v of loop) squares += v * v;
  const gain = LOUDNESS / Math.sqrt(squares / frames || 1);
  for (let i = 0; i < frames; i++) loop[i] *= gain;

  const buffer = new AudioBuffer({ length: frames, numberOfChannels: 1, sampleRate });
  buffer.copyToChannel(loop, 0);
  return buffer;
}

const rendered = new Map<TuneName, Promise<AudioBuffer>>();
function loopFor(name: TuneName) {
  let buffer = rendered.get(name);
  if (!buffer) {
    buffer = render(name, audio().sampleRate);
    rendered.set(name, buffer);
  }
  return buffer;
}

// ---- Playing ------------------------------------------------------------------

/** Seconds to fade between tunes: slow for the time of day, quick into and out of battle. */
const FADE = { clock: 3, battle: 1, start: 1.5, stop: 0.4 };

let on = false;
let fighting = false;
let clock: ReturnType<typeof setInterval> | undefined;
let playing: { name: TuneName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
/** The tune being got ready, so a second call does not start it twice. */
let coming: TuneName | null = null;

/** Equal-power fade curves, so the sum stays as loud as either tune through a crossfade. */
const curve = (from: number, to: number) =>
  Float32Array.from({ length: 32 }, (_, i) => {
    const t = i / 31;
    return from + (to - from) * Math.sin((t * Math.PI) / 2);
  });

function fadeOut(track: NonNullable<typeof playing>, seconds: number) {
  const now = audio().currentTime;
  const g = track.gain.gain;
  const from = g.value;
  g.cancelScheduledValues(now);
  g.setValueCurveAtTime(Float32Array.from({ length: 32 }, (_, i) => from * Math.cos(((i / 31) * Math.PI) / 2)), now, seconds);
  track.source.stop(now + seconds + 0.05);
}

const wanted = (): TuneName => (fighting ? "battle" : tuneFor(new Date().getHours()));

/** Play the tune that should be on now, fading from the one that is. */
async function update(fade: number) {
  const name = wanted();
  if (!on || playing?.name === name || coming === name) return;
  coming = name;
  const buffer = await loopFor(name);
  if (coming === name) coming = null;
  // While it was rendering, a battle may have ended or sound been switched off.
  if (!on || wanted() !== name || playing?.name === name) return;

  const a = audio();
  const now = a.currentTime;
  const gain = a.createGain();
  gain.gain.setValueCurveAtTime(curve(0, 1), now, fade);
  gain.connect(bus("music"));
  const source = a.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start(now);

  if (playing) fadeOut(playing, fade);
  playing = { name, source, gain };

  // Get the other tunes ready in the background, so later changes are instant.
  (Object.keys(TUNES) as TuneName[]).forEach((other, i) => setTimeout(() => void loopFor(other), 500 * (i + 1)));
}

export function startMusic() {
  if (on) return;
  on = true;
  void update(FADE.start);
  // The hour can turn while the app is open.
  clock = setInterval(() => void update(FADE.clock), 30_000);
}

export function stopMusic() {
  on = false;
  coming = null;
  clearInterval(clock);
  if (playing) fadeOut(playing, FADE.stop);
  playing = null;
}

/** Battles have their own tune; leaving one goes back to the tune for the time of day. */
export function setMusicTheme(theme: "town" | "battle") {
  const next = theme === "battle";
  if (next === fighting) return;
  fighting = next;
  void update(FADE.battle);
}
