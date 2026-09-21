import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useEffect } from "react";

/**
 * NARAN brand theme for the Medusa admin. Medusa's built-in accent is blue
 * (--fg/bg/border-interactive = rgba(59,130,246)); this recolors it to NARAN's
 * warm accent so links, focus rings, active nav items and selected states match
 * the storefront brand. Injected as a single <style> in <head> (persists across
 * client-side navigation), and mounted on the same broad zones as the language
 * toggle — including `login.before`, so branding shows from the login screen on.
 *
 * `!important` on the custom-property declarations makes this :root block win in
 * both light and dark mode without having to duplicate the .dark selector.
 */
const BRAND_CSS = `
:root {
  --fg-interactive: rgba(209, 53, 111, 1) !important;        /* #D1356F */
  --fg-interactive-hover: rgba(174, 34, 87, 1) !important;   /* #AE2257 */
  --bg-interactive: rgba(174, 34, 87, 1) !important;
  --border-interactive: rgba(174, 34, 87, 1) !important;
}
/* Login page: hide Medusa's default logo + "Welcome to Medusa" heading/subtitle
   (the first two children of the max-w-[280px] login column) so the NARAN sign-in
   header renders as the hero. Best-effort — a no-op if Medusa changes the markup. */
[class*="min-h-dvh"] [class*="max-w-[280px]"] > :first-child,
[class*="min-h-dvh"] [class*="max-w-[280px]"] > :nth-child(2) {
  display: none !important;
}
/* Active sidebar nav item → NARAN orange accent. React Router's NavLink sets
   aria-current="page" on the active link, so this reliably tints the active
   route's label + icon warm and adds a soft orange rail, without depending on
   Medusa's (minified) active class names. Best-effort: no-op if absent. */
nav a[aria-current="page"] {
  color: var(--fg-interactive) !important;
  background-image: linear-gradient(rgba(174, 34, 87,.08), rgba(174, 34, 87,.08)) !important;
  box-shadow: inset 2px 0 0 0 var(--fg-interactive) !important;
}
nav a[aria-current="page"] svg {
  color: var(--fg-interactive) !important;
}
/* Sidebar store badge → NARAN sun mark. Targets the store-header button's first
   (24px avatar) cell via its distinctive arbitrary grid template. Best-effort:
   if Medusa changes this structure the rule simply no-ops. A white sun sits over
   the warm gradient; the gradient alone still brands the badge if the SVG fails. */
[class*="1fr_15px"] > :first-child > * {
  background-image:
    url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23fff'%20stroke-width='2.2'%20stroke-linecap='round'%3E%3Ccircle%20cx='12'%20cy='12'%20r='4.2'%20fill='%23fff'/%3E%3Cpath%20d='M12%203v2M12%2019v2M5%205l1.5%201.5M17.5%2017.5L19%2019M3%2012h2M19%2012h2M5%2019l1.5-1.5M17.5%206.5L19%205'/%3E%3C/svg%3E"),
    linear-gradient(135deg, #F07CA5 0%, #AE2257 100%) !important;
  background-size: 66% 66%, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
  border-radius: 6px !important;
  color: transparent !important;
}
`;

const BrandTheme = () => {
  useEffect(() => {
    const ID = "naran-brand-theme";
    if (typeof document === "undefined" || document.getElementById(ID)) return;
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = BRAND_CSS;
    document.head.appendChild(style);
  }, []);
  return null;
};

export const config = defineWidgetConfig({
  zone: [
    "login.before",
    "order.list.before",
    "product.list.before",
    "customer.list.before",
    "inventory_item.list.before",
    "promotion.list.before",
    "price_list.list.before",
    "customer_group.list.before",
    "product_collection.list.before",
    "product_category.list.before",
    "campaign.list.before",
    "reservation.list.before",
    "user.list.before",
    "sales_channel.list.before",
    "region.list.before",
    "tax.list.before",
    "return_reason.list.before",
  ],
});

export default BrandTheme;
