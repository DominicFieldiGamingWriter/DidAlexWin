import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

export const runtime = "nodejs";

function matchesSecret(candidate: string, expected: string) {
  const provided = Buffer.from(candidate);
  const known = Buffer.from(expected);
  return provided.length === known.length && timingSafeEqual(provided, known);
}

export async function POST(request: Request) {
  const expected = process.env.ALEX_REVALIDATE_SECRET;
  if (!expected) return Response.json({ error: "Revalidation is not configured." }, { status: 500 });
  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!matchesSecret(candidate, expected)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  revalidateTag("eala-dashboard");
  revalidatePath("/");
  return Response.json({ revalidated: true });
}
