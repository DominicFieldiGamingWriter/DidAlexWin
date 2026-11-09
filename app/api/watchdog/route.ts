const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://fsqqngkdwkhkfswgbtyz.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3omtrAoy1lvoch32yhOSxA_WAgotO2T";

const EALA_ID = 330332;

type Match = {
  source: string;
  source_match_id: string;
  category: "singles" | "doubles";
  state: "event_only" | "scheduled" | "confirmed" | "completed" | "cancelled";
  tournament_name: string | null;
  round_name: string | null;
  scheduled_at: string | null;
  played_at: string | null;
  opponent_name: string | null;
  eala_won: boolean | null;
  score: string | null;
  updated_at: string;
  raw_json: Record<string, unknown> | null;
};

async function fetchMatches(): Promise<Match[]> {
  const params = new URLSearchParams({
    player_id: "eq." + EALA_ID,
    select: "source,source_match_id,category,state,tournament_name,round_name,scheduled_at,played_at,opponent_name,eala_won,score,updated_at,raw_json",
    limit: "1000"
  });
  const response = await fetch(SUPABASE_URL + "/rest/v1/eala_canonical_matches?" + params.toString(), {
    headers: { apikey: SUPABASE_KEY },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Supabase canonical matches returned HTTP " + response.status);
  return response.json();
}

function compactMatch(match: Match | null) {
  if (!match) return null;
  return {
    source: match.source,
    sourceMatchId: match.source_match_id,
    category: match.category,
    state: match.state,
    tournament: match.tournament_name,
    round: match.round_name,
    scheduledAt: match.scheduled_at,
    playedAt: match.played_at,
    opponent: match.opponent_name,
    ealaWon: match.eala_won,
    score: match.score,
    canonicalRole: match.raw_json?.canonical_role ?? null,
    updatedAt: match.updated_at
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await fetchMatches();
    const completedSingles = matches
      .filter(match => match.category === "singles" && match.state === "completed" && match.eala_won !== null)
      .sort((a, b) => Date.parse(b.played_at ?? b.scheduled_at ?? "") - Date.parse(a.played_at ?? a.scheduled_at ?? ""));
    const pending = matches
      .filter(match => match.category === "singles" && ["event_only", "scheduled", "confirmed"].includes(match.state))
      .sort((a, b) => {
        const aTime = Date.parse(a.scheduled_at ?? "");
        const bTime = Date.parse(b.scheduled_at ?? "");
        return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) -
          (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER);
      });
    const lastSyncedAt = matches.reduce<string | null>((latest, match) =>
      !latest || match.updated_at > latest ? match.updated_at : latest, null);
    const nextFixture = pending.find(match => match.raw_json?.canonical_role === "next_fixture") ?? null;
    const eventCandidate = pending[0] ?? null;
    const latestMatch = completedSingles[0] ?? null;

    const latestUpdatedMs = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
    const dataAgeMinutes = Number.isFinite(latestUpdatedMs)
      ? Math.round((Date.now() - latestUpdatedMs) / 60000)
      : null;

    return Response.json({
      ok: matches.length > 0 && Boolean(latestMatch),
      sport: "tennis",
      player: "Alexandra Eala",
      lastSyncedAt,
      dataAgeMinutes,
      matchCount: matches.length,
      completedSinglesCount: completedSingles.length,
      latestMatch: compactMatch(latestMatch),
      nextFixture: compactMatch(nextFixture),
      nextEventCandidate: compactMatch(eventCandidate),
      pendingSinglesCount: pending.length
    }, {
      status: matches.length > 0 && latestMatch ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Tennis data health check failed"
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  }
}
