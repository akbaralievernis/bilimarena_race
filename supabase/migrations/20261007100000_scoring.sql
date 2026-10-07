-- Bilim Arena Race — Stage 4: points and ranking.
--
-- Every answer carries the points it earned; a team's score is computed when it
-- is read (private.team_standings), never stored as a counter a client could
-- touch and never updated by two transactions at once.
--
--   correct answer   100 + speed bonus (50 at once, −1 every 3 s, at least 0)
--   wrong answer     −20 and a 10-second pause before the next try (same task)
--   finish           +100 / +60 / +30 for the first three teams
--   score            max(0, sum of answer points) + finish bonus
--
-- The pause and the points are enforced in public.submit_answer() (next
-- migration) under the same team lock as the answer itself.

alter table public.task_submissions
  add column points integer not null default 0,
  add constraint task_submissions_points_range check (points between -20 and 150);

-- Answers from Stage 3 races had no points yet: give them the base value
-- (no speed bonus — the moment the team reached the checkpoint is not known).
update public.task_submissions
set points = case when is_correct then 100 else -20 end;

-- Race owners already read submissions through RLS; the new column too.
grant select (points) on public.task_submissions to authenticated;

-- The pause looks up the latest wrong answer of a team for a task; the new
-- index also covers every lookup of the old (team_id, task_id) one.
create index task_submissions_team_task_time_idx
  on public.task_submissions (team_id, task_id, submitted_at desc);
drop index public.task_submissions_team_idx;
