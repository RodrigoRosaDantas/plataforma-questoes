-- Allow the SECURITY INVOKER profile provisioner to create/reactivate only
-- the authenticated user's profile, while keeping write grants column-scoped.
revoke all privileges on table public.student_profiles from anon;
revoke all privileges on table public.student_profiles from authenticated;
grant select on table public.student_profiles to authenticated;
grant insert (id, user_id, is_active) on table public.student_profiles to authenticated;
grant update (is_active, updated_at) on table public.student_profiles to authenticated;

drop policy if exists "student_profiles_insert_own" on public.student_profiles;
drop policy if exists "student_profiles_update_own" on public.student_profiles;

create policy "student_profiles_insert_own"
on public.student_profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and id = 'STU-' || upper(replace((select auth.uid())::text, '-', ''))
);

create policy "student_profiles_update_own"
on public.student_profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and id = 'STU-' || upper(replace((select auth.uid())::text, '-', ''))
);

-- RLS does not protect TRUNCATE, TRIGGER, or REFERENCES privileges.
revoke all privileges on table public.student_progress_states from anon;
revoke all privileges on table public.student_progress_states from authenticated;
grant select, insert, update on table public.student_progress_states to authenticated;

revoke execute on function public.ensure_student_profile() from public, anon;
grant execute on function public.ensure_student_profile() to authenticated;

comment on table public.student_progress_states is
  'User-owned study progress only; question content and answer keys are not stored here.';
