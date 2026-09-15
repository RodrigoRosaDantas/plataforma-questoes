-- Existing profile IDs are stable historical data. Column-level UPDATE grants
-- prevent clients from changing id/user_id, so ownership remains the RLS gate.
drop policy if exists "student_profiles_insert_own" on public.student_profiles;
drop policy if exists "student_profiles_update_own" on public.student_profiles;

create policy "student_profiles_insert_own"
on public.student_profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and is_active = true
);

create policy "student_profiles_update_own"
on public.student_profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
