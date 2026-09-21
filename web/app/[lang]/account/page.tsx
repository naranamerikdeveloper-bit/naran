"use client";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { BagIcon } from "@/components/Icons";
import { useAuth, useWish, useToast } from "@/lib/store";
import { useT, useLang } from "@/components/LangProvider";
import { Skeleton } from "@/components/Skeleton";
import { CountUp } from "@/components/CountUp";
import { api, money } from "@/lib/api";
import type { Product } from "@/lib/types";
import type { CustomerOrder } from "@/lib/medusa";

const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

const TABS = ["Overview", "Orders", "Wishlist", "Addresses", "Settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, string> = {
  Overview: "acc.overview", Orders: "acc.orders", Wishlist: "acc.wishlist",
  Addresses: "acc.addresses", Settings: "acc.settings",
};

const statusStyle: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
};

export default function AccountPage() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const user = useAuth(s => s.user);
  const token = useAuth(s => s.token);
  const setSession = useAuth(s => s.setSession);
  const signOut = useAuth(s => s.signOut);
  const wishIds = useWish(s => s.ids);
  const showToast = useToast(s => s.show);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsErrors, setSettingsErrors] = useState<Record<string, string>>({});
  const [settingsBanner, setSettingsBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Wait for the persisted auth store to rehydrate before deciding to redirect,
  // so refreshing a protected page doesn't bounce a logged-in user to /auth.
  useEffect(() => {
    setHydrated(useAuth.persist.hasHydrated());
    return useAuth.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  // Clear the profile save banner/errors when leaving Settings, so a stale
  // "saved" (or error) banner never reappears on returning to the tab.
  useEffect(() => {
    if (tab !== "Settings") { setSettingsBanner(null); setSettingsErrors({}); }
  }, [tab]);

  const refreshOrders = () => { if (token) api.customers.orders(token).then(r => setOrders(r.data)).catch(() => {}); };

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) { router.push(`/${lang}/auth`); return; }
    api.customers.orders(token).then(r => setOrders(r.data)).catch(() => {});
    api.customers.addresses(token).then(r => setAddresses(r.data)).catch(() => {});
    api.products.list({}).then(r => setAllProducts(r.data)).catch(() => {}).finally(() => setLoadingProducts(false));
  }, [hydrated, user, token, router]);

  if (!hydrated) return null;
  if (!user || !token) return null;

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const fd = new FormData(e.currentTarget);
    const first = String(fd.get("first") || "").trim();
    const last = String(fd.get("last") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    // Inline validation — first name required, phone format-checked when present.
    const er: Record<string, string> = {};
    if (!first) er.first = t("common.required");
    if (phone && !/^[0-9+()\-\s]{6,}$/.test(phone)) er.phone = t("co.phoneInvalid");
    setSettingsErrors(er);
    if (Object.keys(er).length) { setSettingsBanner({ ok: false, text: t("co.checkFields") }); return; }
    setSettingsBanner(null);
    setSaving(true);
    try {
      const { user: updated } = await api.customers.update(token, { firstName: first, lastName: last, phone });
      setSession(updated, token);
      showToast(t("toast.profileSaved"));
      setSettingsBanner({ ok: true, text: t("toast.profileSaved") });
    } catch (err: any) {
      const msg = err?.message || t("acc.saveError");
      showToast(msg);
      setSettingsBanner({ ok: false, text: msg });
    } finally { setSaving(false); }
  }

  async function requestDeletion() {
    if (!token) return;
    if (!window.confirm(t("acc.deleteConfirm"))) return;
    try {
      await api.customers.requestDeletion(token);
      showToast(t("acc.deleteRequested"));
      signOut();
      router.push(`/${lang}`);
    } catch (e: any) {
      showToast(e?.message || t("acc.saveError"));
    }
  }

  const totalSpent = orders.reduce((a, b) => a + b.total, 0);
  const primaryAddress = addresses[0];
  const wished = allProducts.filter(p => wishIds.includes(p.id));

  return (
    <>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5 pb-2 mesh-light min-h-screen">
        <div className="max-w-[1100px] mx-auto">
          <Nav />

          {/* Profile header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            className="mt-6 bg-white border border-line rounded-3xl p-5 sm:p-7 shadow-soft"
          >
            <div className="flex items-center gap-4">
              <span className="w-16 h-16 rounded-full grid place-items-center text-white font-display text-[22px] shadow-[0_10px_24px_-8px_rgba(174, 34, 87,.55)]"
                style={{ background: "linear-gradient(135deg,#F07CA5,#AE2257)" }}>
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-[24px] tracking-tight truncate">{user.firstName} {user.lastName}</h1>
                <p className="text-muted text-[13px] truncate">{user.email}</p>
              </div>
              <button onClick={() => { signOut(); router.push(`/${lang}`); }}
                className="ml-auto hidden sm:inline-flex btn btn-outline btn-sm">{t("acc.signOut")}</button>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <Stat label={t("acc.statOrders")} value={<CountUp key={`o${orders.length}`} value={orders.length}/>}/>
              <Stat label={t("acc.statSpent")} value={<CountUp key={`s${totalSpent}`} value={totalSpent} format={money}/>}/>
              <Stat label={t("acc.statWishlist")} value={<CountUp key={`w${wished.length}`} value={wished.length}/>}/>
              <Stat label={t("acc.statAddresses")} value={<CountUp key={`a${addresses.length}`} value={addresses.length}/>}/>
            </div>
          </motion.div>

          {/* Tabs — animated sliding pill under the active tab */}
          <div className="sticky top-2 z-20 mt-4 -mx-3 px-3 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-white/80 backdrop-blur border border-line rounded-pill p-1.5 shadow-soft">
              {TABS.map(tb => (
                <button key={tb} onClick={() => setTab(tb)}
                  className="relative h-9 px-4 rounded-pill text-[13px] font-medium whitespace-nowrap shrink-0 active:scale-95 transition-transform">
                  {tab === tb && (
                    <motion.span layoutId="acctTabPill" transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 bg-ink rounded-pill"/>
                  )}
                  <span className={`relative z-10 transition-colors ${tab === tb ? "text-white" : "text-muted hover:text-ink"}`}>{t(TAB_KEY[tb])}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab content — keyed so each panel fades/rises in on switch (no exit
              wait, so it can never stick if an animation is throttled) */}
          <div className="mt-5 mb-10">
            <motion.div key={tab}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}>
            {tab === "Overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title={t("acc.recentOrder")}>
                  {orders.length === 0 ? <Empty msg={t("acc.noOrders")} cta/> : (
                    <OrderRow o={orders[0]} onReturned={refreshOrders}/>
                  )}
                </Card>
                <Card title={t("acc.summary")}>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label={t("acc.ordersWord")} value={orders.length}/>
                    <Stat label={t("acc.totalSpent")} value={money(totalSpent)}/>
                  </div>
                </Card>
                <Card title={t("acc.defaultAddress")}>
                  {primaryAddress ? <AddressBlock a={primaryAddress}/> : (
                    <button onClick={() => setTab("Addresses")} className="text-sm text-muted hover:text-ink">{t("acc.noAddress")}</button>
                  )}
                </Card>
                <Card title={t("acc.paymentMethod")}>
                  <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl">
                    <svg width={40} height={26} viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="5" fill="#00B14F"/><path d="M7 12.5l2.6 2.6L17 8.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <div><div className="font-semibold text-sm">QPay</div><div className="tiny">{t("acc.qpayNote")}</div></div>
                  </div>
                </Card>
              </div>
            )}

            {tab === "Orders" && (
              <Card title={`${orders.length} ${t("acc.ordersWord")}`}>
                {orders.length === 0 ? (
                  <Empty msg={t("acc.noOrders")} cta/>
                ) : (
                  <div className="divide-y divide-line">
                    {orders.map(o => <OrderRow key={o.id} o={o} onReturned={refreshOrders}/>)}
                  </div>
                )}
              </Card>
            )}

            {tab === "Wishlist" && (
              loadingProducts ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {[0, 1, 2, 3].map(i => <Skeleton key={i} className="aspect-[4/5] rounded-[1.4rem]"/>)}
                </div>
              ) : wished.length === 0 ? (
                <Card><Empty msg={t("acc.wishEmpty")} cta/></Card>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {wished.map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}
                </div>
              )
            )}

            {tab === "Addresses" && (
              addresses.length === 0 ? (
                <Card><Empty msg={t("acc.noAddress")} cta/></Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {addresses.map((a, i) => (
                    <Card key={a.id || i} title={i === 0 ? t("acc.defaultHome") : t("acc.address")}>
                      <AddressBlock a={a}/>
                    </Card>
                  ))}
                </div>
              )
            )}

            {tab === "Settings" && (
              <Card title={t("acc.profileSettings")}>
                <form onSubmit={saveProfile}
                  onInput={(e) => { const el = e.target as HTMLInputElement; if (el.name && settingsErrors[el.name]) setSettingsErrors(p => ({ ...p, [el.name]: "" })); }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field name="first" label={t("co.firstName")} defaultValue={user.firstName} error={settingsErrors.first}/>
                  <Field name="last" label={t("co.lastName")} defaultValue={user.lastName}/>
                  <Field name="email" label={t("co.email")} defaultValue={user.email} full type="email" readOnly/>
                  <Field name="phone" label={t("co.phone")} defaultValue={user.phone} full error={settingsErrors.phone}/>
                  <label className="sm:col-span-2 flex items-center gap-2.5 text-sm text-muted">
                    <input type="checkbox" defaultChecked className="accent-accent"/> {t("acc.emailOptin")}
                  </label>
                  {settingsBanner && (
                    <div role="alert" className={`sm:col-span-2 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] ${settingsBanner.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                        {settingsBanner.ok ? <path d="m5 12 5 5L20 7"/> : <><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></>}
                      </svg>
                      <span>{settingsBanner.text}</span>
                    </div>
                  )}
                  <div className="sm:col-span-2 flex gap-3 mt-2">
                    <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? t("common.pleaseWait") : t("acc.saveChanges")}</button>
                    <button type="button" onClick={() => { signOut(); router.push(`/${lang}`); }} className="btn btn-outline sm:hidden">{t("acc.signOut")}</button>
                  </div>
                </form>
              </Card>
            )}
            {tab === "Settings" && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/50 p-5">
                <h3 className="font-semibold text-red-700 text-sm">{t("acc.dangerZone")}</h3>
                <p className="text-[13px] text-muted mt-1 mb-3">{t("acc.deleteDesc")}</p>
                <button type="button" onClick={requestDeletion} className="btn btn-outline border-red-300 text-red-700 hover:bg-red-100 text-sm">
                  {t("acc.deleteRequest")}
                </button>
              </div>
            )}
            </motion.div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-2xl p-4 transition-all duration-200 ease-elegant hover:-translate-y-0.5 hover:bg-white hover:shadow-soft">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="font-display text-[24px] tracking-tight mt-1 num-tabular">{value}</div>
    </div>
  );
}
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-2xl p-5 shadow-soft">
      {title && <h3 className="font-display text-[17px] tracking-tight mb-4">{title}</h3>}
      {children}
    </div>
  );
}
function OrderRow({ o, onReturned }: { o: CustomerOrder; onReturned?: () => void }) {
  const t = useT();
  const token = useAuth(s => s.token);
  const showToast = useToast(s => s.show);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Only fulfilled orders can be returned (Medusa rejects unfulfilled items).
  const returnable = (o.status === "delivered" || o.status === "shipped") && o.items.some(i => i.id);

  async function submit() {
    const items = o.items.filter(i => sel[i.id]).map(i => ({ id: i.id, quantity: i.quantity }));
    if (!items.length) { showToast(t("acc.returnPick")); return; }
    setBusy(true);
    try {
      await api.customers.createReturn({ token: token ?? undefined, orderId: o.orderId, items, note: note || undefined });
      setDone(true); setOpen(false);
      showToast(t("acc.returnSent"));
      onReturned?.();
    } catch (e: any) {
      showToast(e?.message || t("acc.returnFailed"));
    } finally { setBusy(false); }
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{o.items.map(i => i.name).join(", ")}</div>
          <div className="tiny">{o.id} · {o.createdAt.slice(0, 10)}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-pill text-[11px] font-semibold ${statusStyle[o.status] ?? statusStyle.processing}`}>{t(`acc.status_${o.status}`)}</span>
        <span className="font-semibold text-sm num-tabular">{money(o.total)}</span>
      </div>
      {done ? (
        <div className="mt-2 flex justify-end"><span className="tiny text-green-700 font-medium">{t("acc.returnRequested")}</span></div>
      ) : returnable && (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => setOpen(v => !v)} className="text-[12px] text-accent hover:underline">
            {open ? t("common.cancel") : t("acc.requestReturn")}
          </button>
        </div>
      )}
      {open && !done && (
        <div className="mt-2 rounded-xl border border-line p-3 bg-surface-2">
          <div className="text-[12px] font-medium mb-2">{t("acc.returnPick")}</div>
          <div className="grid gap-1.5 mb-2.5">
            {o.items.map(i => (
              <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="accent-accent" checked={!!sel[i.id]} onChange={e => setSel(s => ({ ...s, [i.id]: e.target.checked }))}/>
                <span className="flex-1 truncate">{i.name} × {i.quantity}</span>
              </label>
            ))}
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={t("acc.returnNote")} className="w-full mb-2.5 text-sm"/>
          <button type="button" onClick={submit} disabled={busy} className="btn btn-primary text-sm px-4 py-2 disabled:opacity-60">
            {busy ? t("common.pleaseWait") : t("acc.returnSubmit")}
          </button>
        </div>
      )}
    </div>
  );
}
function AddressBlock({ a }: { a: any }) {
  return (
    <p className="text-muted leading-relaxed text-sm">
      {[a.first_name, a.last_name].filter(Boolean).join(" ")}<br/>
      {a.address_1}{a.address_2 ? `, ${a.address_2}` : ""}<br/>
      {[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}
      {a.phone && <><br/>{a.phone}</>}
    </p>
  );
}
function Empty({ msg, cta }: { msg: string; cta?: boolean }) {
  const t = useT();
  return (
    <div className="py-10 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink/35"><BagIcon width={22} height={22}/></span>
      <p className="text-muted">{msg}</p>
      {cta && <Link href="/shop" className="btn btn-primary btn-sm mt-4 inline-flex">{t("acc.startShopping")}</Link>}
    </div>
  );
}
function Field({ label, defaultValue, full, type = "text", name, readOnly, error }: { label: string; defaultValue?: string; full?: boolean; type?: string; name?: string; readOnly?: boolean; error?: string }) {
  return (
    <label className={`field group flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""} ${error ? "[&_input]:border-red-400 [&_input:focus]:border-red-400" : ""}`}>
      <span className="text-xs font-medium text-muted transition-colors group-focus-within:text-accent-deep">{label}</span>
      <input type={type} name={name} defaultValue={defaultValue} readOnly={readOnly} aria-invalid={!!error} className={readOnly ? "opacity-60 cursor-not-allowed" : undefined}/>
      {error && <span role="alert" className="text-[11px] text-red-500">{error}</span>}
    </label>
  );
}
