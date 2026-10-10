-- Release 1 review fixes.
-- status_changed_at should only reflect real status changes (the trigger sets it), not row creation,
-- otherwise the first weekly digest lists every synced task as a status change.
alter table public.tasks
  alter column status_changed_at drop not null,
  alter column status_changed_at drop default;

update public.tasks set status_changed_at = null;
