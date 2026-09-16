-- Keep profile provisioning compatible with SECURITY INVOKER without granting
-- broad table-level writes. RLS remains the ownership boundary.
revoke insert, update on table public.student_profiles from authenticated;
grant insert (id, user_id, is_active) on table public.student_profiles to authenticated;
grant update (is_active, updated_at) on table public.student_profiles to authenticated;
