-- Release 2 round 3: opt-in "hours this month" on the client portal.
-- Clients never read time_entries; they get project totals only, through this function.
alter table public.clients add column show_hours_in_portal boolean not null default false;

create function public.portal_hours(p_client_id uuid, p_month date)
returns table (project_id uuid, label text, minutes integer)
language sql stable security definer set search_path = public as $$
  with allowed as (
    select 1 where public.is_admin()
       or (public.auth_client_id() = p_client_id
           and exists (select 1 from public.clients where id = p_client_id and show_hours_in_portal))
  ),
  scoped as (
    select case when p.id is not null and not p.archived then p.id end as pid,
           case when p.id is not null and not p.archived then p.name else 'Other work' end as label,
           t.minutes
    from public.time_entries t
    left join public.projects p on p.id = t.project_id
    where exists (select 1 from allowed)
      and t.client_id = p_client_id
      and t.work_date >= date_trunc('month', p_month)::date
      and t.work_date < (date_trunc('month', p_month) + interval '1 month')::date
  )
  select pid, label, sum(minutes)::integer
  from scoped
  group by pid, label
  order by (pid is null), sum(minutes) desc, label;
$$;
revoke all on function public.portal_hours(uuid, date) from public, anon;
grant execute on function public.portal_hours(uuid, date) to authenticated;
