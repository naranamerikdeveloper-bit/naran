import { sanitize, emptyHomepage } from "../cms";

describe("cms.emptyHomepage", () => {
  it("is a safe empty scaffold (no hero, promo disabled)", () => {
    const h = emptyHomepage();
    expect(h.hero).toEqual([]);
    expect(h.promo.enabled).toBe(false);
    expect(h.promo.href).toBe("/shop");
  });
});

describe("cms.sanitize", () => {
  it("returns the empty scaffold for junk / missing input", () => {
    expect(sanitize(undefined)).toEqual(emptyHomepage());
    expect(sanitize({})).toEqual(emptyHomepage());
    expect(sanitize({ hero: "nope", promo: 5 })).toEqual(emptyHomepage());
  });

  it("normalizes hero slides to bilingual {mn,en} strings with defaults", () => {
    const out = sanitize({ hero: [{ top: { mn: "Гоо", en: "Beauty" }, img: 123 }] });
    expect(out.hero).toHaveLength(1);
    expect(out.hero[0].top).toEqual({ mn: "Гоо", en: "Beauty" });
    expect(out.hero[0].kicker).toEqual({ mn: "", en: "" }); // missing → empty
    // Not an https URL or an in-site path, so it is dropped rather than
    // rendered as a broken <img src="123">.
    expect(out.hero[0].img).toBe("");
    expect(out.hero[0].href).toBe("/shop"); // default
  });

  it("caps hero at 8 slides", () => {
    const many = Array.from({ length: 20 }, () => ({ top: { mn: "x", en: "x" } }));
    expect(sanitize({ hero: many }).hero).toHaveLength(8);
  });

  it("coerces promo.enabled to boolean and preserves fields", () => {
    const out = sanitize({ promo: { enabled: 1, title: { mn: "Хямдрал", en: "Sale" }, href: "/shop?filter=sale" } });
    expect(out.promo.enabled).toBe(true);
    expect(out.promo.title).toEqual({ mn: "Хямдрал", en: "Sale" });
    expect(out.promo.href).toBe("/shop?filter=sale");
  });

  it("defaults promo.href to /shop when absent", () => {
    expect(sanitize({ promo: { enabled: false } }).promo.href).toBe("/shop");
  });
});
