export const dynamic = "force-dynamic";

const PLAYER_ID = 330332;
const WTA_API = "https://api.wtatennis.com/tennis/players";

export async function GET() {
  const url = `${WTA_API}/${PLAYER_ID}/matches?page=0&pageSize=50&id=${PLAYER_ID}&year=&type=S&sort=desc&tournamentGroupId=`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const body = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          source: "WTA official API",
          status: response.status,
          details: body,
        },
        { status: 502 }
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return Response.json(
        {
          ok: false,
          source: "WTA official API",
          error: "WTA API returned non-JSON data",
          raw: body,
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      source: "WTA official API",
      playerId: PLAYER_ID,
      endpoint: url,
      data,
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
