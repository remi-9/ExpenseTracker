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
mode**: sample data, nothing saved. That is the quickest way to look around.

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
  migrations/0001_init.sql   schema: 2 tables, 1 view, RLS
  seed.sql                   starter categories
src/
  proxy.ts                   session refresh + login redirect (Next 16's "middleware")
  lib/
    config.ts                app name, currency, time zone, demo-mode switch
    data.ts                  every read from Supabase
    actions.ts               every write to Supabase (server actions)
    game.ts                  all game rules: summary, XP, levels, badges
    partners.ts              partner lines, evolution levels, PokeAPI sprite URLs
    sfx.ts                   synthesized sound effects and cries
    demo.ts                  sample data for demo mode
    format.ts                money and month helpers
  components/
    ui.tsx                   Panel, Bar, MonthPicker, Dialog
    sprite.tsx               tab icons drawn as character grids
    partner.tsx              partner Pokémon sprite and the starter picker
    scene.tsx                Home scene: six environments that scroll past
    sound.tsx                sound toggle, menu ticks, music, saved chime
    nav.tsx                  tab bar and theme toggle
  app/
    (game)/page.tsx          Home: partner scene, wallet HP, next quest, latest entries
    (game)/log/              add and browse entries
    (game)/stats/            six-month chart and where the month went
    (game)/quests/           level, quests and badges
    (game)/categories/       add and archive categories
    login/ · auth/callback/  magic-link login
    globals.css              theme tokens and the pixel building blocks
```

Pages are server components that call `data.ts`; forms post to `actions.ts`.
There is no client-side state library and no API layer.

## Data model

| Table | What it holds |
| --- | --- |
| `categories` | name, `kind` (`income` / `expense` / `saving`), icon, `is_fixed`, optional `monthly_target` |
| `transactions` | category, positive `amount`, `occurred_on`, note |
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

All of it is computed from `month_totals` in [`src/lib/game.ts`](src/lib/game.ts).
Nothing game-related is stored, so you can change the rules at any time and
your level simply recalculates.

- **Partner:** pick a starter on first visit (change it on the Quests tab). It shivers when wallet HP is low, faints when the month is overspent, and evolves at levels 5 and 10. The choice is a cookie, not a database row.
- **Wallet HP:** share of the month's income still unspent. Green above 50%, gold above 20%, red below.
- **XP:** 10 per entry logged, plus 1 per ₱100 saved. Levels need 100, 300, 600, 1000… XP.
- **Quests:** any saving category with a target ("set aside ₱10,000") or expense category with a target ("keep Food under ₱6,000").
- **Badges:** the eight Kanto gym badges, listed in `game.ts`; each is a name plus an `earned()` function.

## Pokémon resources

Nothing Pokémon-owned is stored in this repo. Images and cries load at runtime
from the PokeAPI project's public GitHub repos; the URL builders are in
[`src/lib/partners.ts`](src/lib/partners.ts).

| What | Source | Used for |
| --- | --- | --- |
| Animated sprites | [PokeAPI/sprites](https://github.com/PokeAPI/sprites) `pokemon/versions/generation-v/black-white/animated/{dex}.gif` | partner on Home and Quests |
| Static sprites | same repo, `pokemon/{dex}.png` | starter picker |
| Gym badges | same repo, `badges/{1-8}.png` | badge tiles |
| Item icons | same repo, `items/{name}.png` | Poké Ball in the header |
| Cries | [PokeAPI/cries](https://github.com/PokeAPI/cries) `cries/pokemon/latest/{dex}.ogg` | click your partner |
| Data API | [pokeapi.co](https://pokeapi.co/docs/v2) (free, no key) | not called yet; use it for names, types or evolution chains |

Other useful sources: [Pokémon Showdown sprites](https://play.pokemonshowdown.com/sprites/)
and [msikma/pokesprite](https://github.com/msikma/pokesprite) (box and item icons).

Pokémon and all related images and sounds are © Nintendo, Game Freak and The
Pokémon Company. These repos' own licences cover their code and curation, not
the artwork. That is normal for a personal fan project; keep this app personal
and non-commercial.

## Sound

Sound is off until you press **♪** in the header, and stays quiet by design.

- **Effects** are synthesized in the browser (`sfx.ts`): a menu tick and a chime when an entry is saved. No audio files.
- **Cry:** click your partner.
- **Music:** an original eight-bar chiptune loop, written for this app and played by the same synth (`LEAD` and `BASS` in `sfx.ts`), so there is no file and nothing to license. Edit the note lists to change the tune.
- **Your own track instead:** save it as `public/audio/pokemon-center.mp3` and restart `bun dev`; it replaces the built-in loop at 12% volume. The folder is gitignored. Game soundtracks are copyrighted recordings, which is why none is included.

## Extending it

| To add… | Do this |
| --- | --- |
| A category | Categories page. No code. |
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
