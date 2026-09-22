import { assertDestructiveAllowed } from "../lib/destructive-guard";
import { ExecArgs } from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { MN_TO_HANDLE } from "./seed-categories";

// Relative path — resolved against the storefront's own origin (port-independent).
// Files live in web/public/products/*. In production these move to Cloudflare R2 (F5).
const IMG = (n: number) => `/products/p${n}.avif`;

type Seed = {
  title: string; handle: string; price: number; cat: string;
  sizes: string[]; img: number; desc: string;
};

// «Наран Америк бараа» — гоо сайхны каталог. Үнэ шууд төгрөгөөр (mnt).
const CATALOG: Seed[] = [
  // Үнэртэй ус (Fragrance)
  { title: "NARAN Eau de Parfum Bloom", handle: "edp-bloom", price: 129000, cat: "Үнэртэй ус", sizes: ["50ml", "100ml"], img: 1, desc: "Цэцгэн аялгуутай, дунд зэргийн тогтвортой парфюм. Сарнай, жасмин, мускийн нэгдэл." },
  { title: "NARAN Eau de Parfum Signature", handle: "edp-signature", price: 139000, cat: "Үнэртэй ус", sizes: ["50ml", "100ml"], img: 2, desc: "Наран брэндийн онцлох үнэр — модлог, дулаан амбер аяс бүхий эрэгтэй/эмэгтэй унисекс парфюм." },
  { title: "NARAN Rose Elixir Parfum", handle: "rose-elixir", price: 149000, cat: "Үнэртэй ус", sizes: ["50ml"], img: 1, desc: "Дамаск сарнайн ханд бүхий тансаг эмэгтэй парфюм. Урт хугацаанд тогтвортой." },
  { title: "NARAN Citrus Fresh Cologne", handle: "citrus-cologne", price: 99000, cat: "Үнэртэй ус", sizes: ["100ml"], img: 2, desc: "Нимбэг, бергамотын сэргэг үнэртэй хөнгөн одеколон. Өдөр тутмын хэрэглээнд." },

  // Арьс арчилгаа (Skincare)
  { title: "NARAN Glow Serum", handle: "glow-serum", price: 89000, cat: "Арьс арчилгаа", sizes: ["30ml"], img: 4, desc: "Гиалурон хүчил, ниацинамид агуулсан гэрэлтүүлэг өгөх ханд. Арьсыг чийгшүүлж, тэгшитгэнэ." },
  { title: "NARAN Vitamin C Brightening Serum", handle: "vitc-serum", price: 95000, cat: "Арьс арчилгаа", sizes: ["30ml"], img: 4, desc: "15% Витамин C бүхий гэрэлтүүлэг, толбо арилгах ханд. Өглөө хэрэглэхэд тохиромжтой." },
  { title: "NARAN Hydra Moisture Cream", handle: "hydra-cream", price: 79000, cat: "Арьс арчилгаа", sizes: ["50ml"], img: 3, desc: "Гүн чийгшүүлэгч тос — керамид, ши тос агуулсан. Хуурай, мэдрэмтгий арьсанд." },
  { title: "NARAN Gentle Cleansing Foam", handle: "cleansing-foam", price: 49000, cat: "Арьс арчилгаа", sizes: ["150ml"], img: 3, desc: "Арьсыг чангалахгүй зөөлөн угаагч хөөс. Өдөр бүрийн цэвэрлэгээнд." },

  // Гоо сайхан (Makeup)
  { title: "NARAN Lip Color Velvet Nude", handle: "lip-velvet-nude", price: 45000, cat: "Гоо сайхан", sizes: ["Nude"], img: 6, desc: "Хилэн мэт матт өнгөлгөө өгөх, чийгшүүлэгч уруулын будаг. Бүдэг ягаан өнгө." },
  { title: "NARAN Matte Lipstick Ruby", handle: "lip-matte-ruby", price: 45000, cat: "Гоо сайхан", sizes: ["Ruby"], img: 6, desc: "Тод улаан матт уруулын будаг. Урт хугацаанд тогтвортой, хатаахгүй найрлага." },
  { title: "NARAN Silk Foundation", handle: "silk-foundation", price: 69000, cat: "Гоо сайхан", sizes: ["Natural", "Beige", "Sand"], img: 3, desc: "Байгалийн өнгө өгөх, дунд зэргийн бүрхүүлтэй шингэн суурь. Арьсыг гөлгөр харагдуулна." },
  { title: "NARAN Volume Mascara", handle: "volume-mascara", price: 39000, cat: "Гоо сайхан", sizes: ["Black"], img: 6, desc: "Эзэлхүүн, урт өгөх сормуусны будаг. Хунхрахгүй, ус тэсвэртэй." },

  // Бие арчилгаа ба бэлгийн багц (Body & Gift)
  { title: "NARAN Body Lotion Silk Touch", handle: "body-lotion-silk", price: 55000, cat: "Бие арчилгаа", sizes: ["250ml"], img: 3, desc: "Торго мэт зөөлөн мэдрэмж өгөх биеийн тос. Хурдан шингэдэг, урт хугацаанд чийгшүүлнэ." },
  { title: "NARAN Shower Gel Vanilla", handle: "shower-gel-vanilla", price: 35000, cat: "Бие арчилгаа", sizes: ["300ml"], img: 3, desc: "Ваниль үнэртэй зөөлөн шүршүүрийн гель. Арьсыг цэвэрлэж, тэжээнэ." },
  { title: "NARAN Premium Gift Set", handle: "premium-gift-set", price: 199000, cat: "Бэлгийн багц", sizes: ["Нэг хэмжээ"], img: 5, desc: "Парфюм, ханд, биеийн тос багтсан тансаг бэлгийн багц. Бэлэн боодолтой." },
  { title: "NARAN Skincare Starter Kit", handle: "skincare-starter-kit", price: 129000, cat: "Бэлгийн багц", sizes: ["Нэг хэмжээ"], img: 5, desc: "Угаагч, ханд, чийгшүүлэгч тос багтсан арьс арчилгааны эхлэгчийн багц." },
];

// Хуучин VEXO бараануудыг устгах (Наран дэлгүүр болгох)
const OLD_HANDLES = [
  "tech-fleece-hoodie","performance-tank","training-joggers","compression-longsleeve",
  "windbreaker-jacket","lined-training-shorts","seamless-leggings","womens-cropped-tee",
  "tactical-sling-bag","performance-cap","thermal-hooded-base","cargo-tech-pants",
];

export default async function seedNaran({ container }: ExecArgs) {
  assertDestructiveAllowed("seed-naran");
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);

  const [channel] = await salesChannelModule.listSalesChannels({ name: "Default Sales Channel" });
  const [profile] = await fulfillmentModule.listShippingProfiles({});
  if (!channel || !profile) throw new Error("Missing default sales channel or shipping profile");

  // Resolve category ids by handle (categories seeded by seed-categories.ts).
  const cats = await productModule.listProductCategories(
    { handle: Object.values(MN_TO_HANDLE) },
    { select: ["id", "handle"] as any },
  );
  const catIdByHandle = new Map(cats.map(c => [c.handle, c.id]));
  if (!cats.length) logger.warn("No product categories found — run seed-categories.ts first.");
  const categoryIdsFor = (mnName: string): string[] => {
    const id = catIdByHandle.get(MN_TO_HANDLE[mnName]);
    return id ? [id] : [];
  };

  // Remove old VEXO catalog + any previous Naran products (fresh, correct data each run)
  const stale = await productModule.listProducts({ handle: [...OLD_HANDLES, ...CATALOG.map(c => c.handle)] });
  if (stale.length) {
    await productModule.deleteProducts(stale.map(p => p.id));
    logger.info(`Removed ${stale.length} existing products (VEXO/old Naran)`);
  }

  const toCreate = CATALOG;
  if (toCreate.length) {
    await createProductsWorkflow(container).run({
      input: {
        products: toCreate.map(p => ({
          title: p.title,
          handle: p.handle,
          description: p.desc,
          status: "published" as const,
          category_ids: categoryIdsFor(p.cat),
          thumbnail: IMG(p.img),
          images: [{ url: IMG(p.img) }],
          shipping_profile_id: profile.id,
          options: [{ title: "Хэмжээ", values: p.sizes }],
          variants: p.sizes.map(s => ({
            title: s,
            sku: `${p.handle}-${s}`.toLowerCase().replace(/\s+/g, "-"),
            manage_inventory: false,
            options: { "Хэмжээ": s },
            prices: [{ amount: p.price, currency_code: "mnt" }],
          })),
          sales_channels: [{ id: channel.id }],
        })),
      },
    });
    logger.info(`Seeded ${toCreate.length} NARAN beauty products`);
  } else {
    logger.info("NARAN catalog already seeded");
  }

  // Ensure every catalog product is linked to the sales channel (Store API visibility)
  const all = await productModule.listProducts({ handle: CATALOG.map(c => c.handle) });
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  let linked = 0;
  for (const p of all) {
    try {
      await link.create({
        [Modules.PRODUCT]: { product_id: p.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: channel.id },
      });
      linked++;
    } catch { /* already linked */ }
  }
  logger.info(`Sales-channel links: ${linked} created, ${all.length - linked} already present`);
  logger.info(`NARAN catalog ready — ${all.length} products across 4 categories.`);
}
