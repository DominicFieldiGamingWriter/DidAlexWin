export type WtaMatch = Record<string, unknown>;

export type DashboardData = {
  lastUpdated: string | null;
  latestMatch: WtaMatch | null;
  recentSingles: Array<{ result: "W" | "L"; opponent: string; tournament: string; date: string; round: string; score: string | null }>;
  nextMatch: { tournament: string; round: string; opponent: string; date: string; surface: string; venue: string; tournamentStart: string; tournamentEnd: string; timeKnown: boolean; matchTime: string | null; matchTimePhilippines: string | null } | null;
  singlesRank: number | null;
  doublesRank: number | null;
  singlesRecord: { wins: number; losses: number };
  doublesRecord: { wins: number; losses: number };
  singlesTitles: number;
  doublesTitles: number;
  highestSinglesRank: number | null;
  highestDoublesRank: number | null;
  grandSlams: Record<string, { wins: number; losses: number; best: string; bestYear?: number | null }>;
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://fsqqngkdwkhkfswgbtyz.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3omtrAoy1lvoch32yhOSxA_WAgotO2T";

const EALA_ID = 330332;

type SupabaseMatch = {
  match_start: string | null;
  match_date: string | null;
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
      cache: "no-store",
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

function orientedScore(value: unknown, ealaWon: boolean | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const sets = value.trim().split(/\s+/).map((set) => {
    const parts = set.split("-");
    const first = parts[0] ?? "";
    const second = (parts[1] ?? "").replace(/\(.*/, "");
    return { first, second, firstNum: Number(first), secondNum: Number(second) };
  });
  const firstWins = sets.filter((set) => Number.isFinite(set.firstNum) && Number.isFinite(set.secondNum) && set.firstNum > set.secondNum).length;
  const secondWins = sets.filter((set) => Number.isFinite(set.firstNum) && Number.isFinite(set.secondNum) && set.secondNum > set.firstNum).length;
  const ealaIsFirst = ealaWon === true ? firstWins >= secondWins : ealaWon === false ? firstWins < secondWins : true;
  return sets.map((set) => ealaIsFirst ? set.first + "-" + set.second : set.second + "-" + set.first).join(" ");
}

function recentSingles(matches: SupabaseMatch[]): DashboardData["recentSingles"] {
  return [...matches]
    .filter((m) => m.eala_won !== null && m.eala_won !== undefined)
    .slice(0, 5)
    .map((m) => {
      const raw = m.raw_json;
      const rawDate = raw.MatchTimeStamp ?? m.match_start ?? m.match_date;
      return {
        result: m.eala_won === true ? "W" as const : "L" as const,
        opponent: opponentName(raw),
        tournament: String(raw.TournamentName ?? "Tournament"),
        date: typeof rawDate === "string" ? new Date(rawDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
        round: String(m.round_name ?? "—"),
        score: (() => {
          const score = orientedScore(raw.scores, m.eala_won);
          const reasonCode = String(raw.reason_code ?? "").toUpperCase();
          return score ? (reasonCode === "R" ? score + " RET" : score) : null;
        })(),
      };
    });
}

function grandSlamYears(matches: SupabaseMatch[]){
  const result: Record<string,{wins:number;losses:number;best:string;bestYear?:number|null}> = {};
  const bestRank: Record<string,number> = {};
  const keys:Record<string,string>={"AUSTRALIAN OPEN":"Australian Open","ROLAND GARROS":"French Open","FRENCH OPEN":"French Open","WIMBLEDON":"Wimbledon","US OPEN":"US Open"};
  const mainRoundRank:Record<string,number>={R128:1,R64:2,R32:3,R16:4,Q:5,S:6,F:7};
  const label=(raw:WtaMatch)=>{
    if(String(raw.qpm_flag??"").toUpperCase()==="Q"){
      const qRound=Number(raw.tourn_round);
      return Number.isFinite(qRound) ? "Q"+String(qRound) : "Q";
    }
    return ({R128:"1R",R64:"2R",R32:"3R",R16:"4R",Q:"QF",S:"SF",F:"F"} as Record<string,string>)[String(raw.round_name??"")] ?? String(raw.round_name??"—");
  };
  const stageRank=(raw:WtaMatch)=>String(raw.qpm_flag??"").toUpperCase()==="Q" ? (Number(raw.tourn_round)||0) : (mainRoundRank[String(raw.round_name??"")]??0);
  for(const match of matches){
    const raw=match.raw_json,name=String(raw.TournamentName??"").toUpperCase();
    const key=Object.entries(keys).find(([needle])=>name.includes(needle))?.[1];
    if(!key)continue;
    result[key]??={wins:0,losses:0,best:"",bestYear:null};
    const qualifying=String(raw.qpm_flag??"").toUpperCase()==="Q";
    if(!qualifying){ if(match.eala_won===true)result[key].wins++; if(match.eala_won===false)result[key].losses++; }
    const year=Number(raw.tourn_year??(raw.tournament&&typeof raw.tournament==="object"?(raw.tournament as Record<string,unknown>).year:null));
    if(!Number.isFinite(year))continue;
    const rank=stageRank(raw),current=bestRank[key]??0,currentYear=result[key].bestYear??null;
    if(rank>current || (rank===current && (currentYear===null || year>currentYear))){
      bestRank[key]=rank;
      result[key]={...result[key],best:label(raw),bestYear:year};
    }
  }
  return result;
}

function latestMatch(matches: SupabaseMatch[]): WtaMatch | null {
  const latest = matches.find((match) => match.eala_won !== null && match.eala_won !== undefined);
  return latest ? {
    ...latest.raw_json,
    eala_won: latest.eala_won,
    match_start: latest.match_start,
    match_date: latest.match_date,
    round_name: latest.round_name,
  } : null;
}

export async function getEalaDashboardFromSupabase(): Promise<DashboardData> {
  try {
    const seasonYear=2026;
    const [matches, statsRows, seasonRows, rankings, nextRows] = await Promise.all([
      fetchTable<SupabaseMatch>(
        `eala_matches?player_id=eq.${EALA_ID}&category=eq.singles&status=eq.completed&select=match_start,match_date,round_name,eala_won,raw_json&order=match_start.desc.nullslast,match_date.desc.nullslast&limit=500`
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
                : next.tournament_start
                  ? (() => {
                      const start = new Date(next.tournament_start);
                      const end = next.tournament_end ? new Date(next.tournament_end) : null;
                      if (Number.isNaN(start.getTime())) return "TBA";
                      const startText = start.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      });
                      if (!end || Number.isNaN(end.getTime())) {
                        return start.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        });
                      }
                      const endText = end.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });
                      return startText + " – " + endText;
                    })()
                  : "TBA",
            surface: next.surface ?? "—",
            venue: next.venue ?? "—",
            tournamentStart: next.tournament_start ?? "",
            tournamentEnd: next.tournament_end ?? "",
            timeKnown: Boolean(next.match_start),
            matchTime: next.match_start
              ? new Date(next.match_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
              : null,
            matchTimePhilippines: next.match_start
              ? new Date(next.match_start)
                  .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" })
                  .replace(":00", "")
                  .replace(" AM", "am")
                  .replace(" PM", "pm") + " PHT"
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
      grandSlams: grandSlamYears(matches),
    };
  } catch (error) {
    console.error("Supabase dashboard read failed:", error);
    throw error;
  }
}
