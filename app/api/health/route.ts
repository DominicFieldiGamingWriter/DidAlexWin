const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://fsqqngkdwkhkfswgbtyz.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3omtrAoy1lvoch32yhOSxA_WAgotO2T";

const MAX_AGE_MS = 30 * 60 * 1000;

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
    const ageMs = lastSyncedAt ? Date.now() - Date.parse(lastSyncedAt) : Infinity;
    const stale = !lastSyncedAt || Number.isNaN(ageMs) || ageMs > MAX_AGE_MS;

    return Response.json(
      {
        ok: !stale,
        lastSyncedAt,
        stale,
      },
      {
        status: stale ? 503 : 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Health check failed",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
