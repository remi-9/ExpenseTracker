// Partner Pokémon. Sprites, badges, item icons and cries are loaded at runtime from
// the PokeAPI project's public repos (see README → Pokémon resources). Nothing is bundled.
// Add a partner line by adding an entry: [dex number, name] for each stage.

const RAW = "https://raw.githubusercontent.com/PokeAPI";

export const sprite = {
  /** Animated front sprite (Black/White style). Covers dex numbers 1–649. */
  pokemon: (dex: number, shiny = false) =>
    `${RAW}/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${shiny ? "shiny/" : ""}${dex}.gif`,
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
  { id: "chikorita", stages: [{ dex: 152, name: "Chikorita" }, { dex: 153, name: "Bayleef" }, { dex: 154, name: "Meganium" }] },
  { id: "cyndaquil", stages: [{ dex: 155, name: "Cyndaquil" }, { dex: 156, name: "Quilava" }, { dex: 157, name: "Typhlosion" }] },
  { id: "totodile", stages: [{ dex: 158, name: "Totodile" }, { dex: 159, name: "Croconaw" }, { dex: 160, name: "Feraligatr" }] },
  { id: "treecko", stages: [{ dex: 252, name: "Treecko" }, { dex: 253, name: "Grovyle" }, { dex: 254, name: "Sceptile" }] },
  { id: "torchic", stages: [{ dex: 255, name: "Torchic" }, { dex: 256, name: "Combusken" }, { dex: 257, name: "Blaziken" }] },
  { id: "mudkip", stages: [{ dex: 258, name: "Mudkip" }, { dex: 259, name: "Marshtomp" }, { dex: 260, name: "Swampert" }] },
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

// ---- Category icons -----------------------------------------------------------
// A category's icon is the name of a PokeAPI item sprite (or any emoji).
// These are the ones offered in the picker; any item name from the sprites repo works.

export const ITEM_ICONS = [
  "nugget", "big-nugget", "relic-gold", "coin-case", "amulet-coin", "pearl", "stardust", "star-piece",
  "poke-ball", "great-ball", "ultra-ball", "premier-ball", "potion", "full-restore", "rare-candy", "lucky-egg",
  "oran-berry", "sitrus-berry", "leftovers", "fresh-water", "lemonade", "moomoo-milk", "old-gateau", "casteliacone",
  "thunder-stone", "fire-stone", "water-stone", "leaf-stone", "bicycle", "ss-ticket", "town-map", "pal-pad",
  "secret-key", "card-key", "parcel", "grass-mail", "fashion-case", "poke-doll", "heart-scale", "sweet-heart",
  "soothe-bell", "tm-normal", "journal", "old-rod", "escape-rope", "silk-scarf", "black-glasses", "exp-share",
];

export const DEFAULT_ICON = { income: "nugget", saving: "amulet-coin", expense: "poke-ball" } as const;
