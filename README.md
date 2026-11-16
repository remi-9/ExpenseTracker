# Pocket Ledger

A personal expense tracker that plays like a handheld RPG. It replaces the
`Expense Planner.xlsx` spreadsheet: your month's pay is an HP bar, logging
entries earns XP, and savings goals are quests.

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
    demo.ts                  sample data for demo mode
    format.ts                money and month helpers
  components/
    ui.tsx                   Panel, Bar, MonthPicker, Dialog
    nav.tsx                  menu and theme toggle
  app/
    (game)/page.tsx          Home: wallet status, quests, breakdown, badges
    (game)/log/page.tsx      add and browse entries
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

- **Wallet HP:** share of the month's income still unspent. Green above 50%, gold above 20%, red below.
- **XP:** 10 per entry logged, plus 1 per ₱100 saved. Levels need 100, 300, 600, 1000… XP.
- **Quests:** any saving category with a target ("set aside ₱10,000") or expense category with a target ("keep Food under ₱6,000").
- **Badges:** a list in `game.ts`; each is a name plus an `earned()` function.

## Extending it

| To add… | Do this |
| --- | --- |
| A category | Categories page. No code. |
| A quest | Give a category a monthly target. No code. |
| A badge | Add an entry to `BADGES` in `game.ts`. |
| A menu page | Add a folder under `app/(game)/` and a line to `MENU` in `nav.tsx`. |
| A colour or theme tweak | Edit the tokens at the top of `globals.css`. |
| Another currency or time zone | `config.ts`. |

## Not built yet (on purpose)

Kept out of the skeleton until they are needed:

- Editing an entry (delete and re-add for now)
- One-tap "log this month's fixed bills"
- Multiple bank accounts and transfers between them
- Charts and month-over-month trends
- CSV import/export
