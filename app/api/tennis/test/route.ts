export const dynamic = "force-dynamic";

const PLAYER_ID = 330332;
const BASE = "https://api.wtatennis.com/tennis";

async function getJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    data = body;
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

export async function GET() {
  try {
    const [singlesMatches, doublesMatches, singlesRankings, doublesRankings, singaporeMatches] =
      await Promise.all([
        getJson(
          `${BASE}/players/${PLAYER_ID}/matches?page=0&pageSize=50&id=${PLAYER_ID}&year=&type=S&sort=desc&tournamentGroupId=`
        ),
        getJson(
          `${BASE}/players/${PLAYER_ID}/matches?page=0&pageSize=50&id=${PLAYER_ID}&year=&type=D&sort=desc&tournamentGroupId=`
        ),
        getJson(
          `${BASE}/players/ranked?type=rankSingles&metric=singles&page=0&pageSize=100`
        ),
        getJson(
          `${BASE}/players/ranked?type=rankDoubles&metric=doubles&page=0&pageSize=100`
        ),
        getJson(
          `${BASE}/tournaments/1152/2026/matches`
        ),
      ]);

    return Response.json({
      ok: true,
      source: "WTA official API",
      playerId: PLAYER_ID,
      singlesMatches,
      doublesMatches,
      singlesRankings,
      doublesRankings,
      singaporeMatches,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        source: "WTA official API",
        error: "WTA API connection error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
