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

type CanonicalMatch = {
  source: "wta" | "bornan";
  source_match_id: string;
  canonical_key: string;
  category: "singles" | "doubles";
  state: "event_only" | "scheduled" | "confirmed" | "completed" | "cancelled";
  tournament_name: string | null;
  tournament_level: string | null;
  season_year: number | null;
  round_name: string | null;
  scheduled_at: string | null;
  played_at: string | null;
  opponent_name: string | null;
  eala_won: boolean | null;
  score: string | null;
  surface: string | null;
  venue: string | null;
  raw_json: WtaMatch;
  updated_at: string;
};

type Ranking = { ranking_type: "singles" | "doubles"; ranking: number | null };
type NextMatch = {
  tournament: string;
  round_name: string | null;
  opponent: string | null;
  match_date: string | null;
  match_start: string | null;
  surface: string | null;
  venue: string | null;
  tournament_start: string | null;
  tournament_end: string | null;
};

async function fetchTable<T>(path: string): Promise<T[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  return response.json();
}

function roundRank(round: string | null) {
  return ({ R128: 1, R64: 2, R32: 3, R16: 4, Q: 5, S: 6, F: 7 } as Record<string, number>)[round ?? ""] ?? 0;
}

function rawValue(raw: WtaMatch, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== null && value !== undefined && String(value).trim()) return value;
  }
  return null;
}

function opponentName(match: CanonicalMatch) {
  if (match.opponent_name?.trim()) return match.opponent_name.trim();
  const raw = match.raw_json;
  if (raw.opponent && typeof raw.opponent === "object") {
    const name = (raw.opponent as Record<string, unknown>).fullName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "Opponent";
}

function orientedScore(value: string | null, ealaWon: boolean | null) {
  if (!value?.trim()) return null;
  const sets = value.trim().split(/\s+/).map((set) => {
    const [first = "", secondRaw = ""] = set.split("-");
    return { first, second: secondRaw.replace(/\(.*/, ""), a: Number(first), b: Number(secondRaw) };
  });
  const aWins = sets.filter(s => Number.isFinite(s.a) && Number.isFinite(s.b) && s.a > s.b).length;
  const bWins = sets.filter(s => Number.isFinite(s.a) && Number.isFinite(s.b) && s.b > s.a).length;
  const ealaIsFirst = ealaWon === true ? aWins >= bWins : ealaWon === false ? aWins < bWins : true;
  return sets.map(s => ealaIsFirst ? `${s.first}-${s.second}` : `${s.second}-${s.first}`).join(" ");
}

function matchTimestamp(match: CanonicalMatch) {
  for (const value of [match.played_at, match.scheduled_at, match.raw_json.MatchTimeStamp, match.raw_json.matchDate]) {
    if (typeof value !== "string" || !value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

function newestFirst(matches: CanonicalMatch[]) {
  return [...matches].sort((a, b) => matchTimestamp(b) - matchTimestamp(a));
}

function uiMatch(match: CanonicalMatch): WtaMatch {
  const raw = { ...match.raw_json };
  return {
    ...raw,
    TournamentName: match.tournament_name ?? raw.TournamentName,
    round_name: match.round_name ?? raw.round_name,
    eala_won: match.eala_won,
    scores: match.score ?? raw.scores,
    match_start: match.played_at ?? match.scheduled_at,
    match_date: match.played_at ?? match.scheduled_at,
    MatchTimeStamp: match.played_at ?? match.scheduled_at ?? raw.MatchTimeStamp,
    opponent: raw.opponent ?? (match.opponent_name ? { fullName: match.opponent_name } : undefined),
    Surface: match.surface ?? raw.Surface,
    city: match.venue ?? raw.city,
  };
}

function latestMatch(matches: CanonicalMatch[]) {
  const latest = newestFirst(matches).find(m => m.category === "singles" && m.state === "completed" && m.eala_won !== null);
  return latest ? uiMatch(latest) : null;
}

function recentSingles(matches: CanonicalMatch[]): DashboardData["recentSingles"] {
  return newestFirst(matches)
    .filter(m => m.category === "singles" && m.state === "completed" && m.eala_won !== null)
    .slice(0, 5)
    .map(m => ({
      result: m.eala_won === true ? "W" : "L",
      opponent: opponentName(m),
      tournament: m.tournament_name ?? "Tournament",
      date: m.played_at
        ? new Date(m.played_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "—",
      round: m.round_name ?? "—",
      score: orientedScore(m.score, m.eala_won),
    }));
}

function records(matches: CanonicalMatch[], category: "singles" | "doubles", year?: number) {
  const completed = matches.filter(m =>
    m.category === category &&
    m.state === "completed" &&
    m.eala_won !== null &&
    (year === undefined || m.season_year === year)
  );
  return {
    wins: completed.filter(m => m.eala_won === true).length,
    losses: completed.filter(m => m.eala_won === false).length,
  };
}

function titles(matches: CanonicalMatch[], category: "singles" | "doubles", year?: number) {
  return matches.filter(m =>
    m.category === category &&
    m.state === "completed" &&
    m.eala_won === true &&
    m.round_name === "F" &&
    (year === undefined || m.season_year === year) &&
    !/125/i.test(m.tournament_name ?? "")
  ).length;
}

function grandSlamYears(matches: CanonicalMatch[]) {
  const result: Record<string, { wins: number; losses: number; best: string; bestYear?: number | null }> = {};
  const keys: Record<string, string> = {
    "AUSTRALIAN OPEN": "Australian Open",
    "ROLAND GARROS": "French Open",
    "FRENCH OPEN": "French Open",
    "WIMBLEDON": "Wimbledon",
    "US OPEN": "US Open",
  };
  const labels: Record<string, string> = { R128: "1R", R64: "2R", R32: "3R", R16: "4R", Q: "QF", S: "SF", F: "F" };
  const rank: Record<string, number> = { R128: 1, R64: 2, R32: 3, R16: 4, Q: 5, S: 6, F: 7 };
  const bestRank: Record<string, number> = {};

  for (const match of matches) {
    if (match.category !== "singles" || match.state !== "completed") continue;
    const name = (match.tournament_name ?? "").toUpperCase();
    const key = Object.entries(keys).find(([needle]) => name.includes(needle))?.[1];
    if (!key) continue;
    result[key] ??= { wins: 0, losses: 0, best: "", bestYear: null };
    if (match.eala_won === true) result[key].wins++;
    if (match.eala_won === false) result[key].losses++;
    const r = rank[match.round_name ?? ""] ?? 0;
    const year = match.season_year;
    if (r > (bestRank[key] ?? 0) || (r === (bestRank[key] ?? 0) && (year ?? 0) > (result[key].bestYear ?? 0))) {
      bestRank[key] = r;
      result[key] = { ...result[key], best: labels[match.round_name ?? ""] ?? match.round_name ?? "—", bestYear: year };
    }
  }
  return result;
}

function latestRanking(rows: Ranking[], type: "singles" | "doubles") {
  return rows.find(r => r.ranking_type === type)?.ranking ?? null;
}

export async function getEalaDashboardFromSupabase(): Promise<DashboardData> {
  const seasonYear = new Date().getUTCFullYear();

  const [matches, rankings, nextRows] = await Promise.all([
    fetchTable<CanonicalMatch>(
      `eala_canonical_matches?player_id=eq.${EALA_ID}&select=source,source_match_id,canonical_key,category,state,tournament_name,tournament_level,season_year,round_name,scheduled_at,played_at,opponent_name,eala_won,score,surface,venue,raw_json,updated_at&limit=1000`
    ),
    fetchTable<Ranking>(
      `eala_rankings?player_id=eq.${EALA_ID}&select=ranking_type,ranking&order=ranking_date.desc&limit=20`
    ),
    fetchTable<NextMatch>(
      `eala_next_match?player_id=eq.${EALA_ID}&select=tournament,round_name,opponent,match_date,match_start,surface,venue,tournament_start,tournament_end&limit=1`
    ),
  ]);

  const completedSingles = matches.filter(m => m.category === "singles" && m.state === "completed" && m.eala_won !== null);
  const latestUpdated = matches.reduce<string | null>((latest, m) => !latest || m.updated_at > latest ? m.updated_at : latest, null);
  const seasonSingles = records(matches, "singles", seasonYear);
  const seasonDoubles = records(matches, "doubles", seasonYear);
  const careerSingles = records(matches, "singles");
  const careerDoubles = records(matches, "doubles");
  const next = nextRows[0] ?? null;

  return {
    lastUpdated: latestUpdated,
    latestMatch: latestMatch(completedSingles),
    recentSingles: recentSingles(completedSingles),
    nextMatch: next ? {
      tournament: next.tournament,
      round: next.round_name ?? "TBA",
      opponent: next.opponent ?? "TBA",
      date: next.match_date
        ? new Date(next.match_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : next.match_start
          ? new Date(next.match_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : next.tournament_start
            ? (() => {
                const start = new Date(next.tournament_start);
                const end = next.tournament_end ? new Date(next.tournament_end) : null;
                if (Number.isNaN(start.getTime())) return "TBA";
                const a = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                if (!end || Number.isNaN(end.getTime())) return start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                return a + " – " + end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
        ? new Date(next.match_start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" }).replace(":00", "").replace(" AM", "am").replace(" PM", "pm") + " PHT"
        : null,
    } : null,
    singlesRank: latestRanking(rankings, "singles"),
    doublesRank: latestRanking(rankings, "doubles"),
    singlesRecord: seasonSingles,
    doublesRecord: seasonDoubles,
    singlesTitles: titles(matches, "singles", seasonYear),
    doublesTitles: titles(matches, "doubles", seasonYear),
    highestSinglesRank: null,
    highestDoublesRank: null,
    grandSlams: grandSlamYears(matches),
  };
}
