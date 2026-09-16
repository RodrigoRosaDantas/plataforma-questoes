-- Qualify table columns used by the CAS function. The function's TABLE return
-- columns are PL/pgSQL variables too, so unqualified state_version is ambiguous.
create or replace function public.compare_and_swap_student_progress_state(
  p_profile_id text,
  p_expected_version bigint,
  p_state jsonb,
  p_device_id text default null
)
returns table(
  saved boolean,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.student_progress_states%rowtype;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null or not private.owns_student_profile(p_profile_id) then
    raise exception 'profile access denied' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'expected version must be zero or greater' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_state, '{}'::jsonb)) <> 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.student_progress_states (
      profile_id, state, state_version, device_id, created_at, updated_at
    ) values (
      p_profile_id, coalesce(p_state, '{}'::jsonb), 1, p_device_id, v_now, v_now
    )
    on conflict (profile_id) do nothing
    returning * into v_row;
  else
    update public.student_progress_states as progress
       set state = coalesce(p_state, '{}'::jsonb),
           state_version = p_expected_version + 1,
           device_id = p_device_id,
           updated_at = v_now
     where progress.profile_id = p_profile_id
       and progress.state_version = p_expected_version
    returning progress.* into v_row;
  end if;

  if found then
    return query select true, v_row.state_version, v_row.updated_at;
    return;
  end if;

  select progress.*
    into v_row
    from public.student_progress_states as progress
   where progress.profile_id = p_profile_id;

  return query select false, coalesce(v_row.state_version, 0), v_row.updated_at;
end;
$$;

revoke all on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) from public;
revoke all on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) from anon;
grant execute on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) to authenticated;
