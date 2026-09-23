export type MatchWinnerOdds = {
  eala: string;
  opponent: string;
  opponentName: string;
};

type NextMatch = {
  tournament: string;
  opponent: string;
  matchTime?: string | null;
} | null;

type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type OddsOutcome = {
  name: string;
  price: number;
};

type OddsMarket = {
  key: string;
  outcomes: OddsOutcome[];
};

type OddsBookmaker = {
  key: string;
  title: string;
  markets: OddsMarket[];
};

type OddsResponse = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsBookmaker[];
};

const API_BASE = "https://api.the-odds-api.com/v4";
const DEFAULT_REGIONS = "uk";
const CACHE_SECONDS = 2 * 60 * 60;

const WTA_SPORT_KEYS: Record<string, string> = {
  "SINGAPORE TENNIS OPEN": "tennis_wta_singapore_open",
  "AUSTRALIAN OPEN": "tennis_wta_aus_open_singles",
  "FRENCH OPEN": "tennis_wta_french_open",
  "ROLAND GARROS": "tennis_wta_french_open",
  "WIMBLEDON": "tennis_wta_wimbledon",
  "US OPEN": "tennis_wta_us_open",
  "MIAMI OPEN": "tennis_wta_miami_open",
  "INDIAN WELLS": "tennis_wta_indian_wells",
  "MADRID OPEN": "tennis_wta_madrid_open",
  "ITALIAN OPEN": "tennis_wta_italian_open",
  "CANADIAN OPEN": "tennis_wta_canadian_open",
  "CINCINNATI OPEN": "tennis_wta_cincinnati_open",
  "CHINA OPEN": "tennis_wta_china_open",
  "GUADALAJARA OPEN": "tennis_wta_guadalajara_open",
  "WASHINGTON OPEN": "tennis_wta_washington_open",
  "QATAR OPEN": "tennis_wta_qatar_open",
  "DUBAI CHAMPIONSHIPS": "tennis_wta_dubai",
  "CHARLESTON OPEN": "tennis_wta_charleston_open",
  "GERMAN OPEN": "tennis_wta_german_open",
  "BAD HOMBURG OPEN": "tennis_wta_bad_homburg_open",
  "MONTERREY OPEN": "tennis_wta_monterrey_open",
  "WUHAN OPEN": "tennis_wta_wuhan_open",
  "STUTTGART OPEN": "tennis_wta_stuttgart_open",
  "QUEEN'S CLUB CHAMPIONSHIPS": "tennis_wta_queens_club_champ",
};

function normaliseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isEala(value: string) {
  return normaliseName(value).includes("eala");
}

function matchesOpponent(value: string, opponent: string) {
  const candidate = normaliseName(value);
  const target = normaliseName(opponent);
  if (!candidate || !target) return false;
  if (candidate === target) return true;
  const targetParts = opponent.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const surname = targetParts[targetParts.length - 1] ?? "";
  return Boolean(surname) && candidate.includes(normaliseName(surname));
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getUpcomingMatchWinnerOdds(nextMatch: NextMatch): Promise<MatchWinnerOdds | null> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey || !nextMatch?.opponent || nextMatch.opponent === "TBA") return null;

  const tournamentKey = WTA_SPORT_KEYS[nextMatch.tournament.trim().toUpperCase()];
  if (!tournamentKey) return null;

  const params = new URLSearchParams({
    apiKey,
    dateFormat: "iso",
  });
  const events = await getJson<OddsEvent[]>(
    API_BASE + "/sports/" + tournamentKey + "/events?" + params.toString()
  );
  if (!events?.length) return null;

  const targetEvents = events
    .filter((event) =>
      (isEala(event.home_team) && matchesOpponent(event.away_team, nextMatch.opponent)) ||
      (isEala(event.away_team) && matchesOpponent(event.home_team, nextMatch.opponent))
    )
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.commence_time) - Date.now()) -
        Math.abs(Date.parse(b.commence_time) - Date.now())
    );

  const event = targetEvents[0];
  if (!event?.id) return null;

  const oddsParams = new URLSearchParams({
    apiKey,
    regions: process.env.THE_ODDS_API_REGIONS ?? DEFAULT_REGIONS,
    markets: "h2h",
    oddsFormat: "decimal",
    dateFormat: "iso",
  });
  const oddsResponse = await getJson<OddsResponse>(
    API_BASE + "/sports/" + tournamentKey + "/events/" + event.id + "/odds?" + oddsParams.toString()
  );
  if (!oddsResponse?.bookmakers?.length) return null;

  let bestEala: number | null = null;
  let bestOpponent: number | null = null;
  let resolvedOpponentName = nextMatch.opponent;

  for (const bookmaker of oddsResponse.bookmakers) {
    const market = bookmaker.markets?.find((item) => item.key === "h2h");
    if (!market) continue;

    for (const outcome of market.outcomes ?? []) {
      if (!Number.isFinite(outcome.price)) continue;

      if (isEala(outcome.name)) {
        bestEala = bestEala === null ? outcome.price : Math.max(bestEala, outcome.price);
      } else if (matchesOpponent(outcome.name, nextMatch.opponent)) {
        bestOpponent = bestOpponent === null ? outcome.price : Math.max(bestOpponent, outcome.price);
        resolvedOpponentName = outcome.name;
      }
    }
  }

  if (bestEala === null || bestOpponent === null) return null;

  return {
    eala: bestEala.toFixed(2),
    opponent: bestOpponent.toFixed(2),
    opponentName: resolvedOpponentName,
  };
}
