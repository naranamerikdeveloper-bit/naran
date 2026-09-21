"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { CheckIcon, LockIcon } from "@/components/Icons";
import { useCart, useToast, useAuth } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { money } from "@/lib/api";
import { medusa } from "@/lib/medusa";
import { botxon } from "@/lib/botxon";
import { useDelivery } from "@/lib/useDelivery";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

export default function CheckoutPage() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const items = useCart(s => s.items);
  const clear = useCart(s => s.clear);
  const showToast = useToast(s => s.show);
  const user = useAuth(s => s.user);
  const token = useAuth(s => s.token);
  const [email, setEmail] = useState("");
  // One delivery fee for every order, set in the admin (0 = free) — no choice here.
  const delivery = useDelivery();
  const shipOptionId = delivery?.optionId || "";
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [mounted, setMounted] = useState(false);
  // Coupon state
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ discountTotal: number; shippingTotal: number; total: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoErr, setPromoErr] = useState("");
  useEffect(() => { setMounted(true); if (user?.email) setEmail(e => e || user.email); }, [user]);

  const subtotal = items.reduce((a, b) => a + b.price * b.qty, 0);
  const lineItemsFor = () => items.filter(i => i.variantId).map(i => ({ variantId: i.variantId!, quantity: i.qty }));

  const shipping = delivery?.fee ?? 0;
  const tax = 0;
  // Effective totals — Medusa's numbers when a coupon is applied, else local.
  const discount = promo ? promo.discountTotal : 0;
  const total = promo ? promo.total : subtotal + shipping + tax;

  async function applyPromo(code: string) {
    const c = code.trim();
    if (!c) return;
    const li = lineItemsFor();
    if (li.length === 0) { setPromoErr(t("toast.readd")); return; }
    setPromoBusy(true); setPromoErr("");
    try {
      const res = await medusa.previewPromo({ items: li, shippingOptionId: shipOptionId || undefined, promoCode: c });
      if (!res.valid) { setPromo(null); setPromoCode(null); setPromoErr(t("co.promoInvalid")); return; }
      setPromo({ discountTotal: res.discountTotal, shippingTotal: res.shippingTotal, total: res.total });
      setPromoCode(res.code);
    } catch { setPromoErr(t("co.promoInvalid")); }
    finally { setPromoBusy(false); }
  }
  function clearPromo() { setPromo(null); setPromoCode(null); setPromoInput(""); setPromoErr(""); }
  // Re-price the coupon if the selected shipping option changes (FREESHIP etc.).
  useEffect(() => {
    if (!promoCode) return;
    let cancelled = false;
    medusa.previewPromo({ items: lineItemsFor(), shippingOptionId: shipOptionId || undefined, promoCode: promoCode })
      .then(res => { if (!cancelled && res.valid) setPromo({ discountTotal: res.discountTotal, shippingTotal: res.shippingTotal, total: res.total }); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipOptionId]);

  // Inline validation — custom messages (consistent with the design) instead of
  // the browser's native popups. Returns true when the form is good to submit.
  function validate(fd: FormData): boolean {
    const er: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) er.email = t("auth.invalidEmail");
    for (const f of ["first_name", "last_name", "address_1", "city"]) {
      if (!String(fd.get(f) || "").trim()) er[f] = t("common.required");
    }
    const phone = String(fd.get("phone") || "").trim();
    if (!phone) er.phone = t("common.required");
    else if (!/^[0-9+()\-\s]{6,}$/.test(phone)) er.phone = t("co.phoneInvalid");
    setErrors(er);
    return Object.keys(er).length === 0;
  }

  async function place(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return showToast(t("toast.cartEmpty"));
    const lineItems = items.filter(i => i.variantId).map(i => ({ variantId: i.variantId!, quantity: i.qty }));
    if (lineItems.length === 0) return showToast(t("toast.readd"));

    const fd = new FormData(e.target as HTMLFormElement);
    if (!validate(fd)) {
      setFormError(t("co.checkFields"));
      // Bring the first invalid field into view for the user.
      (e.target as HTMLFormElement).querySelector<HTMLElement>("[aria-invalid='true']")?.scrollIntoView({ block: "center" });
      return;
    }
    setFormError("");
    const address = {
      first_name: String(fd.get("first_name") || "Customer"),
      last_name: String(fd.get("last_name") || ""),
      address_1: String(fd.get("address_1") || ""),
      // Apartment / entrance details and courier notes (no postal codes in MN delivery).
      address_2: String(fd.get("address_2") || "").trim(),
      city: String(fd.get("city") || ""),
      country_code: "mn",
      phone: String(fd.get("phone") || ""),
      metadata: { entrance_code: String(fd.get("entrance_code") || "").trim() },
    };

    setBusy(true);
    try {
      // Coarse method label for the payment intent (metadata only).
      const coarse = "standard" as const;
      // 1. Build the Medusa cart (not completed yet)
      const { cartId, total: cartTotal } = await medusa.prepareCart({ email, items: lineItems, shippingOptionId: shipOptionId || undefined, address, token: token ?? undefined, promoCode: promoCode ?? undefined });
      // 2. Create a Botxon invoice (QPay / bank apps) — money to the merchant's QPay.
      const invoice = await botxon.createInvoice({ cartId, amount: cartTotal, email, shippingMethod: coarse, description: "NARAN" });
      // 3. Stash QR + deeplinks for the pay page, then show the QR and poll status.
      try { sessionStorage.setItem(`botxon_inv_${invoice.invoiceId}`, JSON.stringify({ ...invoice, amount: cartTotal })); } catch { /* private mode */ }
      router.push(`/${lang}/checkout/pay?inv=${encodeURIComponent(invoice.invoiceId)}`);
    } catch (err: any) {
      const msg = err.message || t("toast.payFailed");
      showToast(msg);
      setFormError(msg);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1100px] mx-auto">
          <Nav />

        <div className="text-[11px] font-mono tracking-wider text-subtle flex items-center gap-2 mt-6">
          <Link href="/cart" className="hover:text-ink uppercase">{t("bc.cart")}</Link><span className="opacity-40">/</span><span className="text-ink uppercase">{t("bc.checkout")}</span>
        </div>

        <h1 className="font-display text-[30px] sm:text-[44px] uppercase tracking-tight leading-[.95] mt-3 mb-5">{t("co.titlePre")}<span className="text-accent">{t("co.titleAccent")}</span></h1>

        <div className="flex gap-1.5 sm:gap-2 mb-7 text-[12px] overflow-x-auto no-scrollbar">
          <Step n={1} label={t("co.cart")} done/>
          <Sep/>
          <Step n={2} label={t("co.information")} active/>
          <Sep/>
          <Step n={3} label={t("co.payment")}/>
          <Sep/>
          <Step n={4} label={t("co.confirm")}/>
        </div>

        <form onSubmit={place} noValidate aria-busy={busy}
          onInput={(e) => { const el = e.target as HTMLInputElement; if (el.name && errors[el.name]) setErrors(prev => ({ ...prev, [el.name]: "" })); }}
          className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 lg:gap-8 pb-10">
          <div>
            <FormCard title={t("co.contact")} i={0}>
              <div className="grid gap-3.5">
                <Field label={t("co.email")} required error={errors.email}>
                  <input type="email" name="email" value={email} aria-invalid={!!errors.email}
                    onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: "" })); }}
                    placeholder={t("news.placeholder")}/>
                </Field>
              </div>
            </FormCard>

            <FormCard title={t("co.shippingAddress")} i={1}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <Field label={t("co.firstName")} required error={errors.first_name}><input name="first_name" placeholder="Бат" aria-invalid={!!errors.first_name}/></Field>
                <Field label={t("co.lastName")} required error={errors.last_name}><input name="last_name" placeholder="Эрдэнэ" aria-invalid={!!errors.last_name}/></Field>
                <Field label={t("co.address")} full required error={errors.address_1}><input name="address_1" placeholder={t("co.addressPh")} aria-invalid={!!errors.address_1}/></Field>
                <Field label={t("co.city")} required error={errors.city}><input name="city" placeholder="Улаанбаатар" aria-invalid={!!errors.city}/></Field>
                <Field label={t("co.entrance")}><input name="entrance_code" placeholder={t("co.entrancePh")} autoComplete="off"/></Field>
                <Field label={t("co.country")}>
                  <select name="country"><option value="mn">{t("co.mongolia")}</option></select>
                </Field>
                <Field label={t("co.phone")} required error={errors.phone}><input name="phone" type="tel" inputMode="tel" placeholder="+976 …" aria-invalid={!!errors.phone}/></Field>
                <Field label={t("co.details")} full><textarea name="address_2" rows={3} placeholder={t("co.detailsPh")} className="resize-none"/></Field>
              </div>
            </FormCard>

            <FormCard title={t("co.payment")} i={2}>
              <div className="border-2 border-ink rounded-xl p-4 flex items-center gap-3.5 bg-surface-2">
                <input type="radio" name="pay" checked readOnly className="sr-only"/>
                <span className="shrink-0 w-5 h-5 rounded-full grid place-items-center border-2 border-accent-deep bg-accent-deep" aria-hidden>
                  <span className="w-2 h-2 rounded-full bg-white"/>
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{t("co.wireTitle")}</div>
                  <div className="tiny">{t("co.wireSub")}</div>
                </div>
                <span className="px-2.5 h-7 grid place-items-center rounded-pill bg-accent-deep text-white text-[11px] font-bold tracking-wide">QPay</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                <LockIcon width={14} height={14}/> {t("co.wireNote")}
              </div>
            </FormCard>

            {formError && (
              <div role="alert" className="mb-3 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                <span>{formError}</span>
              </div>
            )}
            <button disabled={busy} type="submit" className="btn btn-primary w-full justify-center h-[60px] text-base disabled:opacity-60">
              {busy ? (
                <><span className="w-5 h-5 rounded-full border-2 border-ink/25 border-t-ink animate-spin"/> {t("co.starting")}</>
              ) : (
                <>{t("co.payWire")} <span className="arrow-cap"><CheckIcon width={14} height={14}/></span></>
              )}
            </button>
            <p className="tiny text-center mt-3.5">
              {t("co.termsPre")}{" "}
              <Link href="/terms" className="underline hover:text-ink">{t("foot.terms")}</Link>,{" "}
              <Link href="/privacy" className="underline hover:text-ink">{t("foot.privacy")}</Link>{t("co.termsPost")}
            </p>
          </div>

          <aside className="card p-7 h-fit lg:sticky lg:top-6">
            <h3 className="hd-3">{t("co.order")}</h3>
            <div className="my-3.5 py-3.5 border-t border-b border-border">
              {mounted && items.map(i => (
                <div key={i.id} className="flex justify-between py-2 text-muted">
                  <span>{i.name} × {i.qty}</span>
                  <span>{money(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
            {/* Coupon */}
            <div className="mb-3.5">
              {!promoCode ? (
                <>
                  <div className="flex gap-2">
                    <input
                      value={promoInput}
                      onChange={e => { setPromoInput(e.target.value); setPromoErr(""); }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyPromo(promoInput); } }}
                      placeholder={t("co.promoPlaceholder")}
                      className="flex-1 min-w-0 uppercase tracking-wide"
                      aria-label={t("co.promoTitle")}
                    />
                    <button type="button" onClick={() => applyPromo(promoInput)} disabled={promoBusy || !promoInput.trim()}
                      className="btn btn-ghost px-4 whitespace-nowrap disabled:opacity-50">
                      {promoBusy ? "…" : t("co.promoApply")}
                    </button>
                  </div>
                  {promoErr && <div className="text-[12px] text-red-600 mt-1.5">{promoErr}</div>}
                </>
              ) : (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200">
                  <span className="text-[13px] font-semibold text-green-700 flex items-center gap-1.5">
                    <CheckIcon width={13} height={13}/> {promoCode} {t("co.promoApplied")}
                  </span>
                  <button type="button" onClick={clearPromo} className="text-[12px] text-muted hover:text-ink underline">{t("co.promoRemove")}</button>
                </div>
              )}
            </div>
            <Row k={t("cart.subtotal")} v={money(subtotal)}/>
            {discount > 0 && <Row k={t("co.discount")} v={`− ${money(discount)}`}/>}
            <Row k={t("cart.shipping")} v={shipping === 0 ? t("common.free") : money(shipping)}/>
            <Row k={t("cart.tax")} v={money(tax)}/>
            <div className="flex justify-between border-t border-border pt-4.5 mt-3 text-[18px] font-semibold">
              <span>{t("cart.total")}</span>
              <span className="num-tabular overflow-hidden">
                <motion.span key={total} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="inline-block">
                  {money(total)}
                </motion.span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 mt-4 p-3 bg-surface-2 rounded-xl text-[13px] text-muted">
              <LockIcon width={14} height={14}/> {t("co.secure")}
            </div>
          </aside>
        </form>
        </div>
      </div>
    </>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active?: boolean; done?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 font-medium ${active ? "text-ink" : done ? "text-ink" : "text-subtle"}`}>
      <span className={`w-6.5 h-6.5 rounded-full grid place-items-center text-xs ${
        done ? "bg-green-600 text-white" : active ? "bg-accent-deep text-white" : "bg-surface-2"
      }`} style={{ width: 26, height: 26 }}>{n}</span>
      {label}
    </div>
  );
}
function Sep() { return <span className="w-8 h-px bg-border self-center"/> }
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-2 text-muted"><span>{k}</span><span>{v}</span></div>;
}
function FormCard({ title, children, i = 0 }: { title: string; children: React.ReactNode; i?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: i * 0.07, ease: EASE }}
      className="card p-7 mb-4"
    >
      <h3 className="hd-3 mb-4">{title}</h3>
      {children}
    </motion.div>
  );
}
function Field({ label, full, children, required, error }: { label: string; full?: boolean; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <label className={`field group flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""} ${error ? "[&_input]:border-red-400 [&_select]:border-red-400 [&_input:focus]:border-red-400" : ""}`}>
      <span className="text-xs font-medium text-muted transition-colors group-focus-within:text-accent-deep">{label}{required && " *"}</span>
      {children}
      {error && <span role="alert" className="text-[11px] text-red-500">{error}</span>}
    </label>
  );
}
// Custom radio indicator (spring dot) + smooth selectable card.
function Radio({ name, title, sub, right, checked, onChange }: { name: string; title: string; sub?: string; right?: string; checked?: boolean; onChange?: () => void }) {
  return (
    <label className={`border rounded-xl p-4 flex items-center gap-3.5 cursor-pointer mb-2.5 transition-all duration-200 ease-elegant active:scale-[.99] ${checked ? "border-ink bg-surface-2 shadow-soft" : "border-border hover:border-ink/40 hover:-translate-y-px"}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only"/>
      <span className={`shrink-0 w-5 h-5 rounded-full grid place-items-center border-2 transition-colors duration-200 ${checked ? "border-accent-deep bg-accent-deep" : "border-ink/25"}`}>
        {checked && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="w-2 h-2 rounded-full bg-white"/>}
      </span>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        {sub && <div className="tiny">{sub}</div>}
      </div>
      {right && <div className="font-semibold num-tabular">{right}</div>}
    </label>
  );
}
