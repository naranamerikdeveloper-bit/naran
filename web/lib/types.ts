export type Category = "Fragrance" | "Skincare" | "Makeup" | "Body" | "Gift";
export type Shape =
  | "perfume" | "serum" | "cream" | "cleanser" | "lipstick"
  | "foundation" | "mascara" | "lotion" | "showergel" | "giftset";

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  shape: Shape;
  gender: "Men" | "Women" | "Unisex";
  season: "Winter" | "Summer" | "All-Season";
  price: number;
  was?: number;
  rating: number;
  reviews: number;
  badge?: "Sale" | "New" | null;
  colors: string[];
  sizes: string[];
  fabric: string;
  shortDesc: string;
  description: string;
  bullets: string[];
  specs: Record<string, string>;
  stock: number;
  accent: string;
  image?: string;
  images?: string[];
  // `price` is the variant's own price (sizes of one perfume differ: 50ml vs
  // 150ml). Product.price is the lowest of them — a "from" price.
  variants?: { id: string; size: string; stock: number; price?: number }[];
};

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  accent: string;
  category: string;
  shape: Shape;
  image?: string;
  size?: string;
  variantId?: string;
};

export type User = { id: string; email: string; firstName: string; lastName: string; phone?: string };

export type Order = {
  id: string;
  email: string;
  items: { id: string; name: string; price: number; qty: number }[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: "processing" | "shipped" | "delivered";
  createdAt: string;
  estimatedDelivery: string;
};
