export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return Response.json(
      { ok: false, error: "Supabase environment variables are missing" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/eala_player?select=player_id&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: "no-store",
      }
    );

    const body = await response.text();

    if (!response.ok) {
      return Response.json(
        { ok: false, error: "Supabase request failed", details: body },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      supabase: "connected",
      ealaPlayerRows: JSON.parse(body).length,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "Supabase connection error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
