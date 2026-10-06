-- Bilim Arena Race — Stage 3: learning tasks on checkpoints.
--
-- A checkpoint may carry one task (MVP). A team standing at position p works on
-- the task of checkpoint p+1; only a correct answer, checked by
-- public.submit_answer(), moves it there. Races created without tasks (Stage 1/2
-- API, legacy races) keep the Stage 2 button move.
--
--   public.checkpoint_tasks          question, type, options — never the answer
--   private.checkpoint_task_keys     correct answers; private schema, no client grants
--   public.task_submissions          every submitted answer and its verdict
--   public.team_passes               when a team passed each point (incl. FINISH)
--
-- Same security model as before: RLS on, clients get column-limited SELECT at
-- most, every write goes through security-definer functions.

create type public.task_type as enum ('single_choice', 'short_answer');

-- Target of the composite foreign key from checkpoint_tasks.
alter table public.checkpoints
  add constraint checkpoints_race_id_id_key unique (race_id, id);

create table public.checkpoint_tasks (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  checkpoint_id uuid not null,
  type public.task_type not null,
  question text not null,
  -- Answer options for single_choice (JSON array of strings), null otherwise.
  options jsonb,
  sort_order smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint checkpoint_tasks_checkpoint_in_race_fkey foreign key (race_id, checkpoint_id)
    references public.checkpoints (race_id, id) on delete cascade,
  -- MVP: exactly one task per checkpoint.
  constraint checkpoint_tasks_one_per_checkpoint unique (checkpoint_id),
  constraint checkpoint_tasks_sort_order_positive check (sort_order >= 1),
  constraint checkpoint_tasks_question_valid check (
    question = btrim(question) and char_length(question) between 1 and 500
  ),
  -- CASE (not AND) so a NULL or non-array never slips through: a CHECK that
  -- evaluates to NULL counts as passed.
  constraint checkpoint_tasks_options_match_type check (
    case
      when type = 'single_choice' then
        case when jsonb_typeof(options) = 'array' then jsonb_array_length(options) between 2 and 6 else false end
      else options is null
    end
  )
);

create index checkpoint_tasks_race_id_idx on public.checkpoint_tasks (race_id);

-- Correct answers live outside the public schema: not exposed through the Data
-- API and not granted to anon/authenticated at all.
create table private.checkpoint_task_keys (
  task_id uuid primary key references public.checkpoint_tasks (id) on delete cascade,
  correct_option smallint,
  correct_answer text,
  constraint checkpoint_task_keys_one_kind check ((correct_option is null) <> (correct_answer is null)),
  constraint checkpoint_task_keys_option_range check (correct_option is null or correct_option between 0 and 5),
  constraint checkpoint_task_keys_answer_valid check (
    correct_answer is null or char_length(btrim(correct_answer)) between 1 and 200
  )
);

revoke all on table private.checkpoint_task_keys from public, anon, authenticated;

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  team_id uuid not null,
  task_id uuid not null references public.checkpoint_tasks (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  answer text not null,
  is_correct boolean not null,
  submitted_at timestamptz not null default now(),
  constraint task_submissions_team_in_race_fkey foreign key (race_id, team_id)
    references public.teams (race_id, id) on delete cascade,
  constraint task_submissions_answer_length check (char_length(answer) between 1 and 200)
);

create index task_submissions_team_idx on public.task_submissions (team_id, task_id);
create index task_submissions_race_idx on public.task_submissions (race_id);

create table public.team_passes (
  team_id uuid not null,
  race_id uuid not null,
  position integer not null,
  passed_at timestamptz not null default now(),
  submission_id uuid references public.task_submissions (id) on delete set null,
  -- A point is passed once: repeated answers cannot record it again.
  primary key (team_id, position),
  constraint team_passes_team_in_race_fkey foreign key (race_id, team_id)
    references public.teams (race_id, id) on delete cascade,
  constraint team_passes_point_on_route_fkey foreign key (race_id, position)
    references public.checkpoints (race_id, position)
    deferrable initially deferred,
  constraint team_passes_position_positive check (position >= 1)
);

create index team_passes_race_idx on public.team_passes (race_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.checkpoint_tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.team_passes enable row level security;
alter table private.checkpoint_task_keys enable row level security;

revoke all on table public.checkpoint_tasks, public.task_submissions, public.team_passes from anon, authenticated;

-- Questions of future checkpoints are for the teacher only; students receive
-- their team's current task through get_lobby().
grant select (id, race_id, checkpoint_id, type, question, options, sort_order, created_at)
  on public.checkpoint_tasks to authenticated;
create policy "Race owners can read the tasks"
  on public.checkpoint_tasks for select to authenticated
  using (private.is_race_owner(race_id));

grant select (id, race_id, team_id, task_id, participant_id, answer, is_correct, submitted_at)
  on public.task_submissions to authenticated;
create policy "Race owners can read submitted answers"
  on public.task_submissions for select to authenticated
  using (private.is_race_owner(race_id));

grant select (team_id, race_id, position, passed_at) on public.team_passes to authenticated;
create policy "Race owners and participants can read passes"
  on public.team_passes for select to authenticated
  using (private.is_race_owner(race_id) or private.is_race_participant(race_id));

-- No INSERT / UPDATE / DELETE policies anywhere: writes happen only in
-- create_race(), submit_answer() and advance_team().

-- ---------------------------------------------------------------------------
-- Realtime: a wrong answer changes the teacher's statistics but no team row,
-- so submissions announce themselves too (signal only, no answer text).
-- ---------------------------------------------------------------------------

create trigger task_submissions_broadcast_lobby_change
  after insert on public.task_submissions
  for each row execute function private.broadcast_lobby_change('race_id');
