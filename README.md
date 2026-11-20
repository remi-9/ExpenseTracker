# Pocket Tracker

A personal expense tracker that plays like a handheld RPG. It replaces the
`Expense Planner.xlsx` spreadsheet: your month's pay is your partner Pokémon's
HP bar, logging entries earns XP, savings goals are quests, your accounts are
your party, and your budget decides what you take into a roguelike expedition.

- **Stack:** Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase (Postgres and magic-link login), Vercel
- **Single user.** Row-level security means only your login can read or write your rows.
- **Pixel theme** with day and night modes. It follows your system; the sun or moon button in the header switches it.

## Run it

```bash
bun install
bun dev
```

Open http://localhost:3000. With no Supabase keys the app starts in **demo
mode**: sample data, plus up to 40 entries and a few transfers of your own kept in
a browser cookie. You can add, edit, undo and toss entries, pay bills and move money
between accounts, so it is the quickest way to try the flow. Categories, accounts
and bills can't be changed until Supabase is connected.

```bash
bun test     # the game and money rules
bun run lint
```

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the files in [`supabase/migrations/`](supabase/migrations/) in order:
   `0001_init.sql`, `0002_expedition.sql`, `0003_accounts_bills.sql`.
3. Copy `.env.example` to `.env.local` and fill in the project URL and key
   (under Project Settings, API).
4. Under Authentication, URL Configuration, add `http://localhost:3000/auth/callback`
   (and later your Vercel URL) to **Redirect URLs**.
5. `bun dev`, sign in with your email, click the link.
6. In the SQL editor, run [`supabase/seed.sql`](supabase/seed.sql) for the starter
   categories and a first account. If you have `supabase/seed.local.sql` (your own accounts,
   bills and history, not committed), run that instead.
7. Under Authentication, Sign In / Providers, turn off **Allow new users to sign up**,
   or set `ALLOWED_EMAIL` so only you can request a link.

**Already running an earlier version?** Run `0002_expedition.sql` and then
`0003_accounts_bills.sql` before deploying this code: the app reads the new columns
straight away. `0003` puts everything you have logged into a first account called
"Main account" and turns each category marked monthly into a bill due on the 1st, so
set the real due days in Bill's PC afterwards. At the bottom of that file is an
optional, commented-out block that moves an "Opening Balance" income entry onto the
account as its opening balance. It deletes that entry, so read it before running it.

## Or keep everything on your own computer

The same database can run on your machine, so nothing you log leaves it. You need
the [Supabase CLI](https://supabase.com/docs/guides/local-development) and a container
runtime such as Docker Desktop, OrbStack or Colima.

```bash
supabase start   # starts the database and runs the migrations the first time
bun dev
```

1. Put the API URL and publishable key that `supabase start` prints into `.env.local`.
2. Sign in at `localhost:3000/login`. The login email is not sent anywhere: open it in
   the local inbox at `http://127.0.0.1:54324`, in the same browser.
3. Load `supabase/seed.sql`, or your own `supabase/seed.local.sql`, with
   `docker exec -i supabase_db_ExpenseTracker psql -U postgres < supabase/seed.sql`.

`supabase stop` keeps your data; `supabase db reset` erases it. Export a CSV from Bag,
Data now and then as a backup. With Colima, published ports listen on every network
interface unless you forward them to `127.0.0.1` only, so check that before loading
real data.

## Deploy to Vercel

Push to GitHub, import the repo in Vercel, add the same environment variables,
deploy. Then add `https://YOUR-APP.vercel.app/auth/callback` to Supabase's
Redirect URLs and set **Site URL** to your Vercel URL.

## How it's organised

```
supabase/
  migrations/0001_init.sql            categories, transactions, catches, the month_totals view
  migrations/0002_expedition.sql      who you play as, the expedition in progress, finished expeditions
  migrations/0003_accounts_bills.sql  accounts, transfers, bills, the account_totals view
  seed.sql                            starter categories and a first account
src/
  proxy.ts                   session refresh + login redirect (Next 16's "middleware")
  lib/
    config.ts                app name, currency, time zone, demo-mode switch
    data.ts                  every read from Supabase
    actions.ts               every write to Supabase (server actions)
    game.ts                  trainer rules: summary, XP, levels, quests, badges
    money.ts                 account balances and bills: what is due, paid, overdue
    csv.ts                   reading and writing CSV, planning an import
    statement.ts             reading a bank statement, matching it to what is logged
    fight.ts                 battle content: moves, abilities, held items, areas, opponents
    battle.ts                the battle rules: one pure step per turn
    run.ts                   the roguelike run: map, rewards, shop, events, perks
    rng.ts                   the seeded random numbers battles and runs carry with them
    partners.ts              partners, trainers, icons, category presets, sprite URLs
    sfx.ts                   the synth: every sound effect and both tunes
    options.ts               text speed and window frame options
    backdrop.ts              backdrop colours and the rules that generate its patterns
    demo.ts                  sample data for demo mode, and the cookie your demo edits live in
    format.ts                money and month helpers
    *.test.ts                tests for the rules above (bun test)
  components/
    ui.tsx                   Panel, Bar, MonthPicker, CategoryIcon, Dialog
    typewriter.tsx           dialog box that types its lines out
    entry-result.tsx         the result shown after logging an entry
    note-field.tsx           the note box: suggests old notes and picks their category
    import-form.tsx          check a CSV file, then import it
    statement-form.tsx       check a statement, choose what each line is, import
    accounts.tsx             accounts drawn as a party, each with an HP bar
    submit.tsx               submit button with a saving state
    sprite.tsx               icons, chest, shield, hearts and town-map buildings drawn as character grids
    charts.tsx               pay split, stepped line, waffle and calendar charts
    wild.tsx                 wild Pokémon that turn up on Home; tap one to battle it
    fight.tsx                the battle screen: plays the frames each turn produces
    party.tsx                the party screen (lead on the left, the rest stacked on the right)
    expedition.tsx           the expedition screen: lobby, route map, rewards, shop, events
    partner.tsx              partner sprite, partner picker, trainer picker
    scene.tsx                Home scene: battle backdrops that fade from place to place
    backdrop.tsx             page backdrop: a colour layer and a generated pattern
    sound.tsx                sound toggle, click sounds, music
    nav.tsx                  start menu, town map, screen switcher, location banner, phone tab bar, keyboard shortcuts
  app/
    (game)/template.tsx      short entrance animation on every tab change
    (game)/page.tsx          Home: scene, wallet HP, narration, quick log, accounts, pay split
    (game)/layout.tsx        page frame: header with the Menu button, content, phone tab bar
    (game)/log/              the counter: add entries, pay bills, search and browse entries
    (game)/accounts/         accounts as a party: balances, transfers, add and edit
    (game)/bills/            Bill's PC: what comes round on a schedule, and this month's due list
    (game)/stats/            score strip, six-month chart, waffle, spending calendar
    (game)/quests/           trainer card, quests, badges
    (game)/battle/           expeditions and wild battles
    (game)/dex/              party screen and PC boxes
    (game)/setup/            Bag (categories), Trainer, Partner, Options, Data (import and export)
    export/                  every entry as a CSV file
    login/, auth/callback/   magic-link login
    globals.css              theme tokens and the pixel building blocks
```

Pages are server components that call `data.ts`; forms post to `actions.ts`.
There is no client-side state library and no API layer. The rules (`game.ts`,
`money.ts`, `battle.ts`, `run.ts`, `csv.ts`) are pure functions with tests.

## Logging an entry

The Log screen (the Poké Mart) is built for speed, because logging is the thing you do most.

- **The cursor starts in the amount.** Type it, press Enter, done. After a save the form clears and takes the cursor again, keeping the kind, category and account you just used.
- **Sums work.** `5390+764` or `14000-6154` is added up for you; commas and a peso sign are ignored.
- **Kind, category and account are one tap each.** Switching between spent, earned and saved is instant and keeps what you typed. Savings can also name an account the money was moved to.
- **Notes remember.** The note box suggests notes from any month, and choosing one selects the category it was last used with.
- **Dates:** Today, Yesterday, or another day. When you browse a past month, new entries default to that month.
- **Undo and edit.** The result of a save has an Undo button. Any entry card opens for editing when you tap it; tossing it asks first.
- **Entries are cards,** twelve to a page: a strip in the kind's colour (red spent, blue earned, violet saved) carrying the date and account, then the item, the amount, the category and note. Filter them to one kind with the chips above.
- **Search** looks through every month, by note or category name.
- **Quick log on Home.** One line (amount, category, account) logs an entry without leaving Home, and plays its result there.

## Accounts and bills

- **Accounts** (the Pokémon screen) are where money sits: a bank account, an e-wallet, cash, a credit card. Each has an opening balance and a Pokémon standing for it, and is drawn as a party member whose HP is what is left of what it held before this month's spending came out of it.
- **Transfers** move money between two accounts. They are neither income nor spending, so wallet HP and XP are untouched. Use them for cash withdrawals, e-wallet top-ups and paying off a card.
- **Money** is everything you hold: opening balances plus all income minus all spending.
- **Bills** (Bill's PC) are anything on a schedule: rent, a subscription, savings, even your pay. A bill has a category, a due day, a usual amount (or none, if it varies) and a usual account, and comes round every month or once a year.
- **The bills list** on the Log screen shows the month's bills soonest first: overdue, due within a week, later, or paid. One tap pays one, dated today; when you are catching up on another month the date starts on the due date and can be changed.
- **After bills** on the Log screen is what is left of the month's income once the bills still to pay are set aside. Home mentions bills that are overdue or due this week.
- **Import statement** on an account reads the statement or transaction history your bank or wallet lets you download, as a PDF or a CSV file. A PDF is opened in your browser, so the file and its password stay on your device. It finds the date, description, amount (or debit and credit) and balance columns by name, marks the lines you have already logged, and suggests what each new line is: a transfer when it names another of your accounts or is an ATM withdrawal, otherwise the category last used with that description. Lines you leave alone are not saved and show up again next time.
- **Check balance** on an account compares what it really holds with what your entries add up to, for today or an earlier day, and logs the difference as one entry. After a statement import the two are compared for you.
- **Import and export** live under Bag, Data: paste or choose a CSV file with `date`, `category` and `amount` columns (and optionally `note`, `account`, `kind`), check what it would bring in, then import. Export downloads every entry in the same shape.

## Data model

| Table | What it holds |
| --- | --- |
| `categories` | name, `kind` (`income` / `expense` / `saving`), `icon` (an item sprite name, `pkmn-25` for a Pokémon, or an emoji), optional `monthly_target` |
| `accounts` | name, `kind` (`bank` / `ewallet` / `cash` / `card`), `icon`, `opening_balance` |
| `transactions` | category, positive `amount`, `occurred_on`, note, `account_id`, `to_account_id` (savings moved to another account), `bill_id` (the bill it pays) |
| `transfers` | `from_account`, `to_account`, amount, date, note |
| `bills` | name, category, usual account, usual `amount` (or null), `due_day`, `cadence` (`monthly` / `yearly`), `due_month` |
| `catches` | one row per Pokémon caught (`dex` number, `caught_at`) |
| `players` | the partner, trainer and team you chose |
| `expedition_saves` | the expedition in progress, as JSON, saved after every step |
| `expedition_runs` | one row per finished expedition: floor, wins, whether it was cleared, the team and its knockouts |
| `month_totals` (view) | total and entry count per month per category |
| `account_totals` (view) | what each account has gained or lost since its opening balance |

How the spreadsheet maps onto it:

| Spreadsheet | Here |
| --- | --- |
| Income columns (each salary) | `income` categories, each with a bill for its pay day |
| Fixed columns (internet, electricity) | `expense` categories, each with a bill |
| Save column | a `saving` category with a monthly goal |
| Expenses sheet rows | transactions |
| The bank balance tracker | an account. Its balance is its opening balance plus what has gone in, minus what has come out |
| Remaining from Salary | **Wallet HP** = income − expenses − savings, for the month |

## The game

Almost all of it is computed from `month_totals` in [`src/lib/game.ts`](src/lib/game.ts),
so you can change the rules at any time and your level simply recalculates.
The game state that is stored is the Pokédex (`catches`), who you play as
(`players`) and your expeditions; everything else is worked out on the spot.

- **Partner:** pick one of twelve starters on first visit (change it under Setup, Partner). It shivers when wallet HP is low, faints when the month is overspent, and evolves at levels 5 and 10. Click it to pet it. On an expedition, any Pokémon evolves once the team reaches its level.
- **Logging is a battle:** after you save an entry the Log tab plays the result. Spending hits your partner's HP ("super effective" at 10% of the month's income or more, "not very effective" at 1% or less), income heals it, and savings go to the PC. Enough XP levels it up or evolves it on the spot. The result is worked out from the entry and the month's totals (`components/entry-result.tsx`).
- **Shiny month:** log income and complete every quest in a month, and your partner is shiny for that month.
- **Wallet HP:** share of the month's income still unspent. Green above 50%, gold above 20%, red below.
- **XP:** 10 per entry logged, plus 1 per ₱100 saved. Levels need 100, 300, 600, 1000… XP.
- **Quests:** any saving category with a target ("set aside ₱10,000") or expense category with a target ("keep Food under ₱6,000").
- **Badges:** 24 gym badges, eight each from Kanto, Johto and Hoenn, listed in `game.ts`. Each is a name plus an `earned()` function. Kanto is the opening stretch, Johto rewards steady habits, Hoenn staying power.
- **Trainer card:** rank, money, savings, entries and badges, at the top of the Quests tab. Pick which famous trainer you are on the Setup tab.
- **Wild Pokémon:** random Pokémon (dex 1–649) turn up in the Home scene. Tap one to battle it. Every entry you log earns one Poké Ball, so balls left = entries − catches; a ball is only used up by a successful catch.
- **Team:** your partner plus up to five Pokémon you have caught, chosen on the Dex tab. A caught Pokémon can also be made your partner (caught partners don't evolve).
- **Other classics:** savings quests are treasure chests that open when the goal is met, budgets are shields that crack when blown, and the Stats tab has an arcade score strip with a hi-score (your best month) and ten hearts of life.

## Menus

The interface borrows the layouts of the handheld games rather than a web dashboard.

| Screen | Called | Laid out like |
| --- | --- | --- |
| Navigation | Menu | the start menu: a pop-up list with your partner as the cursor, your accounts as a party beside it and a save-style summary under it. It can also be shown as a town map, each screen a building. Open it with the Menu button or the M key; Esc closes it. The header has previous and next arrows around the current screen's name, and a banner with the place name slides in when you arrive. Phones get a bar of four screens and Menu along the bottom |
| Home | Home | a message window on the left and a 2 × 2 command box on the right, as in a battle |
| Log | Poké Mart | a shop counter: your money, the bills and today's entries on the left, the entry on the right; tossing an entry asks YES / NO |
| Accounts | Pokémon | the party screen: one slot per account, each with an HP bar |
| Bills | Bill's PC | a PC box header, the bills as a list, a description window beside it |
| Stats | Pokégear | an arcade score strip and charts |
| Quests | your trainer's name | a trainer card with a badge case along the bottom |
| Battle | Battle | the route map, then FIGHT / BAG / POKéMON / RUN |
| Dex | Pokédex | the party screen, then PC boxes of 30 with a detail window for the one you pick |
| Setup, Bag | Bag | pockets on the left, the items in that pocket on the right, a description window below |
| Setup, Options | Options | one setting per line with its choices beside it: text speed, frame colour, backdrop colour, backdrop pattern, sound, day or night |

Building blocks, all in `globals.css`: `.window` (a framed message or menu box), `.menu` and `.menu-item`
(choices with a ▶ cursor), `.menu.commands` (the 2 × 2 box) and `.battle-bottom` (message beside commands).
Any element with `data-menu` gets arrow-key navigation between its choices.

Keyboard: **M** opens the menu, **1** to **9** and **0** jump to a screen, **[** and **]** step to the previous or next
screen, arrow keys move within a menu, and a skip link is the first Tab stop. Shortcuts are ignored while
you type in a field.

When wallet HP is in the red, Home chirps three times on arrival, the way a game does at low HP (with sound on).

Spacing follows one rule: windows and panels carry a 4px margin for their pixel border, and grids of them
(`.battle-bottom`, `.tiles`, `.shop`, `.bag`) add an 8px gap, so everything sits 16px apart, the same as the
gap between sections. Title bars and other dark strips use `--bar`, which stays dark in both themes.
Lists of entries share `EntryList` (`ui.tsx`), so dates, names and amounts line up everywhere.

## Battles

The Battle tab is a roguelike expedition. The content is in [`src/lib/fight.ts`](src/lib/fight.ts),
the turn rules in [`src/lib/battle.ts`](src/lib/battle.ts) and the run in [`src/lib/run.ts`](src/lib/run.ts).
Battles and runs are plain objects that carry their own random seed and are saved after every
step, so a run follows you between devices and reloading the page cannot undo a turn or re-roll a map.

**Your budget sets the starting conditions:**

- Team level is five per trainer level, so logging and saving make the team stronger.
- You start with one Potion, plus one per quest complete this month, plus one if wallet HP is above half.
- An overspent month starts the team at 70% HP.
- Every four badges sends one held item along with the team.
- Bills paid on time this month, with nothing overdue, earn an Amulet Coin: half again as many coins from every win.
- The month's biggest spending category decides the type of the champion's team.

**A run:**

- Each area is five floors: four rows of two or three stops, then a gym leader. The whole route is shown, and each stop leads only to the ones nearest it in the next row.
- Stops: tall grass (a wild Pokémon you can catch), a trainer, an ace trainer (harder, with a rare reward), a Pokémon Center (heal half), a Poké Mart, a move tutor, and something odd (an event with a bold choice and a safe one).
- HP carries over between battles. The team gains a level per win and gets 15% HP back after each battle. Wins pay coins, spent at the Mart on Potions, Revives, Rare Candy and held items.
- Beating a trainer lets you pick one of three rewards: an upgrade for the whole team (Protein, Iron and so on, which stack), a held item for one Pokémon, or a new move for one Pokémon in place of an old one. Some are rare.
- Pokémon evolve when the team reaches their level. A wild Pokémon you catch joins the run if you have room, and goes into your Pokédex for good.
- The champion waits on floor 25. Beating them clears the run; you can keep climbing afterwards, or head home at any time. The run ends when the whole team has fainted.
- Running from a wild Pokémon leaves you on the same floor.
- Finished runs are recorded. Your best floor and clears unlock starting perks for good (100 coins, a spare Potion, a held item, two extra levels), and each Pokémon's expeditions, knockouts and best floor show on its Dex entry.

**A battle** is turn-based: Fight, throw a Ball (wild only), use a Potion, switch, or Run (wild only).

- Stats, types, the type chart and evolutions are real (from PokeAPI); the formulas are simplified. Attack is the better of attack and special attack; defense is the average of the two defenses.
- Every Pokémon starts with four moves built from its types: a reliable light attack, a heavy one that can miss, a third option, and Recover (twice per battle). The rest are learned on a run: quick moves, draining and recoil moves, and moves that raise or lower attack, defense and speed.
- Status conditions: a burn halves damage dealt and chips HP, poison chips more, paralysis halves speed and sometimes costs a turn, sleep costs one to three. Some types are immune to each.
- Every species has one ability, set by its first type (Intimidate, Sturdy, Levitate, Static and twenty more), and can hold one item (Leftovers, Focus Sash, Life Orb, a Sitrus Berry and so on).
- Quick moves go first, then speed. Anything other than a move gives the opponent a free hit.
- Ace trainers and gym leaders pick their best move every turn, switch out of bad matchups, and their last Pokémon holds an item.
- A ball is more likely to hold the lower the target's HP (20% at full, up to 95%), and a little more if it is asleep or paralysed.

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

Sound is off until you press the note button in the header, and stays quiet by design.

- **Effects** are synthesized in the browser by a small three-channel synth in `sfx.ts` (square, triangle and noise). There are about twenty: tab changes, month arrows, chips, dialog text ticks, an impact when spending lands, a rising heal for income, coins dropping for savings, level-up and evolution fanfares, a sting when a wild Pokémon appears, the ball throw and wobble, and a catch jingle.
- **Choosing a sound:** give any element `data-sfx="name"` (a key of `SOUNDS` in `sfx.ts`), or `data-sfx="none"` to silence it. Plain buttons and links get `select`.
- **Cry:** click your partner, or tap a wild Pokémon you already own.
- **Music:** two original chiptune loops written for this app, each with lead, bass, a soft arpeggio and light drums: a relaxed one for the menus and a quicker minor-key one for battles (`SONGS` in `sfx.ts`). There are no files and nothing to license. Edit the note lists to change a tune.
- **Your own track instead:** save it as `public/audio/pokemon-center.mp3` and restart `bun dev`; it replaces the built-in loop at 12% volume. The folder is gitignored. Game soundtracks are copyrighted recordings, which is why none is included.

## Extending it

| To add… | Do this |
| --- | --- |
| A category | In Setup, open the Bag, pick a pocket and choose New item: one tap from the suggestions, or make your own. No code. |
| A quick-add preset | Add an entry to `PRESETS` in `partners.ts`. |
| A trainer | Add an entry to `TRAINERS` in `partners.ts` (any name from the Showdown trainers folder). |
| A sound | Add an entry to `SOUNDS` in `sfx.ts`. |
| A backdrop pattern | Add a rule to `RULES` in `lib/backdrop.ts`: a function that says whether the pixel at (x, y) is on. |
| A backdrop colour | Add an entry to `TONE_COLORS` in `lib/backdrop.ts`: a name with its day and night shades. |
| A frame colour | Add an id to `FRAMES` in `options.ts` and a `.app[data-frame="…"]` rule in `globals.css`. |
| A team upgrade | Add an entry to `BOONS` in `fight.ts` (its id is the item sprite shown), then apply it in `boostsFrom` or `applyBoon` in `run.ts`. |
| A move | Add it to its type's `extra` list in `MOVES` in `fight.ts`. Power, accuracy, status, stat changes, drain and recoil need no other code. |
| A held item | Add an entry to `ITEMS` in `fight.ts`, then give it its effect in `battle.ts`, with a test in `battle.test.ts`. |
| An ability | Add an entry to `ABILITIES` and a slot in `TYPE_ABILITIES` in `fight.ts`, then give it its effect in `battle.ts`, with a test. |
| A kind of stop | Add it to `NODE_INFO` and the row pools in `run.ts`, handle it in `enterNode`, and draw its phase in `expedition.tsx`. |
| An event | Add an entry to `EVENTS` in `run.ts` and a case in `chooseEvent`. The second choice is the safe one. |
| A starting perk | Add an entry to `PERKS` in `run.ts` and apply it in `startRun`. |
| An account or a bill | On the Pokémon screen or in Bill's PC. No code. |
| An expedition area | Add an entry to `BIOMES` in `fight.ts`: a name, a Showdown backdrop and favoured type ids. |
| An icon choice | Add an item name to `ITEM_ICONS` in `partners.ts`. |
| A quest | Give a category a monthly target. No code. |
| A badge | Add an entry to `BADGES` in `game.ts`. |
| A screen | Add a folder under `app/(game)/`, a line to `SCREENS` in `nav.tsx` (its name, a roof colour for the town map) and an icon grid in `sprite.tsx`. |
| A place on Home | Add a backdrop name to `PLACES` in `scene.tsx`. |
| A partner line | Add an entry to `PARTNERS` in `partners.ts` (dex numbers 1–649 have animated sprites). |
| A colour or theme tweak | Edit the tokens at the top of `globals.css`. |
| Another currency or time zone | `config.ts`. |

## Not built yet (on purpose)

Kept out until they are needed:

- Each Pokémon keeping its own level and nickname between runs (the team shares one level, set by your trainer level)
- Bills on other schedules: weekly, twice a month, every other month (add two bills for a twice-monthly pay day)
- Reminders outside the app (email or push) when a bill is due
- An overworld to walk around

