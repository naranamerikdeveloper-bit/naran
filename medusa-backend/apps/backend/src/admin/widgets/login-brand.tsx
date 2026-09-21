import { defineWidgetConfig } from "@medusajs/admin-sdk";

// NARAN sun mark — white on the warm brand gradient badge.
const Sun = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.2" fill="#fff" stroke="none" />
    <path d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5" />
  </svg>
);

/**
 * NARAN sign-in header. The default Medusa logo + "Welcome to Medusa" heading are
 * hidden via CSS (see brand-theme.tsx) so this becomes the login hero: a large
 * sun logo, the NARAN wordmark, and a Mongolian welcome line.
 */
const LoginBrand = () => {
  return (
    <div className="mb-6 flex flex-col items-center gap-3.5 text-center">
      <span
        className="grid h-16 w-16 place-items-center rounded-[1.35rem] shadow-[0_14px_30px_-8px_rgba(143,75,64,.6)]"
        style={{ background: "linear-gradient(135deg,#D8A092 0%,#8F4B40 100%)" }}
      >
        <Sun />
      </span>
      <div className="flex flex-col items-center gap-1">
        <span className="text-ui-fg-base text-[30px] font-semibold leading-none tracking-tight">NARAN</span>
        <span className="text-ui-fg-subtle txt-compact-small">Гоо сайхны удирдлагын самбар</span>
      </div>
      <span className="text-ui-fg-muted txt-compact-small">Үргэлжлүүлэхийн тулд нэвтэрнэ үү</span>
    </div>
  );
};

export const config = defineWidgetConfig({
  zone: "login.before",
});

export default LoginBrand;
