export const dynamic = "force-dynamic";

const PLAYER_ID = 327924;
const RAPIDAPI_HOST = "tennisapi1.p.rapidapi.com";

export async function GET() {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return Response.json(
      { ok: false, error: "RAPIDAPI_KEY is not configured" },
      { status: 500 }
    );
  }

  const url = `https://${RAPIDAPI_HOST}/api/tennis/player/${PLAYER_ID}/events/previous/0`;

  try {
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
      cache: "no-store",
    });

    const body = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          error: "Tennis API request failed",
          status: response.status,
          details: body,
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      playerId: PLAYER_ID,
      data: JSON.parse(body),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "Tennis API connection error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
