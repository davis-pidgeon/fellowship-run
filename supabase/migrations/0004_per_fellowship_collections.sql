-- supabase/migrations/0004_per_fellowship_collections.sql
-- Reshape the two collection columns from a flat array to a per-fellowship object.
-- PROD CAVEAT: confirm these columns are jsonb before running (they were added
-- outside the tracked migrations). If they are text[], first:
--   alter table users alter column opened_quests type jsonb using to_jsonb(opened_quests);
--   alter table users alter column notified_achievements type jsonb using to_jsonb(notified_achievements);
begin;

-- Nest each user's existing flat array under their single current fellowship
-- (every user has exactly one membership at this point — 0002 backfilled it).
update users u set opened_quests = jsonb_build_object(
  (select fm.fellowship_id::text from fellowship_members fm where fm.user_id = u.id order by fm.joined_at limit 1),
  coalesce(u.opened_quests, '[]'::jsonb)
)
where jsonb_typeof(u.opened_quests) = 'array'
  and exists (select 1 from fellowship_members fm where fm.user_id = u.id);

update users u set notified_achievements = jsonb_build_object(
  (select fm.fellowship_id::text from fellowship_members fm where fm.user_id = u.id order by fm.joined_at limit 1),
  coalesce(u.notified_achievements, '[]'::jsonb)
)
where jsonb_typeof(u.notified_achievements) = 'array'
  and exists (select 1 from fellowship_members fm where fm.user_id = u.id);

-- Any user with no membership (shouldn't happen) or an already-object value: normalize to {}.
update users set opened_quests = '{}'::jsonb where jsonb_typeof(opened_quests) <> 'object';
update users set notified_achievements = '{}'::jsonb where jsonb_typeof(notified_achievements) <> 'object';

alter table users alter column opened_quests set default '{}'::jsonb;
alter table users alter column notified_achievements set default '{}'::jsonb;

commit;
