import type { DashboardData, WtaMatch } from "./wta";

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

type SupabaseSeasonStats = {
  season_year: number;
  singles_wins: number | null;
  singles_losses: number | null;
  doubles_wins: number | null;
  doubles_losses: number | null;
  singles_titles: number | null;
  doubles_titles: number | null;
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
  grand_slam_singles: Record<string, { wins: number; losses: number; best: string; bestYear?: number | null }>;
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
  raw_json: Record<string, unknown> | null;
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
  for (const key of ["MatchTimeStamp", "scheduledTime", "scheduled_time"]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && /T\d{2}:\d{2}/.test(value)) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return NaN;
}

function teamContainsEala(value: unknown) {
  return typeof value === "string" && /\bEALA\b/i.test(value);
}

function ealaIsTeam1(raw: WtaMatch) {
  if (teamContainsEala(raw.team_name_1)) return true;
  if (teamContainsEala(raw.team_name_2)) return false;
  return String(raw.player_1) === String(EALA_ID);
}

function opponentName(raw: WtaMatch) {
  if (raw.opponent && typeof raw.opponent === "object") {
    const name = (raw.opponent as Record<string, unknown>).fullName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  if (typeof raw.team_name_1 === "string" && typeof raw.team_name_2 === "string") {
    return ealaIsTeam1(raw) ? raw.team_name_2 : raw.team_name_1;
  }
  return ealaIsTeam1(raw) ? String(raw.team_name_2 ?? "Opponent") : String(raw.team_name_1 ?? "Opponent");
}

function recentScore(raw: WtaMatch): string | null {
  const value = typeof raw.scores === "string" ? raw.scores.trim() : "";
  if (!value) return null;
  const team1IsEala = ealaIsTeam1(raw);
  return value.split(/\s+/).map((set) => {
    const parts = set.split("-");
    const first = parts[0] ?? "";
    const second = (parts[1] ?? "").replace(/\(.*/, "");
    return team1IsEala ? `${first}-${second}` : `${second}-${first}`;
  }).join(" ");
}

function recentSingles(matches: SupabaseMatch[]): DashboardData["recentSingles"] {
  return [...matches].sort((a,b)=>{
    const at=exactMatchTimestamp(a.raw_json),bt=exactMatchTimestamp(b.raw_json);
    const ad=Number.isNaN(at)?Date.parse(a.match_start??""):at,bd=Number.isNaN(bt)?Date.parse(b.match_start??""):bt;
    return bd-ad;
  }).filter(m=>Number(m.raw_json.winner)>0).slice(0,5).map(m=>{
    const raw=m.raw_json,winner=Number(raw.winner),ealaIs1=String(raw.player_1)===String(EALA_ID);
    const rawDate=raw.MatchTimeStamp??m.match_start;
    return {result:winner===(ealaIs1?1:2)?"W" as const:"L" as const,opponent:opponentName(raw),tournament:String(raw.TournamentName??"Tournament"),date:typeof rawDate==="string"?new Date(rawDate).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—",round:String(raw.round_name??"—"),score:recentScore(raw)};
  });
}

function grandSlamYears(matches: SupabaseMatch[],base: Record<string,{wins:number;losses:number;best:string;bestYear?:number|null}>){
  const result=Object.fromEntries(Object.entries(base).map(([name,value])=>[name,{...value,bestYear:value.bestYear??null}])) as Record<string,{wins:number;losses:number;best:string;bestYear?:number|null}>;
  const keys:Record<string,string>={"AUSTRALIAN OPEN":"Australian Open","ROLAND GARROS":"French Open","FRENCH OPEN":"French Open",WIMBLEDON:"Wimbledon","US OPEN":"US Open"};
  for(const match of matches){
    const raw=match.raw_json,name=String(raw.TournamentName??"").toUpperCase();
    const key=Object.entries(keys).find(([needle])=>name.includes(needle))?.[1];
    if(!key)continue;
    const year=Number(raw.tourn_year??(raw.tournament&&typeof raw.tournament==="object"?(raw.tournament as Record<string,unknown>).year:null));
    if(!Number.isFinite(year))continue;
    const rank=roundRank(match.round_name),current=roundRank(result[key]?.best??""),currentYear=result[key]?.bestYear??null;
    if(rank>current||(rank===current&&(currentYear===null||year>currentYear)))result[key]={...(result[key]??{wins:0,losses:0,best:""}),best:match.round_name??"",bestYear:year};
  }
  return result;
}

function latestMatch(matches: SupabaseMatch[]): WtaMatch | null {
  const sorted = [...matches].filter((match) => Number(match.raw_json.winner) > 0).sort((a, b) => {
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
    const seasonYear=2026;
    const [matches, statsRows, seasonRows, rankings, nextRows] = await Promise.all([
      fetchTable<SupabaseMatch>(
        `eala_matches?player_id=eq.${EALA_ID}&category=eq.singles&status=eq.completed&select=match_start,round_name,eala_won,raw_json&limit=500`
      ),
      fetchTable<SupabaseStats>(
        `eala_stats?player_id=eq.${EALA_ID}&select=updated_at,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles,highest_singles_ranking,highest_doubles_ranking,grand_slam_singles&limit=1`
      ),
      fetchTable<SupabaseSeasonStats>(
        `eala_season_stats?player_id=eq.${EALA_ID}&season_year=eq.${seasonYear}&select=season_year,singles_wins,singles_losses,doubles_wins,doubles_losses,singles_titles,doubles_titles&limit=1`
      ),
      fetchTable<SupabaseRanking>(
        `eala_rankings?player_id=eq.${EALA_ID}&select=ranking_type,ranking&order=ranking_date.desc&limit=20`
      ),
      fetchTable<SupabaseNextMatch>(
        `eala_next_match?player_id=eq.${EALA_ID}&select=tournament,round_name,opponent,match_start,surface,venue,tournament_start,tournament_end,raw_json&limit=1`
      ),
    ]);

    const stats = statsRows[0];
    if (!stats) throw new Error("Eala stats are not populated");
    const season = seasonRows[0] ?? null;

    const singlesRank =
      rankings.find((row) => row.ranking_type === "singles")?.ranking ?? null;
    const doublesRank =
      rankings.find((row) => row.ranking_type === "doubles")?.ranking ?? null;

    const next = nextRows[0];

    return {
      lastUpdated: stats.updated_at ?? null,
      latestMatch: latestMatch(matches),
      recentSingles: recentSingles(matches),
      nextMatch: next
        ? {
            tournament: next.tournament,
            round: next.round_name ?? "TBA",
            opponent: next.opponent ?? "TBA",
            date: next.raw_json?.scheduled_date
              ? new Date(String(next.raw_json.scheduled_date)).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : next.match_start
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
            timeKnown: Boolean(next.match_start),
            matchTime: next.match_start
              ? new Date(next.match_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
              : null,
          }
        : null,
      singlesRank,
      doublesRank,
      singlesRecord: {
        wins: season?.singles_wins ?? stats.singles_wins ?? 0,
        losses: season?.singles_losses ?? stats.singles_losses ?? 0,
      },
      doublesRecord: {
        wins: season?.doubles_wins ?? stats.doubles_wins ?? 0,
        losses: season?.doubles_losses ?? stats.doubles_losses ?? 0,
      },
      singlesTitles: season?.singles_titles ?? stats.singles_titles ?? 0,
      doublesTitles: season?.doubles_titles ?? stats.doubles_titles ?? 0,
      highestSinglesRank: stats.highest_singles_ranking ?? 18,
      highestDoublesRank: stats.highest_doubles_ranking ?? 88,
      grandSlams: grandSlamYears(matches, stats.grand_slam_singles ?? {}),
    };
  } catch (error) {
    console.error("Supabase dashboard read failed:", error);
    throw error;
  }
}
