import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'
import { execSync } from 'node:child_process'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Synchronous, short TCP reachability probe (config load is sync, so this spawns
// a tiny node child that connects with a timeout). Used to skip optional infra
// whose plugin/module would otherwise throw at boot when the service is down.
function reachable(url: string, timeoutMs = 1200): boolean {
  try {
    const u = new URL(url)
    const port = u.port || (u.protocol === 'https:' ? '443' : '80')
    execSync(
      `node -e "const s=require('net').connect(${port},'${u.hostname}',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(${timeoutMs},()=>{s.destroy();process.exit(1)})"`,
      { stdio: 'ignore', timeout: timeoutMs + 2000 },
    )
    return true
  } catch {
    return false
  }
}

// --- Optional infra, gated on env so local dev boots without these services ---
// MeiliSearch (typo-tolerant, faceted product search — scales to 10k+).
const MEILI_HOST = process.env.MEILISEARCH_HOST
const MEILI_KEY = process.env.MEILISEARCH_API_KEY
// Cloudflare R2 (S3-compatible object storage for product images).
const R2_ENDPOINT = process.env.S3_ENDPOINT
const R2_BUCKET = process.env.S3_BUCKET

// Product → MeiliSearch index document. Flattens categories so the storefront
// can search by category name and facet-filter by category handle inside Meili.
const productTransformer = (product: any) => ({
  id: product.id,
  handle: product.handle,
  title: product.title,
  description: product.description,
  thumbnail: product.thumbnail,
  category_handles: (product.categories || []).map((c: any) => c.handle).filter(Boolean),
  category_names: (product.categories || []).map((c: any) => c.name).filter(Boolean),
})

// Register MeiliSearch only when it's actually reachable — if MEILISEARCH_HOST is
// set but the service is down, the plugin's loader throws and takes the whole
// Medusa boot down with it. Probing here lets Medusa (and the admin) start
// regardless; search is simply unavailable until Meili is back and Medusa
// restarts.
const plugins: any[] = []
const meiliUp = !!MEILI_HOST && reachable(MEILI_HOST)
if (MEILI_HOST && !meiliUp) {
  console.warn(`[medusa-config] MeiliSearch (${MEILI_HOST}) unreachable — search plugin disabled so Medusa can still boot.`)
}
if (meiliUp) {
  plugins.push({
    resolve: '@rokmohar/medusa-plugin-meilisearch',
    options: {
      config: { host: MEILI_HOST, apiKey: MEILI_KEY ?? '' },
      settings: {
        products: {
          type: 'products',
          enabled: true,
          fields: ['id', 'title', 'description', 'handle', 'thumbnail', 'categories.id', 'categories.name', 'categories.handle'],
          indexSettings: {
            searchableAttributes: ['title', 'description', 'category_names'],
            displayedAttributes: ['id', 'handle', 'title', 'thumbnail', 'category_handles', 'category_names'],
            filterableAttributes: ['category_handles'],
          },
          primaryKey: 'id',
          transformer: productTransformer,
        },
      },
    },
  })
}

// File storage: default local provider unless R2/S3 env is configured (VPS/prod).
const modules: any[] = []
if (R2_ENDPOINT && R2_BUCKET) {
  modules.push({
    resolve: '@medusajs/medusa/file',
    options: {
      providers: [
        {
          resolve: '@medusajs/file-s3',
          id: 's3',
          options: {
            file_url: process.env.S3_FILE_URL,      // public CDN/base URL for objects
            endpoint: R2_ENDPOINT,                  // https://<account>.r2.cloudflarestorage.com
            bucket: R2_BUCKET,
            access_key_id: process.env.S3_ACCESS_KEY_ID,
            secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
            region: process.env.S3_REGION || 'auto', // R2 uses "auto"
            // R2 requires path-style addressing.
            additional_client_config: { forcePathStyle: true },
          },
        },
      ],
    },
  })
}

// Redis-backed infra for the server/worker split (production only). Locally
// (NODE_ENV !== production) Medusa uses its in-memory event bus + workflow
// engine, so dev boots without Redis even if REDIS_URL is set in .env.
const REDIS_URL = process.env.REDIS_URL
const useRedis = process.env.NODE_ENV === 'production' && !!REDIS_URL
if (useRedis) {
  // Infrastructure modules MUST carry their module `key` so Medusa knows which
  // built-in (in-memory) slot they replace — without it boot fails with
  // "Module … doesn't have a serviceName. Please provide a 'key' …".
  modules.push(
    { key: Modules.EVENT_BUS, resolve: '@medusajs/event-bus-redis', options: { redisUrl: REDIS_URL } },
    { key: Modules.WORKFLOW_ENGINE, resolve: '@medusajs/workflow-engine-redis', options: { redis: { url: REDIS_URL } } },
    { key: Modules.CACHE, resolve: '@medusajs/cache-redis', options: { redisUrl: REDIS_URL, ttl: 30 } },
  )
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Medusa 2.17 shares ONE Postgres pool across all modules per process
    // (verified in production: the server held exactly DB_POOL_MAX
    // connections). 3 was far too few — concurrent checkouts would queue and
    // time out. 15 per process × server/worker/migrate stays far below the
    // compose max_connections=300.
    databaseDriverOptions: {
      pool: {
        min: Number(process.env.DB_POOL_MIN ?? 0),
        max: Number(process.env.DB_POOL_MAX ?? 15),
      },
    },
    redisUrl: useRedis ? REDIS_URL : undefined,
    // shared (default) | server (HTTP only) | worker (background jobs only).
    // For a large store: one `server` + one `worker` container sharing Redis.
    workerMode: (process.env.MEDUSA_WORKER_MODE as 'shared' | 'server' | 'worker') || 'shared',
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  plugins,
  modules,
})
