-- Progress state is user-owned and contains no question content.
create table if not exists public.student_progress_states (
  profile_id text primary key references public.student_profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  state_version bigint not null default 1,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_progress_states_state_object check (jsonb_typeof(state) = 'object'),
  constraint student_progress_states_version_positive check (state_version > 0)
);

alter table public.student_progress_states enable row level security;

grant select, insert, update on public.student_progress_states to authenticated;

drop policy if exists "student_progress_states_select_own" on public.student_progress_states;
drop policy if exists "student_progress_states_insert_own" on public.student_progress_states;
drop policy if exists "student_progress_states_update_own" on public.student_progress_states;

create policy "student_progress_states_select_own"
on public.student_progress_states
for select
to authenticated
using (private.owns_student_profile(profile_id));

create policy "student_progress_states_insert_own"
on public.student_progress_states
for insert
to authenticated
with check (private.owns_student_profile(profile_id));

create policy "student_progress_states_update_own"
on public.student_progress_states
for update
to authenticated
using (private.owns_student_profile(profile_id))
with check (private.owns_student_profile(profile_id));

create index if not exists student_progress_states_updated_at_idx
on public.student_progress_states (updated_at desc);
