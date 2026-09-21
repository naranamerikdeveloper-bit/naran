"use client";
import { useEffect, useState } from "react";
import { medusa } from "./medusa";

// The store's single delivery fee, set in the admin (Биелүүлэлт → Хүргэлтийн
// төлбөр). 0 = free. Fetched once per page load and shared by cart, drawer and
// checkout. `null` while loading.
export type Delivery = { optionId: string | null; fee: number };

let cached: Promise<Delivery> | null = null;
export function loadDelivery(): Promise<Delivery> {
  if (!cached) {
    cached = medusa.delivery().catch(() => {
      cached = null;              // retry on the next call
      return { optionId: null, fee: 0 };
    });
  }
  return cached;
}

export function useDelivery(): Delivery | null {
  const [d, setD] = useState<Delivery | null>(null);
  useEffect(() => { let on = true; loadDelivery().then(v => { if (on) setD(v); }); return () => { on = false; }; }, []);
  return d;
}
