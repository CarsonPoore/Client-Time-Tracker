-- Supabase security advisor fixes.
-- Trigger functions get a fixed search_path.
alter function public.set_updated_at() set search_path = public;
alter function public.track_task_status_change() set search_path = public;

-- Helper functions are only needed by signed-in users' RLS policies; anonymous callers get nothing.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.auth_client_id() from public, anon;
revoke execute on function public.project_client_id(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.auth_client_id() to authenticated;
grant execute on function public.project_client_id(uuid) to authenticated;

-- The privilege guard only runs as a trigger; nobody needs to call it over the API.
revoke execute on function public.guard_profile_privileges() from public, anon, authenticated;
