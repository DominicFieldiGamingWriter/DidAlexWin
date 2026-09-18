export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
    supabaseSecretConfigured: Boolean(process.env.SUPABASE_SECRET_KEY),
    rapidApiKeyConfigured: Boolean(process.env.RAPIDAPI_KEY),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  });
}
