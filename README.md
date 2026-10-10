# Наран Америк Бараа

АНУ, Канадаас ирсэн оригинал үнэртэй усны цахим дэлгүүр: үйлчлүүлэгчийн вэб, админ
систем, дэлгүүр дээрх кассын (POS) систем — нэг монорепод.

- Дэлгүүр: <https://naranamerikbaraa.mn>
- Админ ба API: <https://api.naranamerikbaraa.mn> (админ нь `/app`)

## Стек

| Давхарга | Технологи |
|---|---|
| Дэлгүүрийн вэб | Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion, Zustand |
| Худалдааны цөм | Medusa v2 — бараа, захиалга, хэрэглэгч, нөөц, урамшуулал |
| Админ ба POS | Medusa admin дээрх өөрийн хуудсууд (React + Vite + @medusajs/ui) |
| Төлбөр | Express + Zod — Botxon/QPay нэхэмжлэх, баталгаажуулалт |
| Өгөгдөл | PostgreSQL 16 · Redis 7 · MeiliSearch · Cloudflare R2 (зураг) |
| Байршуулалт | Docker Compose · Dokploy · Traefik (Let's Encrypt) |

## Бүтэц

```
.
├── web/                    Next.js дэлгүүр (MN/EN)
│   ├── app/[lang]/         хуудсууд: нүүр, дэлгүүр, бараа, сагс, төлбөр, бүртгэл
│   ├── components/         Nav, Footer, ProductCard, SearchBox, …
│   └── lib/                medusa.ts (өгөгдлийн давхарга), store.ts (Zustand), i18n.ts
│
├── medusa-backend/apps/backend/
│   ├── src/api/            admin/ ба store/ маршрутууд + middlewares.ts (эрхийн хяналт)
│   ├── src/admin/routes/   өөрийн админ хуудсууд: POS, тайлан, хямдрал, контент, баг
│   ├── src/lib/            catalog, reports, coupons, rbac, nav, cms, fulfillment …
│   ├── src/subscribers/    и-мэйл, revalidate, эрх олголт, купон тэмдэглэх
│   └── src/scripts/        анхны тохиргоо ба өгөгдөл оруулах скриптүүд
│
├── api/                    Express — зөвхөн төлбөрийн gateway (Botxon/QPay)
└── infra/                  docker-compose (локал ба production)
```

## Локал орчинд ажиллуулах

Дэлгэрэнгүй: [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md).

```bash
npm install
npm run dev          # API :4000, вэб :3000
```

Medusa backend тусдаа асна (`medusa-backend/apps/backend` дотор `npm run dev` → :9000).

## Байршуулалт

**Зөвхөн Dokploy-гийн Redeploy товчоор** байршуулна. Сервер дээр гараар
`docker compose up -d --force-recreate` ажиллуулбал Traefik-ийн чиглүүлэлт
устаж, домэйн 404 өгнө. Дэлгэрэнгүй ба сэргээх заавар:
[docs/DEPLOY.md](docs/DEPLOY.md).

## Баримт бичиг

| Файл | Юуны тухай |
|---|---|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Байршуулалт, орчны хувьсагч, гэмтэл засах |
| [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) | Локал орчин бэлдэх |
| [docs/NARAN-ADMIN-SPEC.md](docs/NARAN-ADMIN-SPEC.md) | Админ системийн шаардлага |
| [docs/NARAN-BRD.md](docs/NARAN-BRD.md) | Бизнесийн шаардлага |
| [docs/PRODUCTION-READINESS-AUDIT.md](docs/PRODUCTION-READINESS-AUDIT.md) | Аудит ба засварын түүх |
| [SECURITY.md](SECURITY.md) | Аюулгүй байдлын зарчим, эмзэг асуудал мэдээлэх |

## Хөгжүүлэхэд баримтлах зүйлс

- **Мөнгийг зөвхөн сервер тооцно.** Үнэ, дүнг хөтчөөс ирсэн утгаар бүү итгэ —
  POS ч, checkout ч серверээс дахин тооцдог.
- **Medusa metadata-г солих нь нэгтгэхгүй, орлуулдаг.** Store болон customer
  metadata бичихдээ үргэлж `lib/store-meta.ts` / `lib/customer-meta.ts`-ээр дамжуул,
  эс бөгөөс өөр функцийн өгөгдлийг устгана.
- **Шинэ админ маршрут бүрд эрхийн хамгаалалт** `src/api/middlewares.ts`-д нэмнэ.
