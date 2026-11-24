alter table public.eala_sync_runs
  add column if not exists revalidation_pending boolean not null default false,
  add column if not exists revalidation_attempts integer not null default 0,
  add column if not exists revalidation_last_error text;

comment on column public.eala_sync_runs.revalidation_pending is
  'True when a successful sync changed homepage data but Vercel cache invalidation has not yet succeeded.';
