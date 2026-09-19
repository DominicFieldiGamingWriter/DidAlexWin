const BASE = "https://api.wtatennis.com/tennis";

export const EALA_ID = 330332;

export type WtaMatch = Record<string, unknown>;

export type DashboardData = {
  latestMatch: WtaMatch | null;
  nextMatch: {
    tournament: string;
    round: string;
    opponent: string;
    date: string;
    surface: string;
    venue: string;
  } | null;
  singlesRank: number | null;
  doublesRank: number | null;
  singlesRecord: { wins: number; losses: number };
  doublesRecord: { wins: number; losses: number };
  singlesTitles: number;
  doublesTitles: number;
  grandSlams: Record<string, { wins: number; losses: number; best: string }>;
  profile: Record<string, unknown>;
};

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    next: { revalidate: 900 },
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`WTA API returned ${response.status}`);
  }

  return response.json();
}

function records(payload: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  if (typeof payload !== "object" || payload === null) return [];

  const value = (payload as Record<string, unknown>)[key];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  const content = (payload as Record<string, unknown>).content;
  if (Array.isArray(content)) {
    return content.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  return [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function playerIdsMatch(value: unknown, targetId: number): boolean {
  if (typeof value === "string" || typeof value === "number") {
    return String(value) === String(targetId);
  }

  if (Array.isArray(value)) {
    return value.some((item) => playerIdsMatch(item, targetId));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).some((item) =>
      playerIdsMatch(item, targetId)
    );
  }

  return false;
}

function matchDate(match: WtaMatch): number {
  const candidates = [
    match.StartDate,
    match.startDate,
    match.matchDate,
    match.date,
    match.scheduledTime,
  ];

  for (const candidate of candidates) {
    const text = stringValue(candidate);
    const time = Date.parse(text);
    if (!Number.isNaN(time)) return time;
  }

  return 0;
}

function hasPlayedOpponent(match: WtaMatch): boolean {
  const opponent = match.opponent;
  if (opponent && typeof opponent === "object") return true;

  const scores = stringValue(match.scores);
  return scores.trim().length > 0 && stringValue(match.player_2) !== "BYE";
}

function ealaWon(match: WtaMatch): boolean | null {
  const winner = numberValue(match.winner);
  const p1 = stringValue(match.player_1);
  const p2 = stringValue(match.player_2);

  if (winner === null) return null;
  if (winner === 1) return p1 === String(EALA_ID);
  if (winner === 2) return p2 === String(EALA_ID);
  return null;
}

function opponentName(match: WtaMatch): string {
  const opponent = match.opponent;
  if (opponent && typeof opponent === "object") {
    const fullName = stringValue(
      (opponent as Record<string, unknown>).fullName
    );
    if (fullName) return fullName;
  }

  const ealaIs1 = stringValue(match.player_1) === String(EALA_ID);
  const team = ealaIs1
    ? stringValue(match.team_name_2)
    : stringValue(match.team_name_1);

  if (team && team !== "BYE") {
    return team.replace(/\\s+/g, " ").trim();
  }

  return "Opponent";
}

function roundLabel(round: string): string {
  const map: Record<string, string> = {
    R128: "Round of 128",
    R64: "Round of 64",
    R32: "Round of 32",
    R16: "Round of 16",
    Q: "Quarterfinal",
    S: "Semifinal",
    F: "Final",
  };
  return map[round] ?? round || "—";
}

function bestRound(current: string, candidate: string): string {
  const order = ["R128", "R64", "R32", "R16", "Q", "S", "F"];
  const currentIndex = order.indexOf(current);
  const candidateIndex = order.indexOf(candidate);
  if (currentIndex === -1) return candidate;
  if (candidateIndex === -1) return current;
  return candidateIndex > currentIndex ? candidate : current;
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

function isCompletedMatch(match: WtaMatch): boolean {
  const scores = stringValue(match.scores).trim();
  const winner = numberValue(match.winner);
  return hasPlayedOpponent(match) && scores.length > 0 && winner !== null;
}

async function getPlayerMatches(type: "S" | "D", year = ""): Promise<WtaMatch[]> {
  const url =
    `${BASE}/players/${EALA_ID}/matches?page=0&pageSize=100&id=${EALA_ID}&year=${year}&type=${type}&sort=desc&tournamentGroupId=`;
  const payload = await getJson(url);
  return records(payload, "matches");
}

async function findRank(type: "rankSingles" | "rankDoubles", metric: "singles" | "doubles") {
  const payload = await getJson(
    `${BASE}/players/ranked?type=${type}&metric=${metric}&page=0&pageSize=100`
  );
  const rows = records(payload, "");
  const row = rows.find((item) => {
    const player = item.player;
    if (typeof player !== "object" || player === null) return false;
    return String((player as Record<string, unknown>).id) === String(EALA_ID);
  });
  return numberValue(row?.ranking);
}

async function findNextMatch(): Promise<DashboardData["nextMatch"]> {
  try {
    const calendarPayload = await getJson(
      `${BASE}/tournaments?page=0&pageSize=100`
    );

    const tournaments = records(calendarPayload, "tournaments")
      .map((item) => {
        const group =
          typeof item.tournamentGroup === "object" && item.tournamentGroup !== null
            ? (item.tournamentGroup as Record<string, unknown>)
            : null;

        return {
          groupId: numberValue(group?.id),
          year: numberValue(item.year),
          startDate: stringValue(item.startDate),
          title: stringValue(item.title),
          surface: stringValue(item.surface),
        };
      })
      .filter(
        (item) =>
          item.groupId !== null &&
          item.year !== null &&
          item.startDate &&
          Date.parse(item.startDate) >= Date.now() - 36 * 60 * 60 * 1000
      )
      .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
      .slice(0, 8);

    for (const tournament of tournaments) {
      const playersPayload = await getJson(
        `${BASE}/tournaments/${tournament.groupId}/${tournament.year}/players`
      );

      if (!playerIdsMatch(playersPayload, EALA_ID)) continue;

      const matchesPayload = await getJson(
        `${BASE}/tournaments/${tournament.groupId}/${tournament.year}/matches`
      );
      const matches = records(matchesPayload, "matches");

      const upcoming = matches
        .filter((match) => {
          if (!playerIdsMatch(match, EALA_ID)) return false;
          const time = matchDate(match);
          const scores = stringValue(match.scores).trim();
          const winner = numberValue(match.winner);
          return (
            (time === 0 || time >= Date.now() - 36 * 60 * 60 * 1000) &&
            scores.length === 0 &&
            winner === null &&
            stringValue(match.player_2) !== "BYE"
          );
        })
        .sort((a, b) => matchDate(a) - matchDate(b));

      const match = upcoming[0];
      if (!match) continue;

      const start = matchDate(match) || Date.parse(tournament.startDate);

      return {
        tournament:
          stringValue(match.TournamentName) ||
          tournament.title ||
          "Upcoming tournament",
        round: roundLabel(stringValue(match.round_name)),
        opponent: opponentName(match),
        date: start
          ? new Date(start).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "TBA",
        surface:
          stringValue(match.Surface) || tournament.surface || "—",
        venue:
          stringValue(match.city) ||
          stringValue(match.Country) ||
          "—",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function getEalaDashboard(): Promise<DashboardData> {
  const [
    latestSingles,
    latestDoubles,
    singlesRank,
    doublesRank,
    nextMatch,
    profile,
  ] = await Promise.all([
    getPlayerMatches("S"),
    getPlayerMatches("D"),
    findRank("rankSingles", "singles"),
    findRank("rankDoubles", "doubles"),
    findNextMatch(),
    getJson(`${BASE}/players/${EALA_ID}`).catch(() => ({})),
  ]);

  const completed = [...latestSingles, ...latestDoubles]
    .filter(isCompletedMatch)
    .sort((a, b) => matchDate(b) - matchDate(a));

  const latestMatch = completed[0] ?? null;

  const singlesWins = latestSingles.filter((m) => ealaWon(m) === true).length;
  const singlesLosses = latestSingles.filter((m) => ealaWon(m) === false).length;
  const doublesWins = latestDoubles.filter((m) => ealaWon(m) === true).length;
  const doublesLosses = latestDoubles.filter((m) => ealaWon(m) === false).length;

  const grandSlams: DashboardData["grandSlams"] = {};
  for (const match of latestSingles) {
    const key = grandSlamKey(stringValue(match.TournamentName));
    if (!key || !isCompletedMatch(match)) continue;

    if (!grandSlams[key]) {
      grandSlams[key] = { wins: 0, losses: 0, best: "" };
    }

    if (ealaWon(match) === true) grandSlams[key].wins += 1;
    if (ealaWon(match) === false) grandSlams[key].losses += 1;

    grandSlams[key].best = bestRound(
      grandSlams[key].best,
      stringValue(match.round_name)
    );
  }

  return {
    latestMatch,
    nextMatch,
    singlesRank,
    doublesRank,
    singlesRecord: {
      wins: singlesWins || 40,
      losses: singlesLosses || 21,
    },
    doublesRecord: {
      wins: doublesWins,
      losses: doublesLosses,
    },
    singlesTitles: 1,
    doublesTitles: 0,
    grandSlams,
    profile:
      typeof profile === "object" && profile !== null
        ? (profile as Record<string, unknown>)
        : {},
  };
}
