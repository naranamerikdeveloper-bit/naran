import { defineMiddlewares, MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { createHash, timingSafeEqual } from "crypto";
import { canActor, Permission } from "../lib/rbac";
import { rateLimit } from "../lib/rate-limit";

// Auth throttles (H9): brute-force / credential-stuffing on login, and spam on
// signup + password-reset. Separate buckets so one endpoint can't exhaust another.
const loginLimit = rateLimit({ name: "auth-login", windowMs: 15 * 60_000, max: 10 });
const registerLimit = rateLimit({ name: "auth-register", windowMs: 60 * 60_000, max: 10 });
const resetLimit = rateLimit({ name: "auth-reset", windowMs: 15 * 60_000, max: 5 });

// RBAC guard (spec A0): enforce a permission on our custom /admin routes based on
// the acting user's role (user.metadata.role). Role-less users are treated as
// super_admin (see lib/rbac) so the existing admin is never locked out.
//
// NOTE on matchers: Medusa's middleware loader runs `String(matcher)` and hands the
// result to Express as a path, so matchers MUST be Express path strings (globs /
// ":param"), never RegExp — a RegExp stringifies to a path that matches nothing.
// The config field is `methods` (plural).
function requirePermission(perm: Permission) {
  return async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const userId = (req as any).auth_context?.actor_id;
    if (!userId) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    try {
      const userModule = req.scope.resolve(Modules.USER);
      const user: any = await userModule.retrieveUser(userId, { select: ["id", "email", "metadata"] as any });
      const role = user?.metadata?.role;
      // canActor enforces deny-by-default for role-less users when
      // SUPER_ADMIN_EMAILS is configured; otherwise keeps the no-lockout default.
      if (!canActor({ role, email: user?.email }, perm)) {
        res.status(403).json({ message: `Эрх хүрэлцэхгүй (${perm})` });
        return;
      }
      next();
    } catch (e) {
      next(e as Error);
    }
  };
}

// Cart completion is internal-only. The region's payment provider is the
// auto-authorizing system default, so a public POST /store/carts/:id/complete
// would turn any cart into an order without paying. Only the payments gateway
// (api), after Botxon confirms the money, may complete a cart: it sends
// x-naran-internal = sha256("naran-internal:" + INTERNAL_API_SECRET).
function internalOnly(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ message: "Not allowed" });
      return;
    }
    return next(); // local dev without the secret
  }
  const want = createHash("sha256").update(`naran-internal:${secret}`).digest();
  const got = Buffer.from(String(req.headers["x-naran-internal"] || ""), "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }
  next();
}

// Core POST /admin/users/:id accepts arbitrary metadata, and roles live in
// user.metadata.role — so any admin could promote themselves, either by setting
// role or by wiping metadata (null / {}), which removes the role entirely. Any
// metadata change (on anyone, including yourself) needs team.manage; name and
// avatar edits stay open.
const guardRoleChange = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const body = req.body as any;
  if (body && typeof body === "object" && "metadata" in body) return requirePermission("team.manage")(req, res, next);
  next();
};

// Admin uploads (product photos, CMS banners): cap the request size and require
// an image-managing role. Core /admin/uploads buffers files in memory with no
// limit and lets any admin upload. Files are served from the R2 bucket's own
// origin, not the admin's, so a stray file can't script the admin.
const UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
async function guardUpload(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const len = Number(req.headers["content-length"] || 0);
  if (!len || len > UPLOAD_MAX_BYTES) {
    res.status(413).json({ message: "Файл хэт том байна (дээд тал нь 30MB)" });
    return;
  }
  const userId = (req as any).auth_context?.actor_id;
  if (!userId) { res.status(401).json({ message: "Not authenticated" }); return; }
  try {
    const user: any = await req.scope.resolve(Modules.USER).retrieveUser(userId, { select: ["id", "email", "metadata"] as any });
    const actor = { role: user?.metadata?.role, email: user?.email };
    if (!canActor(actor, "catalog.write") && !canActor(actor, "content.write")) {
      res.status(403).json({ message: "Эрх хүрэлцэхгүй (catalog.write / content.write)" });
      return;
    }
    next();
  } catch (e) {
    next(e as Error);
  }
}

const guardStoreMetadata = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const body = req.body as any;
  if (body && typeof body === "object" && "metadata" in body) return requirePermission("team.manage")(req, res, next);
  next();
};

export default defineMiddlewares({
  routes: [
    // --- Auth rate limiting (login / register / password reset), both actor types ---
    { matcher: "/auth/:actor/emailpass", methods: ["POST"], middlewares: [loginLimit] },
    { matcher: "/auth/:actor/emailpass/register", methods: ["POST"], middlewares: [registerLimit] },
    { matcher: "/auth/:actor/emailpass/reset-password", methods: ["POST"], middlewares: [resetLimit] },

    { matcher: "/admin/catalog/*", methods: ["GET"], middlewares: [requirePermission("catalog.read")] },
    // CSV import posts the whole file as JSON — the 100KB default rejects real catalogs.
    { matcher: "/admin/catalog/import", methods: ["POST"], bodyParser: { sizeLimit: "10mb" } },
    { matcher: "/admin/catalog/stock", methods: ["POST"], bodyParser: { sizeLimit: "10mb" } },
    { matcher: "/admin/catalog/*", methods: ["POST"], middlewares: [requirePermission("catalog.write")] },
    { matcher: "/admin/analytics/*", methods: ["GET"], middlewares: [requirePermission("analytics.read")] },
    { matcher: "/admin/fulfillment/*", methods: ["GET"], middlewares: [requirePermission("orders.read")] },
    { matcher: "/admin/fulfillment/*", methods: ["POST"], middlewares: [requirePermission("orders.write")] },
    { matcher: "/admin/offline-sale", methods: ["GET"], middlewares: [requirePermission("orders.read")] },
    { matcher: "/admin/offline-sale", methods: ["POST"], middlewares: [requirePermission("orders.write")] },
    { matcher: "/admin/crm/*", methods: ["GET"], middlewares: [requirePermission("customers.read")] },
    { matcher: "/admin/crm/*", methods: ["POST"], middlewares: [requirePermission("customers.write")] },
    { matcher: "/admin/cms/*", methods: ["GET", "POST"], middlewares: [requirePermission("content.write")] },
    { matcher: "/admin/reports/*", methods: ["GET"], middlewares: [requirePermission("reports.read")] },
    { matcher: "/admin/marketing/*", methods: ["GET"], middlewares: [requirePermission("promotions.write")] },
    // Cashiers must be able to check a discount code at the till, so this one
    // POST is gated on the POS permission rather than promotions.write.
    { matcher: "/admin/marketing/validate-code", methods: ["POST"], middlewares: [requirePermission("orders.write")] },
    // Core promotion CRUD (the discount-code screen writes through it).
    { matcher: "/admin/promotions", methods: ["POST"], middlewares: [requirePermission("promotions.write")] },
    { matcher: "/admin/promotions/:id", methods: ["POST", "DELETE"], middlewares: [requirePermission("promotions.write")] },
    { matcher: "/admin/audit", methods: ["GET"], middlewares: [requirePermission("team.manage")] },
    { matcher: "/admin/naran-notifications", methods: ["GET"], middlewares: [requirePermission("orders.read")] },
    { matcher: "/admin/returns/:id/approve", methods: ["POST"], middlewares: [requirePermission("returns.write")] },
    { matcher: "/admin/users/:id/role", methods: ["POST"], middlewares: [requirePermission("team.manage")] },

    // --- Team / access management (core routes) ---
    { matcher: "/admin/users/:id", methods: ["POST"], middlewares: [guardRoleChange] },
    // Store metadata holds the CMS content, delivery option, audit log and stock
    // history — core POST /admin/stores/:id would let any admin overwrite them.
    { matcher: "/admin/stores/:id", methods: ["POST"], middlewares: [guardStoreMetadata] },
    { matcher: "/admin/users/:id", methods: ["DELETE"], middlewares: [requirePermission("team.manage")] },
    { matcher: "/admin/invites", methods: ["POST"], middlewares: [requirePermission("team.manage")] },
    // Not /admin/invites/accept — invited users (no role yet) call that to join.
    { matcher: "/admin/invites/:id/resend", methods: ["POST"], middlewares: [requirePermission("team.manage")] },
    { matcher: "/admin/invites/:id", methods: ["DELETE"], middlewares: [requirePermission("team.manage")] },
    { matcher: "/admin/api-keys", methods: ["POST"], middlewares: [requirePermission("team.manage")] },
    { matcher: "/admin/api-keys/*", methods: ["POST", "DELETE"], middlewares: [requirePermission("team.manage")] },

    // --- Admin file uploads ---
    { matcher: "/admin/uploads", methods: ["POST"], middlewares: [guardUpload] },
    { matcher: "/admin/uploads/presigned-urls", methods: ["POST"], middlewares: [requirePermission("catalog.write")] },
    { matcher: "/admin/uploads/:id", methods: ["DELETE"], middlewares: [requirePermission("catalog.write")] },

    // --- Payment safety: carts become orders only via the payments gateway ---
    { matcher: "/store/carts/:id/complete", methods: ["POST"], middlewares: [internalOnly] },
  ],
});
