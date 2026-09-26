import { defineWidgetConfig } from "@medusajs/admin-sdk";
import naranLogo from "../assets/naran-logo.png";

/**
 * NARAN sign-in header. The default Medusa logo + "Welcome to Medusa" heading are
 * hidden via CSS (see brand-theme.tsx) so this becomes the login hero: the real
 * shop wordmark and a Mongolian welcome line.
 */
const LoginBrand = () => {
  return (
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      <img src={naranLogo} alt="Naran Amerik Baraa" className="h-16 w-auto" />
      <span className="text-ui-fg-subtle txt-compact-small">Гоо сайхны удирдлагын самбар</span>
      <span className="text-ui-fg-muted txt-compact-small">Үргэлжлүүлэхийн тулд нэвтэрнэ үү</span>
    </div>
  );
};

export const config = defineWidgetConfig({
  zone: "login.before",
});

export default LoginBrand;
