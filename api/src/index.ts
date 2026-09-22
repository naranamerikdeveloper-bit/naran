import "dotenv/config";
import "./instrument.js"; // Sentry.init — must run before other imports
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import productsRouter from "./routes/products.js";
import authRouter from "./routes/auth.js";
import paymentsRouter, { botxonWebhook } from "./routes/payments.js";
import { rateLimit } from "./lib/rate-limit.js";

const IS_PROD = process.env.NODE_ENV === "production";

// B1 — never run mock payments in production. Botxon (the active QPay gateway)
// auto-"pays" invoices in mock mode without a key, so a live store would take
// orders while collecting no money. Refuse to boot instead of failing silently.
if (IS_PROD && !process.env.BOTXON_GATEWAY_KEY) {
  throw new Error("BOTXON_GATEWAY_KEY is required in production — refusing to start in mock payment mode.");
}

const app = express();
const PORT = +(process.env.PORT || 4000);

// Fail closed on CORS in production: a missing WEB_ORIGIN must not reflect every
// origin with credentials (M14). Dev keeps the permissive default for convenience.
const webOrigins = process.env.WEB_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean);
if (IS_PROD && (!webOrigins || webOrigins.length === 0)) {
  throw new Error("WEB_ORIGIN is required in production (allowed CORS origins).");
}
app.use(cors({ origin: webOrigins && webOrigins.length ? webOrigins : true, credentials: true }));

// Security response headers (nosniff, no-referrer-when-downgrade, HSTS in prod,
// frameguard, etc.). CSP + COEP are disabled here: this service returns JSON
// only, and those directives are enforced on the storefront (next.config) where
// HTML is served.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Payment webhooks need the RAW body for signature verification — mount BEFORE json.
app.post("/api/webhooks/botxon", express.raw({ type: "*/*" }), botxonWebhook);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "nitec-api" }));
app.use("/api/products", productsRouter);
// Legacy in-memory /api/auth is only used by the storefront fallback
// (NEXT_PUBLIC_USE_MEDUSA=0); production authenticates through Medusa, so this
// dormant, non-persistent endpoint is dead surface in prod. Mount it only in dev
// (or when explicitly re-enabled) to shrink the attack surface. Rate-limited (H9).
if (!IS_PROD || process.env.ENABLE_LEGACY_AUTH === "1") {
  app.use("/api/auth", rateLimit({ name: "api-auth", windowMs: 15 * 60_000, max: 20 }), authRouter);
} else {
  console.log("[api] legacy /api/auth disabled in production (set ENABLE_LEGACY_AUTH=1 to re-enable)");
}
// Legacy in-memory /api/orders removed (H10): it was unauthenticated (leaked all
// orders / any order by email) and unused — real orders live in Medusa.
// NOTE: payment-intent CREATION is rate-limited inside the router (POST /intent);
// the status poll (GET /intent) is intentionally not, since the processing page
// polls it frequently while waiting for payment.
app.use("/api/payments", paymentsRouter);

// Report errors to Sentry (no-op if SENTRY_DSN unset) before our JSON handler.
if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log the full error server-side, but never leak internal details (stack, DB
  // errors, file paths) to clients in production — return a generic message.
  console.error(err);
  res.status(500).json({ error: IS_PROD ? "Server error" : (err.message || "Server error") });
});

const server = app.listen(PORT, () => {
  console.log(`> Nitec API ready on http://localhost:${PORT}`);
});

// Graceful shutdown: stop accepting connections and let in-flight requests finish
// before exit (clean redeploys — no dropped requests). Force-exit after 10s.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`${sig} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
