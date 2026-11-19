-- Starter categories, taken from the columns of the old spreadsheet.
-- is_fixed marks what comes round every month (pay, savings, bills): those appear on the monthly checklist.
-- Icons are PokeAPI item sprite names (see ITEM_ICONS in src/lib/partners.ts); an emoji also works.
-- Run once in the Supabase SQL editor AFTER your first login (it attaches to the first user).

insert into public.categories (user_id, name, kind, icon, is_fixed, monthly_target, sort_order)
select u.id, v.name, v.kind, v.icon, v.is_fixed, v.monthly_target, v.sort_order
from (select id from auth.users order by created_at limit 1) u
cross join (values
  ('Opening Balance', 'income',  'relic-gold', false, null::numeric, 0),
  ('Salary',  'income',  'nugget', true,  null, 1),
  ('Second Salary',     'income',  'big-nugget', true,  null, 2),
  ('Other income',        'income',  'pearl', false, null, 3),
  ('Save',            'saving',  'amulet-coin', true,  10000, 10),
  ('Family',           'expense', 'sweet-heart', true,  null, 20),
  ('Relatives',           'expense', 'heart-scale', true,  null, 21),
  ('Internet',        'expense', 'pal-pad', true,  null, 22),
  ('Electricity',     'expense', 'thunder-stone', true,  null, 23),
  ('Withdraw',        'expense', 'coin-case', false, null, 30),
  ('Shopping',        'expense', 'poke-ball', false, null, 31),
  ('Other',           'expense', 'parcel', false, null, 99)
) as v(name, kind, icon, is_fixed, monthly_target, sort_order)
on conflict (user_id, name) do nothing;
