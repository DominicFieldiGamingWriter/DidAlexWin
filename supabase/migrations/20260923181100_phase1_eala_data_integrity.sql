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
-- Do not reuse tournament start/end dates as a match timestamp.
update public.eala_matches
set
  match_date = case
    when nullif(raw_json->>'MatchTimeStamp','') is not null
      then left(raw_json->>'MatchTimeStamp',10)::date
    when nullif(raw_json->>'scheduledTime','') is not null
      then left(raw_json->>'scheduledTime',10)::date
    when nullif(raw_json->>'scheduled_time','') is not null
      then left(raw_json->>'scheduled_time',10)::date
    when nullif(raw_json->>'matchDate','') is not null
      then left(raw_json->>'matchDate',10)::date
    when nullif(raw_json->>'match_date','') is not null
      then left(raw_json->>'match_date',10)::date
    when nullif(raw_json->>'date','') is not null
      then left(raw_json->>'date',10)::date
    else null
  end,
  match_start = case
    when position('T' in coalesce(raw_json->>'MatchTimeStamp','')) > 0
      then (raw_json->>'MatchTimeStamp')::timestamptz
    when position('T' in coalesce(raw_json->>'scheduledTime','')) > 0
      then (raw_json->>'scheduledTime')::timestamptz
    when position('T' in coalesce(raw_json->>'scheduled_time','')) > 0
      then (raw_json->>'scheduled_time')::timestamptz
    when position('T' in coalesce(raw_json->>'matchDate','')) > 0
      then (raw_json->>'matchDate')::timestamptz
    when position('T' in coalesce(raw_json->>'match_date','')) > 0
      then (raw_json->>'match_date')::timestamptz
    when position('T' in coalesce(raw_json->>'date','')) > 0
      then (raw_json->>'date')::timestamptz
    else null
  end;

update public.eala_next_match
set
  match_date = case
    when match_start is not null then left(match_start::text,10)::date
    when nullif(raw_json->>'scheduled_date','') is not null
      then left(raw_json->>'scheduled_date',10)::date
    else null
  end,
  raw_json = raw_json - 'scheduled_date';

-- Normalize historical ranking dates to the official WTA rankedAt date and
-- remove daily duplicate snapshots created by the previous sync implementation.
with ranked as (
  select
    id,
    row_number() over (
      partition by player_id, ranking_type, (raw_json->>'rankedAt')::date
      order by updated_at desc, id desc
    ) as rn
  from public.eala_rankings
  where player_id = 330332
    and raw_json->>'rankedAt' is not null
)
delete from public.eala_rankings r
using ranked d
where r.id=d.id and d.rn>1;

update public.eala_rankings
set ranking_date=(raw_json->>'rankedAt')::date
where player_id=330332
  and raw_json->>'rankedAt' is not null;


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
