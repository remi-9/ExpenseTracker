-- Pocket Tracker schema: three tables and one view.
-- Everything the app shows (balance, wallet HP, XP, badges) is derived from these.

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('income', 'expense', 'saving')),
  icon           text not null default 'poke-ball', -- PokeAPI item sprite name, or an emoji
  is_fixed       boolean not null default false,   -- comes round every month (pay, rent, bills): shown on the monthly checklist
  monthly_target numeric(12, 2),                    -- a goal for savings, a budget cap for spending
  sort_order     int not null default 0,
  archived_at    timestamptz,                       -- hide from forms, keep history
  created_at     timestamptz not null default now(),
  unique (user_id, name)
);

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references public.categories on delete restrict,
  amount      numeric(12, 2) not null check (amount > 0),  -- always positive; the category's kind gives the sign
  occurred_on date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);

-- The Pokédex: one row per Pokémon caught on the Home screen.
create table public.catches (
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  dex       int not null check (dex between 1 and 1025),
  caught_at timestamptz not null default now(),
  primary key (user_id, dex)
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);

-- Row-level security: you only ever see your own rows.
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.catches      enable row level security;

create policy "own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own transactions" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own catches" on public.catches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- One row per month per category. Feeds the dashboard, balance and game stats.
create view public.month_totals
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  t.category_id,
  c.kind,
  sum(t.amount) as total,
  count(*)::int as entries
from public.transactions t
join public.categories c on c.id = t.category_id
group by 1, 2, 3, 4;
