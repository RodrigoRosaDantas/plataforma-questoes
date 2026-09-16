-- A completed question set has at most one final answer per question.
-- PostgreSQL UNIQUE keeps NULL question_set_id rows independent, so other activity types are unaffected.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.question_attempts'::regclass
      and conname = 'question_attempts_profile_set_question_unique'
  ) then
    alter table public.question_attempts
      add constraint question_attempts_profile_set_question_unique
      unique (profile_id, question_set_id, question_id);
  end if;
end
$$;
