-- Accounts, transfers and bills.
-- Run this once in the Supabase SQL editor, after 0002_expedition.sql.
-- It only adds things: nothing you have logged is changed or removed, except
-- that every existing entry is placed in a first account called "Main account".

-- Somewhere money is kept: a bank account, an e-wallet, cash, a credit card.
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  name            text not null,
  kind            text not null default 'bank' check (kind in ('bank', 'ewallet', 'cash', 'card')),
  icon            text not null default 'pkmn-143',   -- same choices as a category icon
  opening_balance numeric(12, 2) not null default 0,  -- what it held before the first entry
  sort_order      int not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, name)
);

-- Something that comes round on a schedule: rent, a subscription, savings, your pay.
create table public.bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  category_id uuid not null references public.categories on delete restrict,
  account_id  uuid references public.accounts on delete set null,  -- usually paid from (or into) here
  amount      numeric(12, 2) check (amount > 0),                   -- null when it varies
  due_day     int not null default 1 check (due_day between 1 and 31),
  cadence     text not null default 'monthly' check (cadence in ('monthly', 'yearly')),
  due_month   int check (due_month between 1 and 12),              -- yearly bills only
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.transactions
  add column account_id    uuid references public.accounts on delete restrict,  -- where the money came from or went
  add column to_account_id uuid references public.accounts on delete restrict,  -- savings only: where it was moved to
  add column bill_id       uuid references public.bills on delete set null;     -- the bill this entry pays

-- Money moved between two of your own accounts. Neither income nor spending.
create table public.transfers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  from_account uuid not null references public.accounts on delete restrict,
  to_account   uuid not null references public.accounts on delete restrict,
  amount       numeric(12, 2) not null check (amount > 0),
  occurred_on  date not null default current_date,
  note         text,
  created_at   timestamptz not null default now(),
  check (from_account <> to_account)
);

create index transactions_bill_idx on public.transactions (bill_id, occurred_on) where bill_id is not null;

alter table public.accounts  enable row level security;
alter table public.bills     enable row level security;
alter table public.transfers enable row level security;

create policy "own accounts" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own bills" on public.bills
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own transfers" on public.transfers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- What each account has gained or lost since its opening balance. Income adds,
-- spending subtracts, savings stay put unless they name an account to move to,
-- and a transfer takes from one account and gives to the other.
-- (netByAccount in src/lib/money.ts is the same rule in TypeScript.)
create view public.account_totals
with (security_invoker = true) as
select user_id, account_id, sum(delta) as net
from (
  select t.user_id, t.account_id,
         case c.kind
           when 'income'  then t.amount
           when 'expense' then -t.amount
           else case when t.to_account_id is null then 0 else -t.amount end
         end as delta
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.account_id is not null
  union all
  select t.user_id, t.to_account_id, t.amount
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where c.kind = 'saving' and t.to_account_id is not null
  union all
  select user_id, from_account, -amount from public.transfers
  union all
  select user_id, to_account, amount from public.transfers
) moves
group by 1, 2;

-- ---- Carry what exists over ---------------------------------------------------------

-- 1. A first account for everyone who has entries, holding everything logged so far.
--    Rename it, and add your other accounts, on the Accounts screen.
insert into public.accounts (user_id, name)
select distinct user_id, 'Main account' from public.transactions
on conflict (user_id, name) do nothing;

update public.transactions t
set account_id = a.id
from public.accounts a
where a.user_id = t.user_id and a.name = 'Main account' and t.account_id is null;

-- 2. Each category marked "comes round every month" becomes a bill due on the 1st,
--    with the amount of the last month it was logged. Set the real due days on the
--    Bills screen. (categories.is_fixed is no longer read by the app; it is left in place.)
insert into public.bills (user_id, name, category_id, account_id, amount, due_day)
select c.user_id, c.name, c.id, a.id,
       (select sum(t.amount)
        from public.transactions t
        where t.category_id = c.id
          and date_trunc('month', t.occurred_on) =
              (select max(date_trunc('month', t2.occurred_on)) from public.transactions t2 where t2.category_id = c.id)),
       1
from public.categories c
left join public.accounts a on a.user_id = c.user_id and a.name = 'Main account'
where c.is_fixed and c.archived_at is null;

-- Entries already logged in those categories count as payments of the new bills.
update public.transactions t
set bill_id = b.id
from public.bills b
where b.category_id = t.category_id and t.bill_id is null;

-- ---- Optional: turn an "Opening Balance" entry into the account's opening balance ----
-- The starting bank balance used to be logged as income, which counted it as that
-- month's pay (wallet HP, badges). To move it onto the account instead, check the
-- category name below matches yours, then run these three statements. The entries
-- in that category are DELETED once their total is on the account.
--
-- update public.accounts a
-- set opening_balance = a.opening_balance + o.total
-- from (select t.user_id, sum(t.amount) as total
--       from public.transactions t
--       join public.categories c on c.id = t.category_id
--       where c.name = 'Opening Balance' and c.kind = 'income'
--       group by 1) o
-- where a.user_id = o.user_id and a.name = 'Main account';
--
-- delete from public.transactions t
-- using public.categories c
-- where c.id = t.category_id and c.name = 'Opening Balance' and c.kind = 'income';
--
-- update public.categories set archived_at = now()
-- where name = 'Opening Balance' and kind = 'income';
