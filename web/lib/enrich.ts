import type { Category, Shape } from "./types";

/**
 * Presentation defaults for a product.
 *
 * Medusa is the source of truth for everything that matters — title, price,
 * images, stock, category, brand, fragrance type. These few fields have no
 * Medusa equivalent and are only used to draw the card when the catalogue says
 * nothing: a placeholder shape and an accent colour.
 *
 * This file used to also carry hand-written copy, ratings and review counts for
 * the sixteen demo products the project was prototyped with. The real catalogue
 * shares no handle with them, so none of it had been reachable for a long time;
 * it is gone. A real product's rating and review count stay at zero until there
 * is a real review — the storefront must never show invented ones.
 */
export type ProductDefaults = {
  category: Category;
  shape: Shape;
  gender: "Men" | "Women" | "Unisex";
  season: "Winter" | "Summer" | "All-Season";
  accent: string;
};

export const DEFAULTS: ProductDefaults = {
  // The shop sells fragrance; an uncategorised product belongs there rather
  // than in a category it happens to be listed first under.
  category: "Fragrance",
  shape: "perfume",
  gender: "Unisex",
  season: "All-Season",
  accent: "#B5643C",
};
