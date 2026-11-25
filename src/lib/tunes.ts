// The background music, as data: three original tunes for the time of day and one
// for battles. lib/music.ts renders each into a loop and plays it. Numbers are MIDI
// notes (60 = middle C). A note is [slot, midi, length in slots]; a slot is an eighth
// note, and a half slot a sixteenth. Edit the lists to change a tune.

export type Instrument = "epiano" | "bell" | "pad" | "bass" | "lead" | "pluck" | "chip" | "arp" | "kick" | "snare";
export type Note = [slot: number, midi: number, len: number];
/** A bar's chord: the bass root and the notes of the chord. */
export type Chord = [root: number, notes: number[]];
type Play = (instrument: Instrument, midi: number, slot: number, len: number, vol: number) => void;

export type Tune = {
  /** Seconds per slot (an eighth note). */
  slot: number;
  /** Slots per bar: 8 for 4/4, 6 for a waltz. */
  perBar: number;
  /** Where an off-beat eighth falls within its beat: 0.5 is straight, more is swung. */
  swing: number;
  /** The instrument and level of the melody. */
  lead: Instrument;
  leadVol: number;
  chords: Chord[];
  /** The melody, one list of notes per bar. */
  melody: Note[][];
  /** The accompaniment for one bar. */
  backing: (bar: number, chord: Chord, play: Play) => void;
};

export type TuneName = "cafe" | "waltz" | "route" | "battle";

export const TUNES: Record<TuneName, Tune> = {
  // Lo-fi café. D major, 75 BPM, swung eighths. Afternoons.
  cafe: {
    slot: 0.4,
    perBar: 8,
    swing: 0.62,
    lead: "bell",
    leadVol: 0.05,
    chords: [
      [50, [54, 57, 61, 64]],
      [47, [54, 57, 59, 62]],
      [43, [55, 59, 62, 66]],
      [45, [55, 57, 61, 64]],
      [50, [54, 57, 61, 64]],
      [47, [54, 57, 59, 62]],
      [43, [55, 59, 62, 66]],
      [45, [55, 57, 61, 64]],
    ],
    melody: [
      [[2, 73, 1], [3, 76, 1], [4, 78, 3]],
      [[0, 76, 1], [1, 74, 1], [2, 73, 2], [4, 69, 4]],
      [[1, 71, 1], [2, 74, 1], [3, 78, 2], [5, 76, 1], [6, 74, 2]],
      [[0, 73, 3], [3, 71, 1], [4, 69, 4]],
      [[2, 73, 1], [3, 76, 1], [4, 81, 2], [6, 78, 2]],
      [[0, 76, 2], [2, 74, 1], [3, 73, 1], [4, 74, 4]],
      [[0, 71, 1], [1, 74, 1], [2, 79, 3], [5, 78, 1], [6, 76, 2]],
      [[0, 73, 2], [2, 76, 2], [4, 74, 4]],
    ],
    backing(bar, [root, chord], play) {
      // Piano chords on beat one and the swung "and" of two; bass on one and three.
      chord.forEach((m) => play("epiano", m, 0, 3, 0.022));
      chord.forEach((m) => play("epiano", m, 3, 5, 0.016));
      play("bass", root - 12, 0, 3, 0.07);
      play("bass", root - 12 + (bar % 2 ? 7 : 0), 4, 3, 0.06);
      play("kick", 0, 0, 1, 0.09);
      play("kick", 0, 5, 1, 0.05);
      play("snare", 0, 2, 1, 0.025);
      play("snare", 0, 6, 1, 0.025);
    },
  },

  // Music box waltz. F major, 3/4 at 96 BPM, no drums. Evenings and nights.
  waltz: {
    slot: 0.3125,
    perBar: 6,
    swing: 0.5,
    lead: "bell",
    leadVol: 0.055,
    chords: [
      [41, [65, 69, 72]],
      [38, [62, 65, 69]],
      [46, [62, 65, 70]],
      [48, [64, 67, 72]],
      [41, [65, 69, 72]],
      [45, [64, 69, 72]],
      [46, [62, 65, 70]],
      [48, [64, 67, 72]],
      [38, [62, 65, 69]],
      [46, [62, 65, 70]],
      [41, [65, 69, 72]],
      [48, [64, 67, 72]],
      [46, [62, 65, 70]],
      [48, [64, 67, 72]],
      [41, [65, 69, 72]],
      [41, [65, 69, 72]],
    ],
    melody: [
      [[0, 72, 2], [2, 77, 2], [4, 76, 1], [5, 77, 1]],
      [[0, 81, 3], [3, 77, 1], [4, 74, 2]],
      [[0, 74, 2], [2, 77, 2], [4, 82, 2]],
      [[0, 81, 4], [4, 79, 2]],
      [[0, 72, 2], [2, 77, 2], [4, 79, 1], [5, 81, 1]],
      [[0, 84, 3], [3, 81, 1], [4, 76, 2]],
      [[0, 77, 2], [2, 74, 2], [4, 79, 2]],
      [[0, 76, 6]],
      [[0, 74, 2], [2, 77, 2], [4, 81, 2]],
      [[0, 82, 3], [3, 81, 1], [4, 79, 2]],
      [[0, 81, 2], [2, 77, 2], [4, 72, 2]],
      [[0, 76, 4], [4, 79, 2]],
      [[0, 77, 2], [2, 74, 2], [4, 82, 2]],
      [[0, 81, 2], [2, 79, 2], [4, 76, 2]],
      [[0, 77, 6]],
      [[4, 76, 2]],
    ],
    backing(_bar, [root, chord], play) {
      play("bass", root, 0, 2, 0.06);
      chord.forEach((m) => play("pad", m - 12, 0, 6, 0.009));
      // Oom-pah-pah: the chord, softly, on beats two and three.
      [2, 4].forEach((s) => chord.forEach((m) => play("bell", m, s, 1, 0.009)));
    },
  },

  // Route theme. G major, 120 BPM. Mornings.
  route: {
    slot: 0.25,
    perBar: 8,
    swing: 0.5,
    lead: "lead",
    leadVol: 0.03,
    chords: [
      [43, [67, 71, 74]],
      [38, [66, 69, 74]],
      [40, [67, 71, 76]],
      [36, [67, 72, 76]],
      [43, [67, 71, 74]],
      [38, [66, 69, 74]],
      [36, [67, 72, 76]],
      [38, [66, 69, 74]],
      [40, [67, 71, 76]],
      [36, [67, 72, 76]],
      [43, [67, 71, 74]],
      [38, [66, 69, 74]],
      [36, [67, 72, 76]],
      [38, [66, 69, 74]],
      [43, [67, 71, 74]],
      [43, [67, 71, 74]],
    ],
    melody: [
      [[0, 67, 1], [1, 71, 1], [2, 74, 2], [4, 79, 2], [6, 78, 1], [7, 79, 1]],
      [[0, 81, 3], [3, 78, 1], [4, 74, 4]],
      [[0, 76, 1], [1, 79, 1], [2, 83, 2], [4, 81, 2], [6, 79, 2]],
      [[0, 76, 6], [6, 74, 1], [7, 72, 1]],
      [[0, 71, 1], [1, 74, 1], [2, 79, 2], [4, 83, 2], [6, 81, 1], [7, 79, 1]],
      [[0, 78, 2], [2, 81, 2], [4, 86, 4]],
      [[0, 84, 2], [2, 83, 1], [3, 81, 1], [4, 79, 2], [6, 76, 2]],
      [[0, 78, 6]],
      [[0, 79, 2], [2, 76, 2], [4, 71, 2], [6, 76, 2]],
      [[0, 79, 3], [3, 76, 1], [4, 72, 4]],
      [[0, 74, 1], [1, 79, 1], [2, 83, 2], [4, 86, 2], [6, 83, 2]],
      [[0, 81, 6], [6, 78, 2]],
      [[0, 76, 2], [2, 79, 2], [4, 84, 3], [7, 83, 1]],
      [[0, 81, 2], [2, 78, 2], [4, 74, 2], [6, 78, 2]],
      [[0, 79, 8]],
      [[4, 74, 1], [5, 71, 1], [6, 74, 1], [7, 67, 1]],
    ],
    backing(_bar, [root, chord], play) {
      // Walking bass in quarters: root, fifth, octave, fifth.
      [0, 7, 12, 7].forEach((o, i) => play("bass", root + o, i * 2, 2, 0.06));
      // Chord stabs on the off-beats.
      [1, 3, 5, 7].forEach((s) => chord.forEach((m) => play("pluck", m - 12, s, 1, 0.012)));
      play("kick", 0, 0, 1, 0.08);
      play("kick", 0, 4, 1, 0.08);
      play("snare", 0, 2, 1, 0.03);
      play("snare", 0, 6, 1, 0.03);
    },
  },

  // Battle: quick and in A minor, a square-wave lead over an arpeggio.
  battle: {
    slot: 0.15,
    perBar: 8,
    swing: 0.5,
    lead: "chip",
    leadVol: 0.012,
    chords: [
      [45, [69, 72, 76]],
      [41, [65, 69, 72]],
      [43, [67, 71, 74]],
      [40, [64, 67, 71]],
      [45, [69, 72, 76]],
      [41, [65, 69, 72]],
      [38, [62, 65, 69]],
      [40, [64, 68, 71]],
    ],
    melody: [
      [69, 72, 76, 72, 81, 76, 72, 76],
      [69, 72, 77, 72, 81, 77, 72, 77],
      [71, 74, 79, 74, 83, 79, 74, 79],
      [71, 76, 79, 76, 83, 79, 76, 71],
      [81, 0, 81, 79, 76, 0, 72, 76],
      [77, 0, 77, 76, 72, 0, 69, 72],
      [74, 77, 81, 77, 86, 81, 77, 74],
      [76, 80, 83, 80, 88, 83, 80, 76],
    ].map((bar) => bar.flatMap((midi, slot): Note[] => (midi ? [[slot, midi, 1.6]] : []))),
    backing(_bar, [root, [c0, c1, c2]], play) {
      [0, 4].forEach((half) => {
        play("bass", root, half, 1.8, 0.05);
        play("bass", root + 7, half + 2, 1.2, 0.035);
        // The chord in sixteenths, two octaves above the bass.
        [c0, c1, c2, c0 + 12, c2, c1, c0, c1].forEach((m, i) => play("arp", m, half + i / 2, 0.5, 0.006));
        play("kick", 0, half, 1, 0.07);
        play("snare", 0, half + 2, 1, 0.025);
      });
    },
  },
};

/** The tune for an hour of the day (0 to 23): mornings, afternoons, then evening and night. */
export function tuneFor(hour: number): Exclude<TuneName, "battle"> {
  if (hour >= 5 && hour < 11) return "route";
  if (hour >= 11 && hour < 18) return "cafe";
  return "waltz";
}

/** Seconds in one pass of a tune. */
export const loopLength = (tune: Tune) => tune.slot * tune.perBar * tune.chords.length;

/** When a slot of a bar sounds, in seconds from the bar's start. Off-beat eighths are swung. */
function slotTime(tune: Tune, slot: number) {
  const whole = Math.floor(slot);
  const beat = Math.floor(whole / 2);
  const offBeat = whole % 2 === 1;
  return beat * 2 * tune.slot + (offBeat ? 2 * tune.slot * tune.swing : 0) + (slot - whole) * tune.slot;
}

export type NoteEvent = { instrument: Instrument; midi: number; at: number; len: number; vol: number; bar: number; slot: number };

/** Every note of one pass of a tune, with its start and length in seconds. */
export function noteEvents(tune: Tune): NoteEvent[] {
  const bar = tune.slot * tune.perBar;
  const events: NoteEvent[] = [];
  tune.chords.forEach((chord, b) => {
    const play: Play = (instrument, midi, slot, len, vol) =>
      events.push({ instrument, midi, at: b * bar + slotTime(tune, slot), len: len * tune.slot, vol, bar: b, slot });
    tune.backing(b, chord, play);
    for (const [slot, midi, len] of tune.melody[b]) play(tune.lead, midi, slot, len, tune.leadVol);
  });
  return events;
}
