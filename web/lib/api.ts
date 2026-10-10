import type { ListResult, Product } from "./types";
import { medusa } from "./medusa";

// The storefront's data layer. Every call goes to Medusa — it is the single
// source of truth for the catalogue, customers and orders.
//
// This used to be a switch: each method could fall back to the pre-Medusa
// Express API when NEXT_PUBLIC_USE_MEDUSA=0. That path had been dead for a long
// time (some of it pointed at /api/orders, an endpoint removed from the server),
// so it is gone. The Express service now does one job: payments.
//
// `api` stays as the name pages import, so call sites did not have to change.
export const api = {
  products: {
    list: (params: Record<string, string | undefined> = {}): Promise<ListResult> =>
      medusa.products.list(params),
    featured: () => medusa.products.featured(),
    get: (idOrSlug: string): Promise<{ data: Product; related: Product[] }> =>
      medusa.products.get(idOrSlug),
  },
  auth: {
    login: (email: string, password: string) => medusa.auth.login(email, password),
    signup: (data: { firstName: string; lastName: string; email: string; password: string }) =>
      medusa.auth.signup(data),
    me: (token: string) => medusa.auth.me(token),
    resetRequest: (email: string) => medusa.auth.resetRequest(email),
    resetConfirm: (token: string, password: string) => medusa.auth.resetConfirm(token, password),
  },
  customers: {
    orders: (token: string) => medusa.customers.orders(token),
    addresses: (token: string) => medusa.customers.addresses(token),
    update: (token: string, patch: { firstName?: string; lastName?: string; phone?: string }) =>
      medusa.customers.update(token, patch),
    createReturn: (input: { token?: string; orderId: string; items: { id: string; quantity: number }[]; note?: string }) =>
      medusa.customers.createReturn(input),
    requestDeletion: (token: string) => medusa.customers.requestDeletion(token),
  },
};

export const money = (n: number) => `₮${Math.round(n).toLocaleString("en-US")}`;
