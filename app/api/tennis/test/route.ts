export const dynamic = "force-dynamic";

const PLAYER_ID = 327924;
const RAPIDAPI_HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;

async function getJson(path: string) {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is not configured");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
    cache: "no-store",
  });

  const body = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(body);
  } catch {
    data = body;
  }

  if (!response.ok) {
    throw new Error(
      `${path} returned ${response.status}: ${body.slice(0, 1000)}`
    );
  }

  return data;
}

export async function GET() {
  try {
    const [profile, pastMatches, upcoming] = await Promise.all([
      getJson(
        `/tennis/v2/wta/player/profile/${PLAYER_ID}?include=form,ranking,country`
      ),
      getJson(
        `/tennis/v2/wta/player/past-matches/${PLAYER_ID}?pageNo=1&pageSize=5&include=round,tournament.court,tournament.rank,stat`
      ),
      getJson(
        `/tennis/v2/wta/fixtures/player/${PLAYER_ID}?pageNo=1&pageSize=10&include=round,tournament.court,tournament.rank,h2h,odds&filter=PlayerGroup:both`
      ),
    ]);

    return Response.json({
      ok: true,
      playerId: PLAYER_ID,
      source: RAPIDAPI_HOST,
      profile,
      pastMatches,
      upcoming,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
