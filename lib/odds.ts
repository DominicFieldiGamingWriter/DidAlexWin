export type UpcomingOdds = {
  matchWinner: {
    eala: string;
    opponent: string;
    opponentName: string;
  } | null;
  spread: {
    eala: string;
    opponent: string;
    opponentName: string;
    ealaPoint: number;
    opponentPoint: number;
  } | null;
  betUrl: string | null;
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
  point?: number;
  link?: string | null;
};

type OddsMarket = {
  key: string;
  link?: string | null;
  outcomes: OddsOutcome[];
};

type OddsBookmaker = {
  key: string;
  title: string;
  link?: string | null;
  markets: OddsMarket[];
};

type OddsSport = {
  key: string;
  group: string;
  title: string;
  description?: string;
  active: boolean;
  has_outrights: boolean;
};

type OddsResponse = {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  link?: string | null;
  bookmakers?: OddsBookmaker[];
};

const API_BASE = "https://api.the-odds-api.com/v4";
const DEFAULT_REGIONS = "uk,eu,au";
const CACHE_SECONDS = 2 * 60 * 60;

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

async function resolveSportKey(tournament: string, apiKey: string): Promise<string | null> {
  const sports = await getJson<OddsSport[]>(API_BASE + "/sports?apiKey=" + encodeURIComponent(apiKey));
  if (!sports?.length) return null;
  const tokens = tournament.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
    .filter(token => !["open","championship","championships","presented","by","singles","women","womens"].includes(token));
  const candidates=sports
    .filter(s=>s.active&&s.group.toLowerCase()==="tennis")
    .filter(s=>/wta|women/i.test(s.title+" "+(s.description??"")))
    .map(s=>{
      const combined=normaliseName(s.title+" "+(s.description??""));
      const overlap=tokens.filter(t=>combined.includes(normaliseName(t))).length;
      const titleNorm=normaliseName(s.title), targetNorm=normaliseName(tournament);
      const exact=targetNorm&&(targetNorm.includes(titleNorm)||titleNorm.includes(targetNorm))?100:0;
      return {sport:s,score:exact+overlap*10};
    }).sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  return best&&best.score>0?best.sport.key:null;
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

export async function getUpcomingMatchWinnerOdds(nextMatch: NextMatch): Promise<UpcomingOdds | null> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey || !nextMatch?.opponent || nextMatch.opponent === "TBA") return null;

  const tournamentKey = await resolveSportKey(nextMatch.tournament, apiKey);
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
  const regions = process.env.THE_ODDS_API_REGIONS ?? DEFAULT_REGIONS;

  let matchWinner: UpcomingOdds["matchWinner"] = null;
  if (event?.id) {
    const oddsParams = new URLSearchParams({
      apiKey,
      regions,
      markets: "h2h,spreads",
      includeLinks: "true",
      oddsFormat: "decimal",
      dateFormat: "iso",
    });
    const oddsResponse = await getJson<OddsResponse>(
      API_BASE + "/sports/" + tournamentKey + "/events/" + event.id + "/odds?" + oddsParams.toString()
    );

    let spread: UpcomingOdds["spread"] = null;
    let betUrl: string | null = null;

    if (oddsResponse?.bookmakers?.length) {
      let bestEala: number | null = null;
      let bestOpponent: number | null = null;
      let resolvedOpponentName = nextMatch.opponent;
      let bestEalaLink: string | null = null;
      let fallbackLink: string | null = oddsResponse.link ?? null;

      let bestSpreadEalaPrice: number | null = null;
      let bestSpread: UpcomingOdds["spread"] = null;
      let bestSpreadLink: string | null = null;

      for (const bookmaker of oddsResponse.bookmakers) {
        const h2h = bookmaker.markets?.find((item) => item.key === "h2h");
        const spreads = bookmaker.markets?.find((item) => item.key === "spreads");

        if (bookmaker.link) fallbackLink = fallbackLink ?? bookmaker.link;
        if (h2h?.link) fallbackLink = fallbackLink ?? h2h.link;
        if (spreads?.link) fallbackLink = fallbackLink ?? spreads.link;

        if (h2h) {
          for (const outcome of h2h.outcomes ?? []) {
            if (!Number.isFinite(outcome.price)) continue;

            if (isEala(outcome.name)) {
              if (bestEala === null || outcome.price > bestEala) {
                bestEala = outcome.price;
                bestEalaLink = outcome.link ?? h2h.link ?? bookmaker.link ?? null;
              }
            } else if (matchesOpponent(outcome.name, nextMatch.opponent)) {
              bestOpponent = bestOpponent === null ? outcome.price : Math.max(bestOpponent, outcome.price);
              resolvedOpponentName = outcome.name;
            }
          }
        }

        if (spreads) {
          const ealaOutcome = spreads.outcomes?.find(
            (outcome) => isEala(outcome.name) && Number.isFinite(outcome.price) && Number.isFinite(outcome.point)
          );
          const opponentOutcome = spreads.outcomes?.find(
            (outcome) =>
              matchesOpponent(outcome.name, nextMatch.opponent) &&
              Number.isFinite(outcome.price) &&
              Number.isFinite(outcome.point)
          );

          if (ealaOutcome && opponentOutcome) {
            if (bestSpreadEalaPrice === null || ealaOutcome.price > bestSpreadEalaPrice) {
              bestSpreadEalaPrice = ealaOutcome.price;
              bestSpread = {
                eala: ealaOutcome.price.toFixed(2),
                opponent: opponentOutcome.price.toFixed(2),
                opponentName: opponentOutcome.name,
                ealaPoint: Number(ealaOutcome.point),
                opponentPoint: Number(opponentOutcome.point),
              };
              bestSpreadLink =
                ealaOutcome.link ?? spreads.link ?? bookmaker.link ?? null;
            }
          }
        }
      }

      if (bestEala !== null && bestOpponent !== null) {
        matchWinner = {
          eala: bestEala.toFixed(2),
          opponent: bestOpponent.toFixed(2),
          opponentName: resolvedOpponentName,
        };
      }

      spread = bestSpread;
      betUrl = bestEalaLink ?? bestSpreadLink ?? fallbackLink;
    }

    if (!matchWinner && !spread) return null;

    return {
      matchWinner,
      spread,
      betUrl,
    };
  }

  return null;
}
