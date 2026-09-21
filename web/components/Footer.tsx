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

export function Footer() {
  const t = useT();
  return (
    <footer className="relative z-10 hidden lg:block mx-3 mb-3 overflow-hidden rounded-[1.75rem] border border-line bg-white px-6 pt-12 pb-7 text-ink shadow-[0_24px_60px_-40px_rgba(211,90,76,.35)] sm:mx-4 sm:rounded-[2.25rem] sm:px-10 lg:mx-5">
      {/* faint warm corner bloom */}
      <div className="pointer-events-none absolute -top-24 right-[8%] h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto max-w-[1180px]">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between md:gap-12">
          {/* Brand */}
          <div className="flex flex-col items-center text-center md:items-start md:max-w-xs md:text-left">
            <Logo variant="full" className="h-24"/>
            <p className="mt-5 text-sm leading-relaxed text-muted">{t("foot.tagline")}</p>

            <div className="mt-5 flex flex-col items-center gap-2 md:items-start">
              <a href="tel:+97677000329" className="inline-flex items-center gap-2 text-sm text-ink/70 hover:text-accent transition-colors">
                <PhoneIcon className="text-accent" /> {t("foot.phone")}
              </a>
              <a href="mailto:support@naran.mn" className="inline-flex items-center gap-2 text-sm text-ink/70 hover:text-accent transition-colors">
                <MailIcon className="text-accent" /> support@naran.mn
              </a>
            </div>

            <div className="mt-6 flex gap-2.5">
              <Social href="https://instagram.com" label="Instagram"><IgIcon /></Social>
              <Social href="https://facebook.com" label="Facebook"><FbIcon /></Social>
            </div>
          </div>

          {/* Nav — only real destinations (placeholder About/Stores/Journal/FAQ removed). */}
          <nav className="grid w-full grid-cols-2 gap-8 text-center md:w-auto md:text-left">
            <FootCol title={t("foot.shop")} links={[["/shop?category=Fragrance",t("cat.Fragrance")],["/shop?category=Skincare",t("cat.Skincare")],["/shop?category=Makeup",t("cat.Makeup")],["/shop?category=Gift",t("cat.Gift")]]}/>
            <FootCol title={t("foot.support")} links={[["/shop",t("bc.shop")],["/refund-policy",t("foot.refund")],["/terms",t("foot.terms")],["/privacy",t("foot.privacy")]]}/>
          </nav>
        </div>

        {/* Payment */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-6 md:justify-start">
          <span className="mr-1 text-[11px] uppercase tracking-[.2em] text-subtle">{t("foot.payments")}</span>
          {["QPay", "Хаан банк", "TDB", "Голомт", "Most Money"].map((m) => (
            <span key={m} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[12px] text-ink/70">{m}</span>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-6 flex flex-col-reverse items-center gap-3 text-[13px] text-muted sm:flex-row sm:justify-between">
          <span>{t("foot.rights")}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            <Link href="/privacy" className="hover:text-accent transition-colors">{t("foot.privacy")}</Link>
            <Link href="/terms" className="hover:text-accent transition-colors">{t("foot.terms")}</Link>
            <Link href="/refund-policy" className="hover:text-accent transition-colors">{t("foot.refund")}</Link>
            <span className="hidden sm:inline text-line">·</span>
            <span className="text-[11px] uppercase tracking-[.15em] text-accent">{t("foot.slogan")}</span>
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
