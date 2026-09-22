"use client";
import { Logo } from "./Logo";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { useT } from "./LangProvider";

// Inline icons (no extra deps).
const IgIcon = (p: any) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const FbIcon = (p: any) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" {...p}>
    <path d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.24-1.35 1.4-1.35H16.3V5.5c-.26-.03-1.15-.11-2.18-.11-2.16 0-3.62 1.3-3.62 3.7v2.1H8.2V14h2.3v7h3z" />
  </svg>
);
const MailIcon = (p: any) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" />
  </svg>
);
const PhoneIcon = (p: any) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
    <path d="M6.5 3.5 9 4l1 3.5-2 1.5a12 12 0 0 0 5 5l1.5-2 3.5 1 .5 2.5a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />
  </svg>
);

const PinIcon = (p: any) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

// Four columns on desktop (brand · links · categories · contact), stacked on
// phones — shown on every screen size so terms/returns are reachable on mobile.
export function Footer() {
  const t = useT();
  return (
    <footer className="relative z-10 mx-3 mb-3 overflow-hidden rounded-[1.75rem] border border-line bg-white px-6 pt-10 sm:pt-12 pb-7 text-ink shadow-[0_24px_60px_-40px_rgba(211,90,76,.35)] sm:mx-4 sm:rounded-[2.25rem] sm:px-10 lg:mx-5">
      {/* faint warm corner bloom */}
      <div className="pointer-events-none absolute -top-24 right-[8%] h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto max-w-[1180px]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.35fr_.8fr_.9fr_1.5fr] md:gap-10">
          {/* 1. Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo variant="full" className="h-20 sm:h-24"/>
            <p className="mt-5 text-[13.5px] leading-relaxed text-muted max-w-sm">{t("foot.tagline")}</p>
            <div className="mt-5 flex gap-2.5">
              <Social href="https://instagram.com" label="Instagram"><IgIcon /></Social>
              <Social href="https://facebook.com" label="Facebook"><FbIcon /></Social>
            </div>
          </div>

          {/* 2. Links */}
          <FootCol title={t("foot.links")} links={[["/", t("foot.home")], ["/shop", t("bc.shop")], ["/cart", t("foot.myCart")], ["/account", t("foot.account")]]}/>

          {/* 3. Categories — only ones the store actually carries */}
          <FootCol title={t("foot.categories")} links={[["/shop?category=Fragrance", t("cat.Fragrance")], ["/shop?type=EDP", t("nav.edp")], ["/shop?type=EDT", t("nav.edt")], ["/shop?filter=new", t("home.newArrivals")]]}/>

          {/* 4. Contact */}
          <div className="col-span-2 md:col-span-1">
            <h5 className="mb-4 text-[11px] font-semibold uppercase tracking-[.2em] text-accent">{t("foot.contact")}</h5>
            <ul className="space-y-3 text-[13.5px] text-ink/75">
              <li>
                <a href="tel:+97698824848" className="inline-flex items-center gap-2.5 hover:text-accent transition-colors">
                  <PhoneIcon className="text-accent shrink-0" /> {t("foot.phone")}
                </a>
              </li>
              <li>
                <a href="mailto:info@naranamerikbaraa.mn" className="inline-flex items-center gap-2.5 hover:text-accent transition-colors break-all">
                  <MailIcon className="text-accent shrink-0" /> info@naranamerikbaraa.mn
                </a>
              </li>
              {["foot.addr1", "foot.addr2"].map(k => (
                <li key={k} className="flex items-start gap-2.5 leading-relaxed">
                  <PinIcon className="text-accent shrink-0 mt-[3px]" /> <span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {["QPay", "SocialPay"].map(m => (
                <span key={m} className="rounded-full border border-accent/25 bg-accent-soft/50 px-3 py-1 text-[11.5px] font-semibold text-accent-deep">{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 flex flex-col-reverse items-center gap-3 border-t border-line pt-6 text-[12.5px] text-muted md:flex-row md:justify-between">
          <span className="text-center">{t("foot.rights")}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            <Link href="/terms" className="hover:text-accent transition-colors">{t("foot.terms")}</Link>
            <Link href="/privacy" className="hover:text-accent transition-colors">{t("foot.privacy")}</Link>
            <Link href="/refund-policy" className="hover:text-accent transition-colors">{t("foot.delivery")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink/70 hover:bg-accent hover:text-white hover:border-accent transition-colors"
    >
      {children}
    </a>
  );
}

function FootCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h5 className="mb-4 text-[11px] font-semibold uppercase tracking-[.2em] text-accent">{title}</h5>
      <ul className="space-y-2.5">
        {links.map(([h, l]) => (
          <li key={l}>
            <Link href={h} className="text-sm text-ink/70 hover:text-accent transition-colors">{l}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
