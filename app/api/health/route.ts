const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://fsqqngkdwkhkfswgbtyz.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3omtrAoy1lvoch32yhOSxA_WAgotO2T";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/eala_stats?player_id=eq.330332&select=updated_at&limit=1`,
      {
        headers: { apikey: SUPABASE_KEY },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    const rows = (await response.json()) as Array<{ updated_at?: string | null }>;
    const lastSyncedAt = rows[0]?.updated_at ?? null;
    const parsedSyncTime = lastSyncedAt ? Date.parse(lastSyncedAt) : Number.NaN;
    const syncAgeMinutes = Number.isFinite(parsedSyncTime)
      ? Math.max(0, Math.round((Date.now() - parsedSyncTime) / 60_000))
      : null;

    // Alex’s sync interval is intentionally adaptive (15 minutes during match
    // windows, 1 hour around events, up to 12 hours while idle). This endpoint
    // measures service and database availability, not a fixed freshness SLA.
    // /api/watchdog reports timestamps and match lifecycle for freshness checks.
    return Response.json(
      {
        ok: true,
        service: "healthy",
        database: "reachable",
        lastSyncedAt,
        syncAgeMinutes,
        syncCadence: "adaptive",
        syncFreshness: lastSyncedAt ? "timestamp_available" : "unknown",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "unhealthy",
        database: "unreachable",
        error: error instanceof Error ? error.message : "Health check failed",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}
