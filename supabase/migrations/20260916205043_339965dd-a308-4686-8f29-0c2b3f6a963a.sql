with t as (
  select id, author_id from public.forum_topics where id = '537502fc-3a1e-443f-96f3-578af4f7adf2'
), ins as (
  insert into public.forum_polls (topic_id, question, allow_multiple, closes_at, created_by)
  select t.id, 'Birmingham City v Middlesbrough Match Prediction', false, '2026-09-19 14:00:00+00', t.author_id
  from t
  where not exists (select 1 from public.forum_polls p where p.topic_id = t.id)
  returning id
)
insert into public.forum_poll_options (poll_id, label, sort_order)
select ins.id, v.label, v.sort_order
from ins, (values ('Birmingham City Win', 0), ('Draw', 1), ('Middlesbrough Win', 2)) as v(label, sort_order);