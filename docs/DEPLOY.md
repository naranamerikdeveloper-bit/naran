# NARAN — Production deploy (нэг VPS + Dokploy)

Энэ заавар нь бүх стекийг (**Postgres, Redis, MeiliSearch, Medusa, Express API,
Next.js storefront**) нэг VPS дээр **Dokploy**-оор байршуулах алхмуудыг тайлбарлана.
Ойролцоо зардал: **VPS ~₮30,000–50,000/сар** (Hetzner CX22 / Contabo VPS S).

> ⚠️ **Нууц түлхүүр**: QPay, R2, DB нууц үг зэргийг **зөвхөн VPS дээр** (Dokploy env
> эсвэл `infra/.env`) оруулна. Git-д хэзээ ч commit хийхгүй (`infra/.env` gitignore-д).

---

## 0. Урьдчилсан нөхцөл

| Зүйл | Тайлбар |
|---|---|
| VPS | Ubuntu 22.04+, 2 vCPU / 4GB RAM доод тал (10k бараа + Meili-д тохиромжтой) |
| Домэйн | `naran.mn` (+ `api.naran.mn`, `admin.naran.mn` дэд домэйн) |
| Cloudflare | DNS (заавал биш ч санал болгоно) + R2 (зургийн хадгалалт, сонголтоор) |

---

## 1. VPS + Dokploy суулгах

VPS дээр (root):
```bash
curl -sSL https://dokploy.com/install.sh | sh
```
Дуусмагц `http://<VPS-IP>:3000` дээр Dokploy admin нээгдэнэ. Эхний хэрэглэгчээ үүсгэ.

---

## 2. DNS тохируулах

Домэйн бүрийг VPS-ийн IP рүү заа (A record):

| Хост | Төрөл | Утга |
|---|---|---|
| `naran.mn` | A | `<VPS-IP>` |
| `www` | A | `<VPS-IP>` |
| `api` | A | `<VPS-IP>` |
| `admin` | A | `<VPS-IP>` |

(Cloudflare ашиглаж байвал эхлээд proxy-г **DNS only** болго; TLS-г Dokploy Let's Encrypt-ээр авна.)

---

## 3. Dokploy дээр Compose апп үүсгэх

1. Dokploy → **Create Application → Docker Compose**.
2. **Source**: энэ Git repo, branch `main`.
3. **Compose path**: `infra/docker-compose.prod.yml`.
4. **Environment**: `infra/.env.prod.example`-г хуулж бүх утгыг бөглө
   (доорх [4-р хэсэг](#4-env-утгууд)). Dokploy-ийн Environment талбарт буулга.
5. **Domains** (Dokploy UI → Domains, сервис бүрд):
   | Сервис | Домэйн | Порт | TLS |
   |---|---|---|---|
   | `web` | `naran.mn`, `www.naran.mn` | 3000 | Let's Encrypt |
   | `medusa` | `api.naran.mn` | 9000 | Let's Encrypt |
   | `api` | (заавал биш; web дотроосоо `/api/*` proxy-лдог) | 4000 | — |

   Medusa admin панель нь `https://api.naran.mn/app` дээр гарна.

---

## 4. ENV утгууд

`infra/.env.prod.example` доторх бүх түлхүүрийг бөглө. Нууцуудыг үүсгэх:
```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 32   # COOKIE_SECRET
openssl rand -base64 32   # MEILISEARCH_API_KEY
```
Анхаарах:
- **`NEXT_PUBLIC_MEDUSA_URL`** = `https://api.naran.mn` (хөтөч хандах **нийтийн** URL).
- **`NEXT_PUBLIC_MEDUSA_PK` / `NEXT_PUBLIC_MEDUSA_REGION`** — DB seed хийсний **дараа**
  авна ([6-р хэсэг](#6-эхний-seed)), дараа нь web-ийг дахин build хийнэ.
- **CORS** утгуудад бодит домэйнуудаа оруул.
- QPay production түлхүүр байхгүй бол `WIRE_MODE=mock` үлдээ.
- **`STOREFRONT_URL`** (Medusa backend) = `https://naran.mn` — нууц үг сэргээх имэйл
  дэх холбоос энэ домэйн рүү заана. Тохируулаагүй бол `http://localhost:3000` руу
  заана (зөвхөн локалд ажиллана).
- **`RESEND_API_KEY`** + **`EMAIL_FROM`** (Medusa backend) — нууц үг сэргээх болон
  хүргэлтийн имэйлийг бодитоор илгээхэд шаардлагатай. Байхгүй бол имэйл mock болж
  (лог руу бичнэ), урсгал таслагдахгүй.

---

## 4b. Managed Postgres (Neon) — САНАЛ БОЛГОСОН (жинхэнэ бизнест)

Өгөгдлийн санг тусдаа managed үйлчилгээнд (автомат backup + PITR) байршуулбал
"мэдээлэл алдах" эрсдэл бүрэн арилна. Ингэхдээ **`infra/docker-compose.managed-db.yml`**
compose-ыг ашиглана (on-box postgres-гүй).

1. **Neon** (https://neon.tech) → бүртгэл → **Create Project**
   - Region: app сервертэйгээ **ойрхон** (Hetzner Герман → `Frankfurt`; Ази VPS → `Singapore`).
   - Postgres хувилбар: 16+.
2. **Connection string** хуулж ав (Dashboard → Connection Details → "Connection string").
   `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
   формтой — **`?sslmode=require` заавал** байх ёстой.
3. `infra/.env`-д тавь:
   ```
   DATABASE_URL=postgresql://…?sslmode=require
   ```
   (`POSTGRES_*` гурвыг хоосон орхи — managed compose тэдгээрийг ашиглахгүй.)
4. Dokploy-ийн Compose app-ийн **Compose path**-ыг `infra/docker-compose.managed-db.yml`
   болго. Migration яг л адилхан medusa эхлэхэд автоматаар ажиллана.
5. Backup: Neon өөрөө автомат хийнэ — VPS дээрх `backup.sh` **Meili-д** л хэрэгтэй.

> On-box postgres (хямд, ₮18k) ашиглах бол энэ хэсгийг алгасаад `docker-compose.prod.yml`-ыг
> хэрэглэ. Дараа managed руу шилжихэд зөвхөн `DATABASE_URL` + compose path солино.

---

## 5. Эхний deploy

Dokploy → **Deploy**. Build дуусаад:
- `postgres`, `redis`, `meilisearch` — эрүүл болно (healthcheck-тэй).
- `medusa-migrate` — **migration-ийг нэг удаа** ажиллуулаад гарна (one-shot, H8).
- `medusa`, `medusa-worker` — migration дуусмагц эхэлнэ (`db:migrate` server start-д ажиллахгүй тул replica-д аюулгүй).
- `web`, `api` — асна (healthcheck-тэй; Traefik бэлэн болсон хойно routing хийнэ).

---

## 6. Эхний seed

Medusa контейнерийн терминал руу ор (Dokploy → medusa → **Terminal**, эсвэл
`docker exec -it <medusa-container> sh`). Seed script-уудыг төслийн үндсэн
директороос ажиллуул (`cd /app` — эндээс `medusa exec` эх кодыг шууд ажиллуулна):

```bash
# 1) Суурь бүсчлэл + Монгол (MNT) бүс, хүргэлт
npx medusa exec ./src/scripts/seed-region.ts
npx medusa exec ./src/scripts/seed-mnt.ts
# 2) Гоо сайхны ангилал → БАРАА (эрэмбэ чухал: ангилал эхэлнэ)
npx medusa exec ./src/scripts/seed-categories.ts
npx medusa exec ./src/scripts/seed-naran.ts          # 16 demo бараа
# 3) Купон + буцаалтын хүргэлт
npx medusa exec ./src/scripts/seed-promotions.ts
npx medusa exec ./src/scripts/seed-return-shipping.ts
# 4) Admin хэрэглэгч
npx medusa user -e admin@naran.mn -p '<STRONG_PASSWORD>'
```

**Бодит 10,000 бараа** оруулах (CSV):
```bash
IMPORT_FILE=./data/catalog.csv npx medusa exec ./src/scripts/import-products.ts
```
(CSV багана: `handle,title,price,category,sizes,image,description` — `category` нь
`fragrance/skincare/...` эсвэл монгол нэр аль нь ч болно.)

### PK + Region авах
Postgres-оос шууд унш (postgres контейнер дотор):
```bash
psql -U naran -d naran -c "SELECT token FROM api_key WHERE type='publishable';"
psql -U naran -d naran -c "SELECT id FROM region WHERE currency_code='mnt';"
```
Эсвэл Medusa admin (`https://api.naran.mn/app`) → **Settings → Publishable API Keys**
болон **Regions** хэсгээс хараарай.

Гарсан `pk_...` ба `reg_...`-г `infra/.env`-ийн `NEXT_PUBLIC_MEDUSA_PK` /
`NEXT_PUBLIC_MEDUSA_REGION`-д оруулаад **web-ийг дахин deploy** (rebuild) хий
(NEXT_PUBLIC нь build-д шингэдэг).

---

## 7. MeiliSearch индекс

Автоматаар — плагины `meilisearch-products-index` job Medusa ачаалагдсаны дараа
бүтэн sync хийж, бараа өөрчлөгдөх бүрд шинэчилнэ. Гараар шалгах:
```bash
curl -s -X POST http://meilisearch:7700/indexes/products/search \
  -H "Authorization: Bearer $MEILISEARCH_API_KEY" -H 'content-type: application/json' \
  -d '{"q":"serum"}'
```

---

## 8. Зураг → Cloudflare R2 (сонголтоор)

1. Cloudflare → R2 → bucket үүсгэ (`naran-media`), API token авах.
2. `infra/.env`-д `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY`, `S3_FILE_URL` (нийтийн CDN URL) бөглө → medusa redeploy.
3. Одоо байгаа зургийг R2 руу зөөх:
   ```bash
   npx medusa exec ./src/scripts/upload-images-to-r2.ts
   ```

---

## 9. Ажиллагаа (Ops)

- **Backup / restore** (NFR-05): `infra/backup/backup.sh` — cron-оор (жишээ 15 мин
  тутам) pg_dump→gzip→retention→(сонголтоор R2 upload). Сэргээх:
  `infra/backup/restore.sh <файл>`. Улирал бүр сэргээлтийг staging дээр тест хий.
  ```bash
  */15 * * * * /opt/naran/infra/backup/backup.sh >> /var/log/naran-backup.log 2>&1
  ```
  Meili (`meilidata`) болон R2/зураг мөн backup-д хамруул.
- **Ачааллын тест** (NFR-06): `k6 run infra/load/k6-storefront.js` (BASE_URL,
  MEDUSA_URL, MEDUSA_PK, REGION env-тэй; `-e PEAK=5000` хүртэл өсгө). Нээлтийн
  өмнө staging дээр ажиллуулж p95<800ms, алдаа<1% хангаж буйг шалга.
- **Шинэчлэлт**: Git-д push → Dokploy → Redeploy. Migration нь `medusa-migrate`
  one-shot контейнерт нэг удаа ажиллана (server/worker хүлээгээд эхэлнэ).

> 🚨 **ЗААВАЛ Dokploy-ээр deploy хий — гараар `docker compose` бү ажиллуул.**
> Домэйний routing (`api.naranamerikbaraa.mn` → medusa)-ийг Traefik нь **контейнерийн
> label**-аар олдог. Эдгээр label-ыг **Dokploy deploy үедээ өөрөө нэмдэг** бөгөөд
> git доторх `docker-compose.prod.yml`-д байдаггүй. Тиймээс сервер дээр гараар
> `docker compose ... up -d --force-recreate medusa` гэх мэт ажиллуулбал label
> арчигдаж, `api.naranamerikbaraa.mn` **404** болно (сайт бараагаа татахгүй,
> нэвтрэлт унтарна — өгөгдөл БУС, зөвхөн "хаалга" хаагдана).
>
> **Код шинэчлэх** (backend/admin/web бүгд): Dokploy UI → `naran-stack` → **Redeploy**.
> Энэ нь git-ээс дахин build хийж, routing label-ыг зөв сэргээнэ.
>
> **Хэрэв routing гэнэт унтарвал** (гараар compose ажиллуулсны дараа): Dokploy →
> **Redeploy** дарахад л засагдана. Шалгах:
> ```bash
> curl -s -o /dev/null -w "%{http_code}\n" https://api.naranamerikbaraa.mn/app   # 200 байх ёстой
> docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/routers | grep -o api.naranamerikbaraa.mn   # router бүртгэгдсэн эсэх
> ```
- **Лог**: Dokploy → сервис → Logs.
- **Хэмжээ / server-worker split**: compose нь Medusa-г **хоёр контейнер**-аар
  ажиллуулна — `medusa` (HTTP, `MEDUSA_WORKER_MODE=server`) + `medusa-worker`
  (арын ажил: Meili индекс, имэйл, scheduled job — `MEDUSA_WORKER_MODE=worker`).
  Production-д (`NODE_ENV=production` + `REDIS_URL`) event bus, workflow engine,
  cache нь **Redis**-ээр ажиллаж, хоёр контейнер event/job хуваалцана. Локал
  dev-д (development) in-memory хэвээр — Redis шаардахгүй. Ачаалал ихсвэл `medusa`
  контейнерийг олшруулж (replica) Traefik-ээр балансал, эсвэл VPS-ээ өсгө —
  migration нь тусдаа one-shot тул replica-ууд зэрэг migrate хийхгүй (H8).

---

## 10. Admin back-office (deploy-ийн дараа)

Эхний admin (`admin@naran.mn`) нь **дүргүй** тул автоматаар бүх эрхтэй (super_admin) —
тусад нь тохируулах шаардлагагүй. Багаа нэмэхдээ:

1. **Ажилтан үүсгэх**: `npx medusa user -e ajiltan@naran.mn -p '<PW>'` (medusa контейнер дотор),
   эсвэл admin → Settings → Users → Invite.
2. **Дүр оноох**: admin → **Баг ба эрх** → ажилтан бүрд дүр сонго
   (Захиалга боловсруулагч / Каталог менежер / Маркетер / Дэмжлэг / Тайлан харагч).
   Тухайн дүрийн эрхгүй хэсэг тэдэнд 403 буцаана (custom `/admin/*` route бүрд enforce).
3. **Нүүр хуудасны контент**: admin → **Контент** → hero слайд + промо баннерыг MN/EN-ээр
   бөглөж хадгал (хоосон бол storefront өгөгдмөл хувилбарыг харуулна). Storefront нь
   `GET /store/cms/homepage`-аас уншина (revalidate 120с).
4. **Тайлан/аудит**: **Тайлан** (борлуулалт + НӨАТ + CSV), **Аудит лог** (чухал үйлдэл),
   **Мэдэгдэл** (бага нөөц / буцаалт / шинэ захиалга).

> Эдгээр нь бүгд Medusa image дотор (`medusa build` → admin bundle) шингэдэг тул нэмэлт
> сервис/migration/env шаардахгүй — ердийн redeploy-оор шинэчлэгдэнэ.

---

## Архитектур

```
                 ┌────────── Dokploy / Traefik (TLS) ──────────┐
 naran.mn ──────▶│  web (Next.js :3000, standalone)            │
 api.naran.mn ──▶│  medusa (:9000)  ──┐                        │
                 └────────────────────┼────────────────────────┘
                        internal "naran" network
        ┌───────────────┼───────────────┬──────────────┐
   postgres:5432    redis:6379     meilisearch:7700   api:4000 (Wire/QPay)
```
Storefront нь **зөвхөн API-аар** Medusa-той харилцна (`web/lib/medusa.ts`); хайлт нь
backend-аар дамжин Meili рүү ордог тул хайлтын түлхүүр хөтөчид задрахгүй.
