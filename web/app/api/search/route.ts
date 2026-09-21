import { NextResponse } from "next/server";
import { medusa } from "@/lib/medusa";

// Header live-search suggestions. Runs server-side so the browser gets a slim
// payload (no full product objects) and never needs cross-origin access to
// Medusa. This app route takes precedence over the /api/* → gateway rewrite.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ items: [], total: 0 });
  try {
    const { items, total } = await medusa.suggest(q);
    return NextResponse.json({
      total,
      items: items.map(p => ({ id: p.id, slug: p.slug, name: p.name, image: p.image, price: p.price, sub: p.fabric || p.brand || "" })),
    }, { headers: { "cache-control": "public, max-age=30" } });
  } catch {
    return NextResponse.json({ items: [], total: 0 }, { status: 502 });
  }
}
