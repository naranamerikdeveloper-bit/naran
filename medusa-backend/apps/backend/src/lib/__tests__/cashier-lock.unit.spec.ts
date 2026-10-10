import { cashierMayCall } from "../rbac";

// The cashier role is the only one the POS lock applies to, and it is the one
// role meant to be boxed into a single screen. These cases are the contract:
// if one of them flips, a shop-floor account has gained or lost reach.
describe("cashierMayCall", () => {
  describe("what the till needs", () => {
    it.each([
      ["GET", "/admin/offline-sale?summary=1"],
      ["GET", "/admin/offline-sale?report=2026-10-09"],
      ["POST", "/admin/offline-sale"],
      ["POST", "/admin/offline-sale/qpay"],
      ["GET", "/admin/offline-sale/qpay?invoiceId=abc"],
      ["POST", "/admin/marketing/validate-code"],
      ["GET", "/admin/users/me"],
    ])("allows %s %s", (method, path) => {
      expect(cashierMayCall(method, path)).toBe(true);
    });
  });

  describe("the money and the catalogue", () => {
    it.each([
      // Rewriting a price was the whole reason for this lock.
      ["POST", "/admin/products/prod_123"],
      ["POST", "/admin/products/prod_123/variants/variant_1"],
      ["DELETE", "/admin/products/prod_123"],
      ["POST", "/admin/price-lists"],
      ["POST", "/admin/inventory-items/ii_1/location-levels/sl_1"],
      // Minting a discount for yourself.
      ["POST", "/admin/promotions"],
      ["POST", "/admin/campaigns"],
      // Promoting yourself, or inviting an accomplice.
      ["POST", "/admin/users/user_1"],
      ["POST", "/admin/invites"],
      ["POST", "/admin/api-keys"],
      // Rewriting store config, including the role parking lot in metadata.
      ["POST", "/admin/stores/store_1"],
      // Refunds and order edits.
      ["POST", "/admin/orders/order_1/refund"],
      ["POST", "/admin/draft-orders"],
    ])("blocks %s %s", (method, path) => {
      expect(cashierMayCall(method, path)).toBe(false);
    });
  });

  describe("reads a cashier has no business making", () => {
    it.each([
      ["/admin/users"],
      ["/admin/customers"],
      ["/admin/customers/cus_1"],
      ["/admin/orders"],
      ["/admin/products"],
      ["/admin/reports/sales"],
      ["/admin/analytics/overview"],
      ["/admin/audit"],
      ["/admin/crm/customers"],
      ["/admin/stores"],
      ["/admin/promotions"],
      ["/admin/inventory-items"],
    ])("blocks GET %s", (path) => {
      expect(cashierMayCall("GET", path)).toBe(false);
    });

    it("still allows GET /admin/users/me, which the shell needs", () => {
      expect(cashierMayCall("GET", "/admin/users/me")).toBe(true);
    });
  });

  it("denies by default: an endpoint nobody thought of is still a write", () => {
    expect(cashierMayCall("POST", "/admin/some-future-route")).toBe(false);
    expect(cashierMayCall("PATCH", "/admin/anything")).toBe(false);
    expect(cashierMayCall("DELETE", "/admin/anything")).toBe(false);
  });

  it("lets unlisted reads through so the admin shell can boot", () => {
    expect(cashierMayCall("GET", "/admin/currencies")).toBe(true);
  });

  it("is not fooled by a query string or a lowercase method", () => {
    expect(cashierMayCall("get", "/admin/customers?limit=50")).toBe(false);
    expect(cashierMayCall("post", "/admin/offline-sale")).toBe(true);
  });

  it("does not let a prefix match stand in for the real path", () => {
    // /admin/users/me is allowed; nothing deeper under it is.
    expect(cashierMayCall("GET", "/admin/users/me/sessions")).toBe(false);
    expect(cashierMayCall("POST", "/admin/users/me")).toBe(false);
    // A route that merely starts with an allowed name is not that route.
    expect(cashierMayCall("POST", "/admin/offline-sale-export")).toBe(false);
  });
});
