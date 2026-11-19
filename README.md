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
    sfx.ts                   the synth: every sound effect and the music
    demo.ts                  sample data for demo mode
    format.ts                money and month helpers
  components/
    ui.tsx                   Panel, Bar, MonthPicker, CategoryIcon, Dialog
    typewriter.tsx           dialog box that types its lines out
    battle.tsx               the result shown after logging an entry
    submit.tsx               submit button with a saving state
    sprite.tsx               tab icons, chest, shield and hearts drawn as character grids
    charts.tsx               pay split, stepped line, waffle and calendar charts
    wild.tsx                 wild Pokémon that wander through Home and can be caught
    partner.tsx              partner sprite, partner picker, trainer picker
    scene.tsx                Home scene: six environments that scroll past
    sound.tsx                sound toggle, click sounds, music
    nav.tsx                  tab bar and theme toggle
  app/
    (game)/template.tsx      short entrance animation on every tab change
    (game)/page.tsx          Home: scene, wallet HP, narration, pay split, balance trend
    (game)/log/              add and browse entries
    (game)/stats/            score strip, six-month chart, waffle, spending calendar
    (game)/quests/           trainer card, quests, badges
    (game)/dex/              Pokédex of everything you have caught
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
- **Wild Pokémon:** random Pokémon (dex 1–649) wander through the Home scene. Tap one to throw a Poké Ball. Every entry you log earns one ball, so balls left = entries − catches. Catches fill the Dex tab, and any caught Pokémon can be your partner (caught partners don't evolve).
- **Other classics:** savings quests are treasure chests that open when the goal is met, budgets are shields that crack when blown, and the Stats tab has an arcade score strip with a hi-score (your best month) and ten hearts of life.

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
| Trainer sprites | [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/trainers/) `trainers/{name}.png` | trainer in the scene and on the card |
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
- **Music:** an original sixteen-bar chiptune loop written for this app, with lead, bass, a soft arpeggio and light drums (`LEAD` and `BASS` in `sfx.ts`). There is no file and nothing to license. Edit the note lists to change the tune.
- **Your own track instead:** save it as `public/audio/pokemon-center.mp3` and restart `bun dev`; it replaces the built-in loop at 12% volume. The folder is gitignored. Game soundtracks are copyrighted recordings, which is why none is included.

## Extending it

| To add… | Do this |
| --- | --- |
| A category | Setup tab: one tap from Quick add, or make your own. No code. |
| A quick-add preset | Add an entry to `PRESETS` in `partners.ts`. |
| A trainer | Add an entry to `TRAINERS` in `partners.ts` (any name from the Showdown trainers folder). |
| A sound | Add an entry to `SOUNDS` in `sfx.ts`. |
| An icon choice | Add an item name to `ITEM_ICONS` in `partners.ts`. |
| A quest | Give a category a monthly target. No code. |
| A badge | Add an entry to `BADGES` in `game.ts`. |
| A tab | Add a folder under `app/(game)/`, a line to `TABS` in `nav.tsx` and an icon grid in `sprite.tsx`. |
| An environment | Add an entry to `ENVS` in `scene.tsx`: sky and ground colours plus two character grids. |
| A partner line | Add an entry to `PARTNERS` in `partners.ts` (dex numbers 1–649 have animated sprites). |
| A colour or theme tweak | Edit the tokens at the top of `globals.css`. |
| Another currency or time zone | `config.ts`. |

## Not built yet (on purpose)

Kept out of the skeleton until they are needed:

- Editing an entry (delete and re-add for now)
- One-tap "log this month's fixed bills"
- Multiple bank accounts and transfers between them
- CSV import/export
