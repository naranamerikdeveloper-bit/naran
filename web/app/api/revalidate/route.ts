import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createHash, timingSafeEqual } from "crypto";

// On-demand ISR: the Medusa backend calls this right after the admin saves
// homepage content (tag "cms") or changes products (tag "catalog"), so edits
// show on the site immediately instead of after the ISR window.
//
// Auth: header x-revalidate-token = sha256("naran-revalidate:" + REVALIDATE_SECRET).
// Both services derive it from the same secret, so the secret itself never
// travels. This app route takes precedence over the /api/* → gateway rewrite.

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["cms", "catalog"]);

const expected = () => {
  const secret = process.env.REVALIDATE_SECRET;
  return secret ? createHash("sha256").update(`naran-revalidate:${secret}`).digest() : null;
};

export async function POST(req: Request) {
  const want = expected();
  if (!want) return NextResponse.json({ error: "revalidation disabled" }, { status: 503 });

  const token = req.headers.get("x-revalidate-token") || "";
  const got = Buffer.from(token, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tags: string[] = (Array.isArray(body?.tags) ? body.tags : []).filter((t: unknown) => typeof t === "string" && ALLOWED.has(t));
  if (!tags.length) return NextResponse.json({ error: "no valid tags" }, { status: 400 });

  for (const t of tags) revalidateTag(t);
  // The homepage is the CMS consumer; purge its rendered HTML as well.
  if (tags.includes("cms")) revalidatePath("/[lang]", "page");

  return NextResponse.json({ revalidated: tags, at: Date.now() });
}
