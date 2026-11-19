// Partner Pokémon. Sprites, badges, item icons and cries are loaded at runtime from
// the PokeAPI project's public repos (see README → Pokémon resources). Nothing is bundled.
// Add a partner line by adding an entry: [dex number, name] for each stage.

const RAW = "https://raw.githubusercontent.com/PokeAPI";

export const sprite = {
  /** Animated front sprite (Black/White style). Covers dex numbers 1–649. */
  pokemon: (dex: number, shiny = false) =>
    `${RAW}/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${shiny ? "shiny/" : ""}${dex}.gif`,
  /** The same sprite seen from behind, for your side of a battle. */
  back: (dex: number) =>
    `${RAW}/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/${dex}.gif`,
  /** Small static sprite, for pickers. */
  still: (dex: number) => `${RAW}/sprites/master/sprites/pokemon/${dex}.png`,
  /** Kanto gym badges, 1–8. */
  badge: (n: number) => `${RAW}/sprites/master/sprites/badges/${n}.png`,
  item: (name: string) => `${RAW}/sprites/master/sprites/items/${name}.png`,
  /** Small menu icon of a Pokémon, as seen in the party screen. */
  icon: (dex: number) => `${RAW}/sprites/master/sprites/pokemon/versions/generation-vii/icons/${dex}.png`,
  /** Trainer sprites are hosted by Pokémon Showdown. */
  trainer: (id: string) => `https://play.pokemonshowdown.com/sprites/trainers/${id}.png`,
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

/** Wild Pokémon come from this range (every one has an animated sprite). */
export const MAX_DEX = 649;

/**
 * The partner as it looks at this player level, or null if none is chosen yet.
 * A starter line ("gastly") evolves with level; a caught Pokémon ("dex:25") stays as it is.
 */
export function partnerAt(id: string | undefined, level: number, names: string[] = []): Partner | null {
  const dex = id?.startsWith("dex:") ? Number(id.slice(4)) : 0;
  if (dex >= 1 && dex <= MAX_DEX) {
    return { id: id!, dex, name: names[dex - 1] ?? `No. ${dex}`, nextName: null, evolvesAt: null };
  }
  const line = PARTNERS.find((p) => p.id === id);
  if (!line) return null;
  const i = level >= EVOLVE_AT[2] ? 2 : level >= EVOLVE_AT[1] ? 1 : 0;
  const next = line.stages[i + 1];
  return { id: line.id, ...line.stages[i], nextName: next?.name ?? null, evolvesAt: next ? EVOLVE_AT[i + 1] : null };
}

// ---- Trainers ---------------------------------------------------------------------

export const TRAINERS = [
  { id: "red", name: "Red" },
  { id: "blue", name: "Blue" },
  { id: "ash", name: "Ash" },
  { id: "misty", name: "Misty" },
  { id: "brock", name: "Brock" },
  { id: "oak", name: "Prof. Oak" },
  { id: "ethan", name: "Ethan" },
  { id: "lyra", name: "Lyra" },
  { id: "lance", name: "Lance" },
  { id: "brendan", name: "Brendan" },
  { id: "may", name: "May" },
  { id: "steven", name: "Steven" },
  { id: "lucas", name: "Lucas" },
  { id: "dawn", name: "Dawn" },
  { id: "cynthia", name: "Cynthia" },
  { id: "hilbert", name: "Hilbert" },
  { id: "hilda", name: "Hilda" },
  { id: "n", name: "N" },
  { id: "iris", name: "Iris" },
  { id: "leon", name: "Leon" },
];
export const DEFAULT_TRAINER = "red";

// ---- Category icons -----------------------------------------------------------
// A category's icon is one of:
//   an item sprite name ("nugget"), a Pokémon ("pkmn-25"), or any emoji.
// ITEM_ICONS is what the picker offers; any item name from the sprites repo works.

export const ITEM_ICONS = [
  "nugget", "big-nugget", "relic-gold", "coin-case", "amulet-coin", "pearl", "big-pearl", "stardust",
  "star-piece", "gold-teeth", "poke-ball", "great-ball", "ultra-ball", "master-ball", "premier-ball", "luxury-ball",
  "heal-ball", "dusk-ball", "lure-ball", "potion", "super-potion", "full-restore", "revive", "max-revive",
  "ether", "hp-up", "protein", "pp-up", "rare-candy", "lucky-egg", "exp-share", "sacred-ash",
  "oran-berry", "sitrus-berry", "lum-berry", "cheri-berry", "pecha-berry", "leftovers", "fresh-water", "lemonade",
  "moomoo-milk", "berry-juice", "honey", "old-gateau", "casteliacone", "lava-cookie", "rage-candy-bar", "big-mushroom",
  "tiny-mushroom", "thunder-stone", "fire-stone", "water-stone", "leaf-stone", "moon-stone", "bicycle", "ss-ticket",
  "town-map", "pal-pad", "vs-seeker", "poke-flute", "gb-sounds", "dowsing-machine", "silph-scope", "wide-lens",
  "secret-key", "card-key", "lift-key", "parcel", "grass-mail", "coupon-1", "journal", "fashion-case",
  "poke-doll", "poke-toy", "fluffy-tail", "heart-scale", "sweet-heart", "soothe-bell", "shell-bell", "cleanse-tag",
  "tm-normal", "old-rod", "escape-rope", "repel", "smoke-ball", "quick-claw", "silk-scarf", "choice-scarf",
  "black-glasses", "rare-bone", "sprayduck", "wailmer-pail", "apricorn-box",
];

export const DEFAULT_ICON = { income: "nugget", saving: "amulet-coin", expense: "poke-ball" } as const;

/** One-tap categories offered on the Setup tab. */
export const PRESETS: { name: string; kind: "income" | "expense" | "saving"; icon: string; is_fixed?: boolean }[] = [
  { name: "Groceries", kind: "expense", icon: "oran-berry" },
  { name: "Dining out", kind: "expense", icon: "leftovers" },
  { name: "Coffee", kind: "expense", icon: "moomoo-milk" },
  { name: "Transport", kind: "expense", icon: "bicycle" },
  { name: "Rent", kind: "expense", icon: "secret-key", is_fixed: true },
  { name: "Water", kind: "expense", icon: "fresh-water", is_fixed: true },
  { name: "Phone", kind: "expense", icon: "pal-pad", is_fixed: true },
  { name: "Subscriptions", kind: "expense", icon: "vs-seeker", is_fixed: true },
  { name: "Health", kind: "expense", icon: "potion" },
  { name: "Games", kind: "expense", icon: "poke-toy" },
  { name: "Clothes", kind: "expense", icon: "fashion-case" },
  { name: "Gifts", kind: "expense", icon: "parcel" },
  { name: "Travel", kind: "expense", icon: "ss-ticket" },
  { name: "Pets", kind: "expense", icon: "pkmn-133" },
  { name: "Education", kind: "expense", icon: "tm-normal" },
  { name: "Bonus", kind: "income", icon: "star-piece" },
  { name: "Freelance", kind: "income", icon: "stardust" },
  { name: "Gift received", kind: "income", icon: "pearl" },
  { name: "Emergency fund", kind: "saving", icon: "max-revive" },
  { name: "Travel fund", kind: "saving", icon: "town-map" },
  { name: "Gadget fund", kind: "saving", icon: "big-nugget" },
];
