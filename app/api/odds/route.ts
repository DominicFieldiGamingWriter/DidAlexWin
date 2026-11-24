import { getUpcomingMatchWinnerOdds } from "../../../lib/odds";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tournament = searchParams.get("tournament")?.trim();
  const opponent = searchParams.get("opponent")?.trim();
  const matchTime = searchParams.get("matchTime")?.trim() || null;
  if (!tournament || !opponent || opponent.length > 160 || tournament.length > 160) {
    return Response.json({ error: "A valid tournament and opponent are required." }, { status: 400 });
  }
  const odds = await getUpcomingMatchWinnerOdds({ tournament, opponent, matchTime });
  return Response.json(odds, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Vercel-CDN-Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
    },
  });
}
