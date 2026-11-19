# Pocket Tracker

A personal expense tracker that plays like a handheld RPG. It replaces the
`Expense Planner.xlsx` spreadsheet: your month's pay is your partner Pokémon's
HP bar, logging entries earns XP, and savings goals are quests.

- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + magic-link login) · Vercel
- **Single user.** Row-level security means only your login can read or write your rows.
- **Pixel theme** with day and night modes (follows your system, toggle in the header).

## Run it

```bash
bun install
bun dev
```

Open http://localhost:3000. With no Supabase keys the app starts in **demo
mode**: sample data, nothing saved. Logging an entry still plays its result as a
preview, so it is the quickest way to look around.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL editor → run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Copy `.env.example` to `.env.local` and fill in the project URL and key
   (Project Settings → API).
4. Authentication → URL Configuration → add `http://localhost:3000/auth/callback`
   (and later your Vercel URL) to **Redirect URLs**.
5. `bun dev`, sign in with your email, click the link.
6. SQL editor → run [`supabase/seed.sql`](supabase/seed.sql) for the starter
   categories. If you have `supabase/seed.local.sql` (your spreadsheet history,
   not committed), run it next.
7. Authentication → Sign In / Providers → turn off **Allow new users to sign up**,
   or set `ALLOWED_EMAIL` so only you can request a link.

## Deploy to Vercel

Push to GitHub, import the repo in Vercel, add the same environment variables,
deploy. Then add `https://YOUR-APP.vercel.app/auth/callback` to Supabase's
Redirect URLs and set **Site URL** to your Vercel URL.

## How it's organised

```
supabase/
  migrations/0001_init.sql   schema: 3 tables, 1 view, RLS
  seed.sql                   starter categories
src/
  proxy.ts                   session refresh + login redirect (Next 16's "middleware")
  lib/
    config.ts                app name, currency, time zone, demo-mode switch
    data.ts                  every read from Supabase
    actions.ts               every write to Supabase (server actions)
    game.ts                  all game rules: summary, XP, levels, quests, badges
    partners.ts              partners, trainers, icons, category presets, sprite URLs
    sfx.ts                   the synth: every sound effect and both tunes
    fight.ts                 battle rules and roguelike content (moves, damage, areas, upgrades)
    demo.ts                  sample data for demo mode
    format.ts                money and month helpers
  components/
    ui.tsx                   Panel, Bar, MonthPicker, CategoryIcon, Dialog
    typewriter.tsx           dialog box that types its lines out
    battle.tsx               the result shown after logging an entry
    submit.tsx               submit button with a saving state
    sprite.tsx               tab icons, chest, shield and hearts drawn as character grids
    charts.tsx               pay split, stepped line, waffle and calendar charts
    wild.tsx                 wild Pokémon that turn up on Home; tap one to battle it
    fight.tsx                the turn-based battle screen
    expedition.tsx           the roguelike run: floors, paths, upgrades
    partner.tsx              partner sprite, partner picker, trainer picker
    scene.tsx                Home scene: battle backdrops that fade from place to place
    sound.tsx                sound toggle, click sounds, music
    nav.tsx                  tab bar and theme toggle
  app/
    (game)/template.tsx      short entrance animation on every tab change
    (game)/page.tsx          Home: scene, wallet HP, narration, pay split, balance trend
    (game)/log/              add and browse entries
    (game)/stats/            score strip, six-month chart, waffle, spending calendar
    (game)/quests/           trainer card, quests, badges
    (game)/battle/           expeditions and wild battles
    (game)/dex/              your team and the Pokédex
    (game)/setup/            trainer, partner and categories
    login/ · auth/callback/  magic-link login
    globals.css              theme tokens and the pixel building blocks
```

Pages are server components that call `data.ts`; forms post to `actions.ts`.
There is no client-side state library and no API layer.

## Data model

| Table | What it holds |
| --- | --- |
| `categories` | name, `kind` (`income` / `expense` / `saving`), `icon` (an item sprite name, `pkmn-25` for a Pokémon, or an emoji), `is_fixed`, optional `monthly_target` |
| `transactions` | category, positive `amount`, `occurred_on`, note |
| `catches` | one row per Pokémon caught (`dex` number, `caught_at`) |
| `month_totals` (view) | total and entry count per month per category |

How the spreadsheet maps onto it:

| Spreadsheet | Here |
| --- | --- |
| Income columns (Salary, Second salary, Other income) | `income` categories |
| Fixed columns (Family, Relatives, Internet, Electricity) | `expense` categories with `is_fixed` |
| Save column | a `saving` category with a monthly goal |
| Expenses sheet rows | transactions |
| Bank tracker | **Bank balance** = all income − all expenses (savings stay in the bank) |
| Remaining from Salary | **Wallet HP** = income − expenses − savings, for the month |

The starting bank balance is one `Opening Balance` income entry.

## The game

Almost all of it is computed from `month_totals` in [`src/lib/game.ts`](src/lib/game.ts),
so you can change the rules at any time and your level simply recalculates.
The only game state that is stored is the Pokédex (`catches`); your trainer and
partner choices are cookies.

- **Partner:** pick one of twelve starters on first visit (change it on the Quests tab). It shivers when wallet HP is low, faints when the month is overspent, and evolves at levels 5 and 10. Click it to pet it. The choice is a cookie, not a database row.
- **Logging is a battle:** after you save an entry the Log tab plays the result. Spending hits your partner's HP ("super effective" at 10% of the month's income or more, "not very effective" at 1% or less), income heals it, and savings go to the PC. Enough XP levels it up or evolves it on the spot. The result is worked out from the entry and the month's totals (`components/battle.tsx`).
- **Shiny month:** log income and complete every quest in a month, and your partner is shiny for that month.
- **Wallet HP:** share of the month's income still unspent. Green above 50%, gold above 20%, red below.
- **XP:** 10 per entry logged, plus 1 per ₱100 saved. Levels need 100, 300, 600, 1000… XP.
- **Quests:** any saving category with a target ("set aside ₱10,000") or expense category with a target ("keep Food under ₱6,000").
- **Badges:** the eight Kanto gym badges, listed in `game.ts`; each is a name plus an `earned()` function.
- **Trainer card:** rank, money, savings, entries and badges, at the top of the Quests tab. Pick which famous trainer you are on the Setup tab.
- **Wild Pokémon:** random Pokémon (dex 1–649) turn up in the Home scene. Tap one to battle it. Every entry you log earns one Poké Ball, so balls left = entries − catches; a ball is only used up by a successful catch.
- **Team:** your partner plus up to five Pokémon you have caught, chosen on the Dex tab. A caught Pokémon can also be made your partner (caught partners don't evolve).
- **Other classics:** savings quests are treasure chests that open when the goal is met, budgets are shields that crack when blown, and the Stats tab has an arcade score strip with a hi-score (your best month) and ten hearts of life.

## Battles

The Battle tab is a roguelike expedition; the rules are in [`src/lib/fight.ts`](src/lib/fight.ts).

**Your budget sets the starting conditions:**

- Team level is five per trainer level, so logging and saving make the team stronger.
- You start with one Potion, plus one per quest complete this month, plus one if wallet HP is above half.
- An overspent month starts the team at 70% HP.

**A run:**

- Each floor offers two or three paths: tall grass (a wild Pokémon you can catch), a trainer, a Pokémon Center (heal half), or a Poké Mart (a Potion).
- Every fifth floor is a gym leader. Areas change every five floors, each with its own backdrop and favoured types.
- HP carries over between battles. The team gains a level per win and gets 15% HP back after each battle.
- Beating a trainer or gym leader lets you pick one of three upgrades (Protein, Leftovers, Scope Lens and so on). They stack.
- A wild Pokémon you catch joins the run if you have room, and goes into your Pokédex for good.
- The run ends when the whole team has fainted. The run in progress and your best floor are saved in the browser.

**A battle** is turn-based: Fight, throw a Ball (wild only), use a Potion, switch, or Run (wild only).

- Stats, types and the type chart are real (from PokeAPI); the formulas are simplified. Attack is the better of attack and special attack; defense is the average of the two defenses.
- Every Pokémon has four moves built from its types: a reliable light attack, a heavy one that can miss, a third option, and Recover (twice per battle).
- Speed decides who goes first. Anything other than a move gives the opponent a free hit.
- A ball is more likely to hold the lower the target's HP (20% at full, up to 95%).

## Pokémon resources

Nothing Pokémon-owned is stored in this repo. Images and cries load at runtime
from the PokeAPI project's public GitHub repos; the URL builders are in
[`src/lib/partners.ts`](src/lib/partners.ts).

| What | Source | Used for |
| --- | --- | --- |
| Animated sprites | [PokeAPI/sprites](https://github.com/PokeAPI/sprites) `pokemon/versions/generation-v/black-white/animated/{dex}.gif` (and `animated/shiny/`) | partner on Home, Log and Quests |
| Static sprites | same repo, `pokemon/{dex}.png` | starter picker |
| Gym badges | same repo, `badges/{1-8}.png` | badge tiles |
| Item icons | same repo, `items/{name}.png` | category icons, Poké Ball in the header |
| Cries | [PokeAPI/cries](https://github.com/PokeAPI/cries) `cries/pokemon/latest/{dex}.ogg` | click your partner |
| Menu icons | same repo, `pokemon/versions/generation-vii/icons/{dex}.png` | category icons, partner picker |
| Back sprites | same repo, `…/animated/back/{dex}.gif` | your side of a battle |
| Trainer sprites | [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/trainers/) `trainers/{name}.png` | your trainer, rival trainers, gym leaders |
| Battle backdrops | [Pokémon Showdown](https://play.pokemonshowdown.com/fx/) `fx/bg-{place}.png` (15 Gen 5-style scenes) | Home scene and battles |
| Stats, types, type chart | [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv) `pokemon_stats.csv`, `pokemon_types.csv`, `type_efficacy.csv` | battles (`getBattleData` in `data.ts`, cached for a month) |
| Data API | [pokeapi.co](https://pokeapi.co/docs/v2) (free, no key) | Pokémon names (`getPokemonNames` in `data.ts`, cached for a month) |

Other useful sources: [Pokémon Showdown sprites](https://play.pokemonshowdown.com/sprites/)
and [msikma/pokesprite](https://github.com/msikma/pokesprite) (box and item icons).

Pokémon and all related images and sounds are © Nintendo, Game Freak and The
Pokémon Company. These repos' own licences cover their code and curation, not
the artwork. That is normal for a personal fan project; keep this app personal
and non-commercial.

## Sound

Sound is off until you press **♪** in the header, and stays quiet by design.

- **Effects** are synthesized in the browser by a small three-channel synth in `sfx.ts` (square, triangle and noise). There are about twenty: tab changes, month arrows, chips, dialog text ticks, an impact when spending lands, a rising heal for income, coins dropping for savings, level-up and evolution fanfares, a sting when a wild Pokémon appears, the ball throw and wobble, and a catch jingle.
- **Choosing a sound:** give any element `data-sfx="name"` (a key of `SOUNDS` in `sfx.ts`), or `data-sfx="none"` to silence it. Plain buttons and links get `select`.
- **Cry:** click your partner, or tap a wild Pokémon you already own.
- **Music:** two original chiptune loops written for this app, each with lead, bass, a soft arpeggio and light drums: a relaxed one for the menus and a quicker minor-key one for battles (`SONGS` in `sfx.ts`). There are no files and nothing to license. Edit the note lists to change a tune.
- **Your own track instead:** save it as `public/audio/pokemon-center.mp3` and restart `bun dev`; it replaces the built-in loop at 12% volume. The folder is gitignored. Game soundtracks are copyrighted recordings, which is why none is included.

## Extending it

| To add… | Do this |
| --- | --- |
| A category | Setup tab: one tap from Quick add, or make your own. No code. |
| A quick-add preset | Add an entry to `PRESETS` in `partners.ts`. |
| A trainer | Add an entry to `TRAINERS` in `partners.ts` (any name from the Showdown trainers folder). |
| A sound | Add an entry to `SOUNDS` in `sfx.ts`. |
| A run upgrade | Add an entry to `BOONS` in `fight.ts` (its id is the item sprite shown), then apply it in `fight.tsx` or `expedition.tsx`. |
| An expedition area | Add an entry to `BIOMES` in `fight.ts`: a name, a Showdown backdrop and favoured type ids. |
| An icon choice | Add an item name to `ITEM_ICONS` in `partners.ts`. |
| A quest | Give a category a monthly target. No code. |
| A badge | Add an entry to `BADGES` in `game.ts`. |
| A tab | Add a folder under `app/(game)/`, a line to `TABS` in `nav.tsx` and an icon grid in `sprite.tsx`. |
| A place on Home | Add a backdrop name to `PLACES` in `scene.tsx`. |
| A partner line | Add an entry to `PARTNERS` in `partners.ts` (dex numbers 1–649 have animated sprites). |
| A colour or theme tweak | Edit the tokens at the top of `globals.css`. |
| Another currency or time zone | `config.ts`. |

## Not built yet (on purpose)

Kept out of the skeleton until they are needed:

- Editing an entry (delete and re-add for now)
- One-tap "log this month's fixed bills"
- Multiple bank accounts and transfers between them
- CSV import/export
