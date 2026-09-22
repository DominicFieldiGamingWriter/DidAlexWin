import type { DashboardData, WtaMatch } from "./wta";
import { getEalaDashboard as getWtaDashboard } from "./wta";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://fsqqngkdwkhkfswgbtyz.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3omtrAoy1lvoch32yhOSxA_WAgotO2T";

const EALA_ID = 330332;

type SupabaseMatch = {
  match_start: string | null;
  round_name: string | null;
  eala_won: boolean | null;
  raw_json: WtaMatch;
};

type SupabaseStats = {
  updated_at: string | null;
  singles_wins: number | null;
  singles_losses: number | null;
  doubles_wins: number | null;
  doubles_losses: number | null;
  singles_titles: number | null;
  doubles_titles: number | null;
  highest_singles_ranking: number | null;
  highest_doubles_ranking: number | null;
  grand_slam_singles: Record<string, { wins: number; losses: number; best: string }>;
};

type SupabaseRanking = {
  ranking_type: "singles" | "doubles";
  ranking: number | null;
};

type SupabaseNextMatch = {
  tournament: string;
  round_name: string | null;
  opponent: string | null;
  match_start: string | null;
  surface: string | null;
  venue: string | null;
  tournament_start: string | null;
  tournament_end: string | null;
};

async function fetchTable<T>(path: string): Promise<T[]> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
      },
      next: { revalidate: 60 },
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}`);
  }

  return response.json();
}

function roundRank(round: string | null) {
  return (
    {
      R128: 1,
      R64: 2,
      R32: 3,
      R16: 4,
      Q: 5,
      S: 6,
      F: 7,
    } as Record<string, number>
  )[round ?? ""] ?? 0;
}

function exactMatchTimestamp(raw: WtaMatch | null | undefined) {
  if (!raw || typeof raw !== "object") return NaN;
  for (const key of ["MatchTimeStamp", "matchDate", "match_date", "scheduledTime", "scheduled_time"]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return NaN;
}

function latestMatch(matches: SupabaseMatch[]): WtaMatch | null {
  const sorted = [...matches].sort((a, b) => {
    const exactDifference =
      exactMatchTimestamp(b.raw_json) - exactMatchTimestamp(a.raw_json);

    if (!Number.isNaN(exactDifference) && exactDifference !== 0) {
      return exactDifference;
    }

    const dateDifference =
      Date.parse(b.match_start ?? "") - Date.parse(a.match_start ?? "");

    if (!Number.isNaN(dateDifference) && dateDifference !== 0) {
      return dateDifference;
    }

    return roundRank(b.round_name) - roundRank(a.round_name);
  });

  return sorted[0]?.raw_json ?? null;
}

export async function getEalaDashboardFromSupabase(): Promise<DashboardData> {
  try {
    const [matches, statsRows, rankings, nextRows] = await Promise.all([
      fetchTable<SupabaseMatch>(
        `eala_matches?player_id=eq.${EALA_ID}&category=eq.singles&status=eq.completed&select=match_start,round_name,eala_won,raw_json&limit=500`
      ),
      fetchTable<SupabaseStats>(
        `eala_stats?player_id=eq.${EALA_ID}&select=updated_at,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,highest_singles_ranking,highest_doubles_ranking,grand_slam_singles&limit=1`
      ),
      fetchTable<SupabaseRanking>(
        `eala_rankings?player_id=eq.${EALA_ID}&select=ranking_type,ranking&order=ranking_date.desc&limit=20`
      ),
      fetchTable<SupabaseNextMatch>(
        `eala_next_match?player_id=eq.${EALA_ID}&select=tournament,round_name,opponent,match_start,surface,venue,tournament_start,tournament_end&limit=1`
      ),
    ]);

    const stats = statsRows[0];
    if (!stats) throw new Error("Eala stats are not populated");

    const singlesRank =
      rankings.find((row) => row.ranking_type === "singles")?.ranking ?? null;
    const doublesRank =
      rankings.find((row) => row.ranking_type === "doubles")?.ranking ?? null;

    const next = nextRows[0];

    return {
      lastUpdated: stats.updated_at ?? null,
      latestMatch: latestMatch(matches),
      nextMatch: next
        ? {
            tournament: next.tournament,
            round: next.round_name ?? "TBA",
            opponent: next.opponent ?? "TBA",
            date: next.match_start
              ? new Date(next.match_start).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "TBA",
            surface: next.surface ?? "—",
            venue: next.venue ?? "—",
            tournamentStart: next.tournament_start ?? "",
            tournamentEnd: next.tournament_end ?? "",
          }
        : null,
      singlesRank,
      doublesRank,
      singlesRecord: {
        wins: stats.singles_wins ?? 0,
        losses: stats.singles_losses ?? 0,
      },
      doublesRecord: {
        wins: stats.doubles_wins ?? 0,
        losses: stats.doubles_losses ?? 0,
      },
      singlesTitles: stats.singles_titles ?? 0,
      doublesTitles: stats.doubles_titles ?? 0,
      highestSinglesRank: stats.highest_singles_ranking ?? 18,
      highestDoublesRank: stats.highest_doubles_ranking ?? 88,
      grandSlams: stats.grand_slam_singles ?? {},
    };
  } catch (error) {
    console.error("Supabase dashboard read failed:", error);
    return getWtaDashboard();
  }
}
