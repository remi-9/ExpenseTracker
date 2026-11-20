-- Tossing and restoring (0004_tossed.sql). Run with `supabase test db`, which uses
-- the local stack. Everything happens inside a transaction that is rolled back, as
-- two made-up users, so nothing is left behind and no real rows are read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'tossed-test-a@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'tossed-test-b@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

insert into public.categories (id, name, kind) values
  ('00000000-0000-4000-8000-0000000000c1', 'Test food', 'expense'),
  ('00000000-0000-4000-8000-0000000000c2', 'Test pay', 'income');
insert into public.accounts (id, name) values
  ('00000000-0000-4000-8000-0000000000d1', 'Test bank'),
  ('00000000-0000-4000-8000-0000000000d2', 'Test cash');
insert into public.transactions (id, category_id, amount, occurred_on, note, account_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 100, '2026-11-02', 'Lunch', '00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2', 1000, '2026-11-01', null, '00000000-0000-4000-8000-0000000000d1');
insert into public.transfers (id, from_account, to_account, amount, occurred_on) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', 50, '2026-11-03');

create temp table entry_before as select * from public.transactions where id = '00000000-0000-4000-8000-0000000000e1';
create temp table transfer_before as select * from public.transfers where id = '00000000-0000-4000-8000-0000000000f1';

-- Before: 1000 in, 100 spent and 50 moved out of the bank.
select is((select total from public.month_totals where category_id = '00000000-0000-4000-8000-0000000000c1'), 100::numeric, 'the spending counts before it is tossed');
select is((select net from public.account_totals where account_id = '00000000-0000-4000-8000-0000000000d1'), 850::numeric, 'the bank holds 850 before anything is tossed');

-- Toss the spending.
select public.toss('entry', '00000000-0000-4000-8000-0000000000e1');
select is((select count(*) from public.transactions where id = '00000000-0000-4000-8000-0000000000e1'), 0::bigint, 'a tossed entry leaves the entries');
select is((select count(*) from public.month_totals where category_id = '00000000-0000-4000-8000-0000000000c1'), 0::bigint, 'a tossed entry is in no month total');
select is((select net from public.account_totals where account_id = '00000000-0000-4000-8000-0000000000d1'), 950::numeric, 'a tossed entry is in no account balance');
select is((select kind from public.tossed where id = '00000000-0000-4000-8000-0000000000e1'), 'entry', 'it is kept among the tossed');

-- Toss the transfer.
select public.toss('transfer', '00000000-0000-4000-8000-0000000000f1');
select is((select net from public.account_totals where account_id = '00000000-0000-4000-8000-0000000000d1'), 1000::numeric, 'a tossed transfer is in no balance it came from');
select is((select coalesce(sum(net), 0) from public.account_totals where account_id = '00000000-0000-4000-8000-0000000000d2'), 0::numeric, 'nor in the balance it went to');

-- Someone else can neither see nor restore them.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}';
select is((select count(*) from public.tossed), 0::bigint, 'another user sees none of the tossed rows');
select throws_ok($$ select public.restore_tossed('00000000-0000-4000-8000-0000000000e1') $$, 'P0002', 'That is no longer kept.', 'another user cannot restore them');
select throws_ok($$ select public.toss('entry', '00000000-0000-4000-8000-0000000000e2') $$, 'P0002', 'That is already gone.', 'another user cannot toss an entry that is not theirs');

-- Restore both.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.restore_tossed('00000000-0000-4000-8000-0000000000e1'), 'entry', 'restoring says what came back');
select public.restore_tossed('00000000-0000-4000-8000-0000000000f1');
select results_eq('select * from public.transactions where id = ''00000000-0000-4000-8000-0000000000e1''', 'select * from entry_before', 'a restored entry is exactly as it was, id and time logged included');
select results_eq('select * from public.transfers where id = ''00000000-0000-4000-8000-0000000000f1''', 'select * from transfer_before', 'a restored transfer is exactly as it was');
select is((select net from public.account_totals where account_id = '00000000-0000-4000-8000-0000000000d1'), 850::numeric, 'the balance is back to 850');

-- Tossing clears out what was tossed more than 30 days ago.
reset role;
insert into public.tossed (id, user_id, kind, row, tossed_at)
values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a1', 'transfer', '{}', now() - interval '31 days');
set local role authenticated;
select public.toss('entry', '00000000-0000-4000-8000-0000000000e2');
select is((select array_agg(id::text order by id) from public.tossed), array['00000000-0000-4000-8000-0000000000e2'], 'rows older than 30 days are cleared out');

select * from finish();
rollback;
