-- Phase 1: Eala data integrity
-- Separate calendar dates from exact match timestamps and store 2026 season stats explicitly.

alter table public.eala_matches
  add column if not exists match_date date;

alter table public.eala_next_match
  add column if not exists match_date date;

create index if not exists idx_eala_matches_player_category_date
  on public.eala_matches (player_id, category, match_date desc);

create table if not exists public.eala_season_stats (
  player_id bigint not null references public.eala_player(player_id),
  season_year integer not null,
  singles_wins integer not null default 0,
  singles_losses integer not null default 0,
  doubles_wins integer not null default 0,
  doubles_losses integer not null default 0,
  singles_titles integer not null default 0,
  doubles_titles integer not null default 0,
  grand_slam_singles jsonb not null default '{}'::jsonb,
  grand_slam_doubles jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, season_year),
  check (season_year between 1900 and 2100)
);

alter table public.eala_season_stats enable row level security;

drop policy if exists eala_season_stats_public_read on public.eala_season_stats;
create policy eala_season_stats_public_read on public.eala_season_stats
  for select to anon, authenticated using (true);

grant select on public.eala_season_stats to anon, authenticated;

-- Populate dates only from WTA match/date fields.
-- Do not reuse the previous tournament start/end fallback as a match timestamp.
update public.eala_matches
set match_date = case
  when raw_json->>'MatchTimeStamp' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    then (raw_json->>'MatchTimeStamp')::timestamptz::date
  when raw_json->>'scheduledTime' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    then (raw_json->>'scheduledTime')::timestamptz::date
  when raw_json->>'scheduled_time' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    then (raw_json->>'scheduled_time')::timestamptz::date
  when raw_json->>'matchDate' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    then (raw_json->>'matchDate')::timestamptz::date
  when raw_json->>'matchDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
    then (raw_json->>'matchDate')::date
  when raw_json->>'match_date' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    then (raw_json->>'match_date')::timestamptz::date
  when raw_json->>'match_date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
    then (raw_json->>'match_date')::date
  when raw_json->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    then (raw_json->>'date')::timestamptz::date
  when raw_json->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
    then (raw_json->>'date')::date
  else null
end;

update public.eala_matches
set match_start = case
  when raw_json->>'MatchTimeStamp' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:'
    then (raw_json->>'MatchTimeStamp')::timestamptz
  when raw_json->>'scheduledTime' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:'
    then (raw_json->>'scheduledTime')::timestamptz
  when raw_json->>'scheduled_time' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:'
    then (raw_json->>'scheduled_time')::timestamptz
  when raw_json->>'matchDate' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:'
    then (raw_json->>'matchDate')::timestamptz
  when raw_json->>'match_date' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:'
    then (raw_json->>'match_date')::timestamptz
  when raw_json->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:'
    then (raw_json->>'date')::timestamptz
  else null
end;

update public.eala_next_match
set match_date = case
  when match_start is not null then match_start::date
  when raw_json->>'scheduled_date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
    then (raw_json->>'scheduled_date')::date
  else null
end,
raw_json = raw_json - 'scheduled_date';

insert into public.eala_season_stats (
  player_id, season_year, singles_wins, singles_losses, doubles_wins, doubles_losses,
  singles_titles, doubles_titles, grand_slam_singles, grand_slam_doubles, raw_json, updated_at
)
select
  player_id, 2026,
  coalesce(singles_wins, 0), coalesce(singles_losses, 0),
  coalesce(doubles_wins, 0), coalesce(doubles_losses, 0),
  coalesce(singles_titles, 0), coalesce(doubles_titles, 0),
  coalesce(grand_slam_singles, '{}'::jsonb), coalesce(grand_slam_doubles, '{}'::jsonb),
  coalesce(raw_json, '{}'::jsonb), now()
from public.eala_stats
where player_id = 330332
on conflict (player_id, season_year) do update set
  singles_wins = excluded.singles_wins,
  singles_losses = excluded.singles_losses,
  doubles_wins = excluded.doubles_wins,
  doubles_losses = excluded.doubles_losses,
  singles_titles = excluded.singles_titles,
  doubles_titles = excluded.doubles_titles,
  grand_slam_singles = excluded.grand_slam_singles,
  grand_slam_doubles = excluded.grand_slam_doubles,
  raw_json = excluded.raw_json,
  updated_at = now();
