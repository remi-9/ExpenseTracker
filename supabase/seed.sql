-- Starter categories, taken from the columns of the old spreadsheet.
-- Icons are PokeAPI item sprite names (see ITEM_ICONS in src/lib/partners.ts); an emoji also works.
-- Run once in the Supabase SQL editor AFTER your first login (it attaches to the first user).

insert into public.categories (user_id, name, kind, icon, monthly_target, sort_order)
select u.id, v.name, v.kind, v.icon, v.monthly_target, v.sort_order
from (select id from auth.users order by created_at limit 1) u
cross join (values
  ('Salary',  'income',  'nugget', null::numeric, 1),
  ('Second Salary',     'income',  'big-nugget', null, 2),
  ('Other income',        'income',  'pearl', null, 3),
  ('Save',            'saving',  'amulet-coin', 10000, 10),
  ('Family',           'expense', 'sweet-heart', null, 20),
  ('Relatives',           'expense', 'heart-scale', null, 21),
  ('Internet',        'expense', 'pal-pad', null, 22),
  ('Electricity',     'expense', 'thunder-stone', null, 23),
  ('Withdraw',        'expense', 'coin-case', null, 30),
  ('Shopping',        'expense', 'poke-ball', null, 31),
  ('Other',           'expense', 'parcel', null, 99)
) as v(name, kind, icon, monthly_target, sort_order)
on conflict (user_id, name) do nothing;

-- A first account. Set its opening balance, rename it and add the others on the Accounts screen.
insert into public.accounts (user_id, name, kind, icon)
select id, 'Main account', 'bank', 'pkmn-143' from auth.users order by created_at limit 1
on conflict (user_id, name) do nothing;
