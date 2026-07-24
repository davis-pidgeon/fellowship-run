-- Reusable STAGE seed data for the global-rankings feature.
-- Safe to re-run (idempotent via ON CONFLICT). IDs reference the stage dataset:
--   fellowships: 05448278… Frodo's, 76f55106… test 2, b9867762… Rangers
--   users:       31568b02… Davis (real), acf72d7b… Aragorn, c5d1b479… Legolas, f26732ba… Gimli

-- Weekly winners: global fellowship-of-week (pooled + per-capita) + member-of-week.
insert into weekly_awards (week_start, scope, fellowship_id, user_id, metric_value) values
  ('2026-07-14','global_pooled','b9867762-421a-4785-adc7-88502e1e30a4',null,62.4),
  ('2026-07-14','global_percapita','05448278-723e-4a2f-aaf7-1df3259d571d',null,28.1),
  ('2026-07-07','global_pooled','05448278-723e-4a2f-aaf7-1df3259d571d',null,55.0),
  ('2026-07-07','global_percapita','b9867762-421a-4785-adc7-88502e1e30a4',null,24.3),
  ('2026-06-30','global_pooled','b9867762-421a-4785-adc7-88502e1e30a4',null,40.2),
  ('2026-06-30','global_percapita','05448278-723e-4a2f-aaf7-1df3259d571d',null,22.0),
  ('2026-07-14','member','05448278-723e-4a2f-aaf7-1df3259d571d','31568b02-c868-45b4-84e7-fb6a1bbfcb30',30.5),
  ('2026-07-07','member','05448278-723e-4a2f-aaf7-1df3259d571d','31568b02-c868-45b4-84e7-fb6a1bbfcb30',25.0),
  ('2026-07-14','member','b9867762-421a-4785-adc7-88502e1e30a4','c5d1b479-ec67-41c1-ac2a-311d54487296',41.2),
  ('2026-07-07','member','b9867762-421a-4785-adc7-88502e1e30a4','31568b02-c868-45b4-84e7-fb6a1bbfcb30',20.0),
  ('2026-07-14','member','76f55106-480d-41ea-a3f2-2c0f10c0b2ac','31568b02-c868-45b4-84e7-fb6a1bbfcb30',15.0)
on conflict do nothing;

-- Current-week (2026-07-21 week) activities so "this week" rankings are non-empty.
insert into activities (user_id, strava_activity_id, distance_miles, run_date, name, sport_type, moving_seconds) values
  ('31568b02-c868-45b4-84e7-fb6a1bbfcb30', 9000000001, 5.2, '2026-07-22T13:00:00+00:00', 'Tuesday tempo', 'Run', 2700),
  ('31568b02-c868-45b4-84e7-fb6a1bbfcb30', 9000000002, 3.0, '2026-07-23T12:30:00+00:00', 'Morning shakeout', 'Run', 1500),
  ('acf72d7b-ca7a-49b1-8e94-2c4897c1a9eb', 9000000003, 4.1, '2026-07-21T15:00:00+00:00', 'Ranger patrol', 'Run', 2200),
  ('c5d1b479-ec67-41c1-ac2a-311d54487296', 9000000004, 6.3, '2026-07-22T16:00:00+00:00', 'Mirkwood trail', 'TrailRun', 3200),
  ('f26732ba-69a9-4c7c-8a2f-5023775ea4ee', 9000000005, 2.0, '2026-07-23T09:00:00+00:00', 'Short hike', 'Walk', 1600)
on conflict (strava_activity_id) do nothing;
