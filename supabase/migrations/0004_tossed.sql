-- Tossed entries and transfers, kept for 30 days so they can be restored.
-- Run once, after 0003_accounts_bills.sql. It only adds things: no existing table,
-- view or row is changed.
--
-- Tossing moves the row out of its table into this one, so it counts in no total
-- (month_totals, account_totals and everything the app adds up read only the live
-- tables). Restoring moves it back, unchanged, with the same id.

create table public.tossed (
  id        uuid primary key,                -- the id the row had, and gets back
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  kind      text not null check (kind in ('entry', 'transfer')),
  row       jsonb not null,                  -- the whole row as it was
  tossed_at timestamptz not null default now()
);

create index tossed_user_time_idx on public.tossed (user_id, tossed_at desc);

alter table public.tossed enable row level security;

create policy "own tossed" on public.tossed
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Toss an entry ('entry') or a transfer ('transfer'): move it here in one step.
-- Also clears out what was tossed more than 30 days ago.
create function public.toss(what text, target uuid) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.tossed where tossed_at < now() - interval '30 days';

  if what = 'entry' then
    with gone as (delete from public.transactions where id = target returning *)
    insert into public.tossed (id, kind, row)
    select gone.id, 'entry', to_jsonb(gone) from gone
    on conflict (id) do update set kind = excluded.kind, row = excluded.row, tossed_at = now();
  elsif what = 'transfer' then
    with gone as (delete from public.transfers where id = target returning *)
    insert into public.tossed (id, kind, row)
    select gone.id, 'transfer', to_jsonb(gone) from gone
    on conflict (id) do update set kind = excluded.kind, row = excluded.row, tossed_at = now();
  else
    raise exception 'Unknown kind: %', what;
  end if;

  if not found then
    raise exception using errcode = 'P0002', message = 'That is already gone.';
  end if;
end;
$$;

-- Put a tossed row back where it came from. Returns its kind. If it cannot go back
-- (say its account was deleted), nothing changes and it stays among the tossed.
create function public.restore_tossed(target uuid) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  kept public.tossed;
begin
  delete from public.tossed
  where id = target and tossed_at >= now() - interval '30 days'
  returning * into kept;

  if kept.id is null then
    raise exception using errcode = 'P0002', message = 'That is no longer kept.';
  end if;

  if kept.kind = 'entry' then
    insert into public.transactions select * from jsonb_populate_record(null::public.transactions, kept.row);
  else
    insert into public.transfers select * from jsonb_populate_record(null::public.transfers, kept.row);
  end if;
  return kept.kind;
end;
$$;

-- Only signed-in users call these; row-level security limits them to their own rows.
revoke execute on function public.toss(text, uuid) from public, anon;
revoke execute on function public.restore_tossed(uuid) from public, anon;
grant execute on function public.toss(text, uuid) to authenticated;
grant execute on function public.restore_tossed(uuid) to authenticated;
