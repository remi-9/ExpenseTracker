-- Starter categories, taken from the columns of the old spreadsheet.
-- Run once in the Supabase SQL editor AFTER your first login (it attaches to the first user).

insert into public.categories (user_id, name, kind, icon, is_fixed, monthly_target, sort_order)
select u.id, v.name, v.kind, v.icon, v.is_fixed, v.monthly_target, v.sort_order
from (select id from auth.users order by created_at limit 1) u
cross join (values
  ('Opening Balance', 'income',  '🏦', false, null::numeric, 0),
  ('Salary',  'income',  '💼', false, null, 1),
  ('Second Salary',     'income',  '💼', false, null, 2),
  ('Other income',        'income',  '🏛️', false, null, 3),
  ('Save',            'saving',  '🐷', false, 10000, 10),
  ('Family',           'expense', '👩', true,  null, 20),
  ('Relatives',           'expense', '👨', true,  null, 21),
  ('Internet',        'expense', '📡', true,  null, 22),
  ('Electricity',     'expense', '⚡', true,  null, 23),
  ('Withdraw',        'expense', '💵', false, null, 30),
  ('Shopping',        'expense', '🛒', false, null, 31),
  ('Other',           'expense', '❓', false, null, 99)
) as v(name, kind, icon, is_fixed, monthly_target, sort_order)
on conflict (user_id, name) do nothing;
