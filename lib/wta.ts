const BASE = "https://api.wtatennis.com/tennis";

export const EALA_ID = 330332;
const FIVE_MINUTES = 300;

export type WtaMatch = Record<string, unknown>;

export type RecentResult = { result: "W" | "L"; opponent: string; tournament: string; date: string; round: string; score: string | null };

export type DashboardData = {
  lastUpdated: string | null;
  latestMatch: WtaMatch | null;
  recentSingles: RecentResult[];
  nextMatch: {
    tournament: string;
    round: string;
    opponent: string;
    date: string;
    surface: string;
    venue: string;
    tournamentStart: string;
    tournamentEnd: string;
    timeKnown: boolean;
    matchTime: string | null;
  } | null;
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

const WTA_FETCH_TIMEOUT_MS = 10_000;

async function getJson(url: string, revalidate = FIVE_MINUTES): Promise<unknown> {
  const response = await fetch(url, {
    next: { revalidate },
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(WTA_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`WTA API returned ${response.status}`);
  }

  return response.json();
}

function records(payload: unknown, key = ""): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  if (typeof payload !== "object" || payload === null) return [];

  const object = payload as Record<string, unknown>;
  const value = key ? object[key] : object.content ?? object.matches;

  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function playerIdsMatch(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number") {
    return String(value) === String(EALA_ID);
  }

  if (Array.isArray(value)) {
    return value.some(playerIdsMatch);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).some(playerIdsMatch);
  }

  return false;
}

function roundRank(round: string): number {
  const order: Record<string, number> = {
    R128: 1,
    R64: 2,
    R32: 3,
    R16: 4,
    Q: 5,
    S: 6,
    F: 7,
  };
  return order[round] ?? 0;
}

function ealaWon(match: WtaMatch): boolean | null {
  const winner = numberValue(match.winner);
  if (winner === null) return null;

  if (winner === 1) return stringValue(match.player_1) === String(EALA_ID);
  if (winner === 2) return stringValue(match.player_2) === String(EALA_ID);

  return null;
}

function opponentName(match: WtaMatch): string {
  const opponent = match.opponent;

  if (opponent && typeof opponent === "object") {
    const name = stringValue(
      (opponent as Record<string, unknown>).fullName
    );
    if (name) return name;
  }

  const ealaIsPlayerOne = stringValue(match.player_1) === String(EALA_ID);
  const team = ealaIsPlayerOne
    ? stringValue(match.team_name_2)
    : stringValue(match.team_name_1);

  if (team && team !== "BYE") {
    return team.replace(/\s+/g, " ").trim();
  }

  return "Opponent";
}

function tournamentDates(match: WtaMatch): { start: string; end: string } {
  const tournament =
    typeof match.tournament === "object" && match.tournament !== null
      ? (match.tournament as Record<string, unknown>)
      : {};

  return {
    start: stringValue(tournament.startDate) || stringValue(match.StartDate),
    end: stringValue(tournament.endDate),
  };
}

function exactMatchDate(match: WtaMatch): string {
  const candidates = [
    match.matchDate,
    match.match_date,
    match.scheduledTime,
    match.scheduled_time,
    match.date,
  ];

  for (const candidate of candidates) {
    const text = stringValue(candidate);
    if (text && !Number.isNaN(Date.parse(text))) return text;
  }

  return "";
}

function matchSortKey(match: WtaMatch): number {
  const exact = exactMatchDate(match);
  const exactTimestamp = Date.parse(exact);

  if (!Number.isNaN(exactTimestamp)) {
    return exactTimestamp * 10 + roundRank(stringValue(match.round_name));
  }

  const dates = tournamentDates(match);
  const end = Date.parse(dates.end);
  const start = Date.parse(dates.start);
  const datePart = Number.isNaN(end) ? (Number.isNaN(start) ? 0 : start) : end;

  return datePart * 10 + roundRank(stringValue(match.round_name));
}

function isCompleted(match: WtaMatch): boolean {
  return (
    stringValue(match.scores).trim().length > 0 &&
    numberValue(match.winner) !== null &&
    stringValue(match.player_2) !== "BYE" &&
    !!match.opponent
  );
}

async function getPlayerMatches(type: "S" | "D"): Promise<WtaMatch[]> {
  const payload = await getJson(
    `${BASE}/players/${EALA_ID}/matches?page=0&pageSize=500&id=${EALA_ID}&year=&type=${type}&sort=desc&tournamentGroupId=`
  );

  return records(payload, "matches");
}

async function findRank(
  type: "rankSingles" | "rankDoubles",
  metric: "singles" | "doubles"
): Promise<number | null> {
  const pageSize = 200;

  for (let page = 0; page < 10; page += 1) {
    try {
      const payload = await getJson(
        `${BASE}/players/ranked?type=${type}&metric=${metric}&page=${page}&pageSize=${pageSize}`
      );

      const rows = records(payload);
      const row = rows.find((item) => {
        const player = item.player;
        return (
          typeof player === "object" &&
          player !== null &&
          String((player as Record<string, unknown>).id) === String(EALA_ID)
        );
      });

      const ranking = numberValue(row?.ranking);
      if (ranking !== null) return ranking;

      if (rows.length < pageSize) return null;
    } catch {
      return null;
    }
  }

  return null;
}

function rankRecord(matches: WtaMatch[]) {
  return {
    wins: matches.filter((match) => ealaWon(match) === true && isCompleted(match)).length,
    losses: matches.filter((match) => ealaWon(match) === false && isCompleted(match)).length,
  };
}

function titleCount(matches: WtaMatch[]) {
  return matches.filter(
    (match) =>
      stringValue(match.round_name) === "F" &&
      ealaWon(match) === true &&
      stringValue(match.TournamentLevel) !== "C"
  ).length;
}

function grandSlamKey(name: string): string | null {
  const value = name.toUpperCase();
  if (value.includes("AUSTRALIAN OPEN")) return "Australian Open";
  if (value.includes("ROLAND GARROS") || value.includes("FRENCH OPEN")) {
    return "French Open";
  }
  if (value.includes("WIMBLEDON")) return "Wimbledon";
  if (value.includes("US OPEN")) return "US Open";
  return null;
}

function bestRound(current: string, candidate: string): string {
  return roundRank(candidate) > roundRank(current) ? candidate : current;
}

function recentScore(raw: WtaMatch): string | null {
  const value = stringValue(raw.scores).trim();
  if (!value) return null;
  const ealaIs1 = stringValue(raw.player_1) === String(EALA_ID);
  return value.split(/\s+/).map((set) => {
    const parts = set.split("-");
    const first = parts[0] ?? "";
    const second = (parts[1] ?? "").replace(/\(.*/, "");
    return ealaIs1 ? `${first}-${second}` : `${second}-${first}`;
  }).join(" ");
}

function recentSingles(matches: WtaMatch[]): RecentResult[] {
  return [...matches].filter(isCompleted).sort((a,b)=>matchSortKey(b)-matchSortKey(a)).slice(0,5).map(match=>({result:ealaWon(match)===true?"W":"L",opponent:opponentName(match),tournament:stringValue(match.TournamentName)||"Tournament",date:formatDate(exactMatchDate(match)||tournamentDates(match).end),round:stringValue(match.round_name)||"—",score:recentScore(match)}));
}

function buildGrandSlams(matches: WtaMatch[]) {
  const result: DashboardData["grandSlams"] = {};

  for (const match of matches) {
    if (!isCompleted(match)) continue;

    const key = grandSlamKey(stringValue(match.TournamentName));
    if (!key) continue;

    if (!result[key]) {
      result[key] = { wins: 0, losses: 0, best: "", bestYear: null };
    }

    if (ealaWon(match) === true) result[key].wins += 1;
    if (ealaWon(match) === false) result[key].losses += 1;

    const candidateRound=stringValue(match.round_name);
    const candidateYear=numberValue(match.tourn_year??(typeof match.tournament==="object"&&match.tournament!==null?(match.tournament as Record<string,unknown>).year:null));
    if(roundRank(candidateRound)>roundRank(result[key].best)||(roundRank(candidateRound)===roundRank(result[key].best)&&candidateYear!==null&&(result[key].bestYear??0)<candidateYear)){result[key].best=candidateRound;result[key].bestYear=candidateYear;}
  }

  return result;
}

function formatDate(value: string): string {
  if (!value) return "TBA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBA";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function findNextMatch(): Promise<DashboardData["nextMatch"]> {
  try {
    const tournamentPayload = await getJson(
      `${BASE}/tournaments?page=0&pageSize=100`
    );

    const upcomingTournaments = records(tournamentPayload, "tournaments")
      .map((item) => {
        const group =
          typeof item.tournamentGroup === "object" &&
          item.tournamentGroup !== null
            ? (item.tournamentGroup as Record<string, unknown>)
            : {};

        return {
          groupId: numberValue(group.id),
          year: numberValue(item.year),
          start: stringValue(item.startDate),
          end: stringValue(item.endDate),
          title: stringValue(item.title),
          surface: stringValue(item.surface),
        };
      })
      .filter(
        (item) =>
          item.groupId !== null &&
          item.year !== null &&
          item.start &&
          Date.parse(item.start) >= Date.now() - 36 * 60 * 60 * 1000
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    const batchSize = 8;

    for (let offset = 0; offset < upcomingTournaments.length; offset += batchSize) {
      const batch = upcomingTournaments.slice(offset, offset + batchSize);

      const entries = await Promise.all(
        batch.map(async (tournament) => {
          try {
            const payload = await getJson(
              `${BASE}/tournaments/${tournament.groupId}/${tournament.year}/players`
            );

            return {
              tournament,
              entered: records(payload).some(playerIdsMatch),
            };
          } catch {
            return { tournament, entered: false };
          }
        })
      );

      const entered = entries.filter((item) => item.entered);

      for (const entry of entered) {
        const tournament = entry.tournament;

        try {
          const payload = await getJson(
            `${BASE}/tournaments/${tournament.groupId}/${tournament.year}/matches`
          );
          const matches = records(payload, "matches");
          const ealaMatches = matches.filter(playerIdsMatch);

          if (
            ealaMatches.length > 0 &&
            ealaMatches.every((match) => isCompleted(match))
          ) {
            continue;
          }

          const upcoming = ealaMatches
            .filter((match) => {
              const scores = stringValue(match.scores).trim();
              const winner = numberValue(match.winner);
              const opponent = match.opponent;

              return (
                (!scores || winner === null) &&
                !!opponent &&
                String(match.player_2) !== "BYE"
              );
            })
            .sort((a, b) => {
              const da = exactMatchDate(a);
              const db = exactMatchDate(b);

              if (da && db) {
                return Date.parse(da) - Date.parse(db);
              }

              return (
                roundRank(stringValue(a.round_name)) -
                roundRank(stringValue(b.round_name))
              );
            });

          const match = upcoming[0];

          if (match) {
            const exactDate = exactMatchDate(match);
            const dates = tournamentDates(match);

            return {
              tournament:
                stringValue(match.TournamentName) ||
                tournament.title ||
                "Upcoming tournament",
              round: stringValue(match.round_name) || "TBA",
              opponent: opponentName(match),
              date: exactDate ? formatDate(exactDate) : "TBA",
              surface: stringValue(match.Surface) || tournament.surface || "—",
              venue: stringValue(match.city) || "—",
              tournamentStart: dates.start || tournament.start,
              tournamentEnd: dates.end || tournament.end,
              timeKnown: Boolean(exactDate),
              matchTime: exactDate ? new Date(exactDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null,
            };
          }

          return {
            tournament: tournament.title || "Upcoming tournament",
            round: "TBA",
            opponent: "TBA",
            date: "TBA",
            surface: tournament.surface || "—",
            venue: "—",
            tournamentStart: tournament.start,
            tournamentEnd: tournament.end,
            timeKnown: false,
            matchTime: null,
          };
        } catch {
          continue;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}
export async function getEalaDashboard(): Promise<DashboardData> {
  const [singlesResult, doublesResult, singlesRank, doublesRank, nextMatch] =
    await Promise.all([
      getPlayerMatches("S").then((matches) => ({ matches, ok: true })).catch(() => ({ matches: [], ok: false })),
      getPlayerMatches("D").then((matches) => ({ matches, ok: true })).catch(() => ({ matches: [], ok: false })),
      findRank("rankSingles", "singles"),
      findRank("rankDoubles", "doubles"),
      findNextMatch(),
    ]);

  const singles = singlesResult.matches;
  const doubles = doublesResult.matches;

  const latestMatch =
    [...singles]
      .filter(isCompleted)
      .sort((a, b) => matchSortKey(b) - matchSortKey(a))[0] ?? null;

  const singlesRecord = rankRecord(singles);
  const doublesRecord = rankRecord(doubles);

  return {
    lastUpdated: new Date().toISOString(),
    latestMatch,
    recentSingles: recentSingles(singles),
    nextMatch:
      singlesResult.ok || doublesResult.ok
        ? nextMatch
        : null,
    singlesRank,
    doublesRank,
    singlesRecord,
    doublesRecord,
    singlesTitles: titleCount(singles),
    doublesTitles: titleCount(doubles),
    highestSinglesRank: 18,
    highestDoublesRank: 88,
    grandSlams: buildGrandSlams(singles),
  };
}
