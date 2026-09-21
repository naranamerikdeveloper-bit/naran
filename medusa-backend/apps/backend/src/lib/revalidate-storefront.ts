import { createHash } from "crypto";

// Tell the Next.js storefront to drop cached data for `tags` right away
// (web/app/api/revalidate), so admin edits show on the site immediately.
//  • "cms"     — homepage content
//  • "catalog" — products / categories
// Best-effort: failures are logged and never break the admin action.

const URL = process.env.STOREFRONT_REVALIDATE_URL || "http://web:3000/api/revalidate";

function token(): string | null {
  const secret = process.env.REVALIDATE_SECRET;
  return secret ? createHash("sha256").update(`naran-revalidate:${secret}`).digest("hex") : null;
}

export async function revalidateStorefront(tags: string[]): Promise<boolean> {
  const t = token();
  if (!t) return false;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-token": t },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`[revalidate] ${tags.join(",")} → HTTP ${res.status}`);
    return res.ok;
  } catch (e: any) {
    console.warn(`[revalidate] ${tags.join(",")} failed: ${e?.message || e}`);
    return false;
  }
}

// Bulk product edits emit many events; coalesce them into one call.
const timers = new Map<string, NodeJS.Timeout>();
export function revalidateStorefrontSoon(tag: string, delayMs = 2000) {
  if (timers.has(tag)) return;
  timers.set(tag, setTimeout(() => {
    timers.delete(tag);
    void revalidateStorefront([tag]);
  }, delayMs));
}
