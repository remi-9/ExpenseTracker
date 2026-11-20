-- Game state that should follow you between devices: who you are playing as,
-- the expedition in progress, and the expeditions that have ended.
-- Run this once in the Supabase SQL editor, after 0001_init.sql.

-- One row per player: the partner, trainer and team chosen. These used to be
-- cookies, so each browser had its own; a browser's cookie is still used until
-- the first choice is saved here.
create table public.players (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  partner    text,                          -- a starter line ("gastly") or a caught Pokémon ("dex:25")
  trainer    text,                          -- a trainer sprite id ("red")
  team       int[] not null default '{}',   -- dex numbers of up to five caught Pokémon
  updated_at timestamptz not null default now()
);

-- One row per player: the run being played, saved after every step so it
-- follows you from one device to the next and cannot be re-rolled by reloading.
create table public.expedition_saves (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  step       int not null,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- One row per finished run. Best floor, clears, starting perks and each
-- Pokémon's record are all worked out from these.
create table public.expedition_runs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  ended_at timestamptz not null default now(),
  floor    int not null check (floor >= 1),
  wins     int not null default 0,
  cleared  boolean not null default false,   -- the champion on floor 25 was beaten
  caught   int[] not null default '{}',      -- dex numbers caught during the run
  party    jsonb not null default '[]'       -- [{ "dex": 25, "kos": 4 }, …]
);

create index expedition_runs_user_idx on public.expedition_runs (user_id, ended_at desc);

alter table public.players          enable row level security;
alter table public.expedition_saves enable row level security;
alter table public.expedition_runs  enable row level security;

create policy "own player" on public.players
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own expedition save" on public.expedition_saves
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own expedition runs" on public.expedition_runs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
