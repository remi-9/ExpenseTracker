// Partner Pokémon. Sprites, badges, item icons and cries are loaded at runtime from
// the PokeAPI project's public repos (see README → Pokémon resources). Nothing is bundled.
// Add a partner line by adding an entry: [dex number, name] for each stage.

const RAW = "https://raw.githubusercontent.com/PokeAPI";

export const sprite = {
  /** Animated front sprite (Black/White style). Covers dex numbers 1–649. */
  pokemon: (dex: number) =>
    `${RAW}/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${dex}.gif`,
  /** Small static sprite, for pickers. */
  still: (dex: number) => `${RAW}/sprites/master/sprites/pokemon/${dex}.png`,
  /** Kanto gym badges, 1–8. */
  badge: (n: number) => `${RAW}/sprites/master/sprites/badges/${n}.png`,
  item: (name: string) => `${RAW}/sprites/master/sprites/items/${name}.png`,
  cry: (dex: number) => `${RAW}/cries/main/cries/pokemon/latest/${dex}.ogg`,
};

type Stage = { dex: number; name: string };

export const PARTNERS: { id: string; stages: [Stage, Stage, Stage] }[] = [
  { id: "bulbasaur", stages: [{ dex: 1, name: "Bulbasaur" }, { dex: 2, name: "Ivysaur" }, { dex: 3, name: "Venusaur" }] },
  { id: "charmander", stages: [{ dex: 4, name: "Charmander" }, { dex: 5, name: "Charmeleon" }, { dex: 6, name: "Charizard" }] },
  { id: "squirtle", stages: [{ dex: 7, name: "Squirtle" }, { dex: 8, name: "Wartortle" }, { dex: 9, name: "Blastoise" }] },
  { id: "pichu", stages: [{ dex: 172, name: "Pichu" }, { dex: 25, name: "Pikachu" }, { dex: 26, name: "Raichu" }] },
  { id: "gastly", stages: [{ dex: 92, name: "Gastly" }, { dex: 93, name: "Haunter" }, { dex: 94, name: "Gengar" }] },
  { id: "dratini", stages: [{ dex: 147, name: "Dratini" }, { dex: 148, name: "Dragonair" }, { dex: 149, name: "Dragonite" }] },
];

/** Your level at which the partner reaches stage 1, 2 and 3. */
export const EVOLVE_AT = [1, 5, 10];

export type Partner = Stage & { id: string; nextName: string | null; evolvesAt: number | null };

/** The partner as it looks at this player level, or null if none is chosen yet. */
export function partnerAt(id: string | undefined, level: number): Partner | null {
  const line = PARTNERS.find((p) => p.id === id);
  if (!line) return null;
  const i = level >= EVOLVE_AT[2] ? 2 : level >= EVOLVE_AT[1] ? 1 : 0;
  const next = line.stages[i + 1];
  return { id: line.id, ...line.stages[i], nextName: next?.name ?? null, evolvesAt: next ? EVOLVE_AT[i + 1] : null };
}
