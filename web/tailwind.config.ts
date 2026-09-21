import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1320px" } },
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        serif:   ["var(--font-serif)", "system-ui", "sans-serif"],
        sans:    ["var(--font-body)", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink:       "#0E0F10",
        graphite:  "#16171A",
        charcoal:  "#1F2024",
        frost:     { DEFAULT: "#E9E9EB", deep: "#DBDBDE" },
        haze:      "#EDEDEF",
        cloud:     "#EDEDEF",
        mist:      "#F0F0F2",
        paper:     "#FFFFFF",
        accent:    { DEFAULT: "#E76F61", deep: "#D35A4C", soft: "#FDEDEA" },
        // Soft coral-peach palette (pastel perfume-ad look): accent = coral button
        // colour tuned to 4.5:1 with white text; petal = light peach for highlights.
        petal:     { DEFAULT: "#F6B8AA", light: "#FFF5F2" },
        lime:      { DEFAULT: "#D7F26B", deep: "#BFE03E", dark: "#9FBF24" },
        camel:     { DEFAULT: "#C19A6B", deep: "#A87E4E" },
        muted:     "#5C5F63",
        subtle:    "#5C6166", // meets WCAG AA on white AND the light frost page bg (~4.5:1+)
        line:      "rgba(14,15,16,0.09)",
        surface: { 0:"#E9E9EB", 1:"#FFFFFF", 2:"#F0F0F2", 3:"#EAEAEC", dark:"#0E0F10" },
      },
      borderRadius: {
        "2xl": "1.25rem", "3xl": "1.75rem", "4xl": "2.5rem", pill: "999px",
      },
      boxShadow: {
        hair: "0 1px 0 rgba(10,10,11,.04)",
        soft: "0 1px 2px rgba(10,10,11,.04)",
        card: "0 4px 14px rgba(10,10,11,.06)",
        lift: "0 12px 32px rgba(10,10,11,.08)",
        deep: "0 24px 60px rgba(10,10,11,.12)",
        cinematic: "0 40px 80px -20px rgba(10,10,11,.5)",
        glow: "0 12px 40px rgba(46,91,255,.18)",
        lime: "0 10px 22px rgba(191,224,62,.45)",
        innerline: "inset 0 0 0 1px rgba(255,255,255,.08)",
      },
      letterSpacing: {
        "tightest": "-0.05em",
      },
      keyframes: {
        floaty:   { "0%,100%": { transform: "translateY(0) rotate(0)" }, "50%": { transform: "translateY(-14px) rotate(-1.5deg)" } },
        spin360:  { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
        pop:      { from: { transform: "scale(.4)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
        marquee:  { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        shimmer:  { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        rise:     { from: { transform: "translateY(40px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
      animation: {
        floaty: "floaty 7s ease-in-out infinite",
        spin360: "spin360 40s linear infinite",
        pop:    "pop 600ms cubic-bezier(.34,1.56,.64,1)",
        marquee:"marquee 32s linear infinite",
        shimmer:"shimmer 2.6s linear infinite",
        rise:   "rise 700ms cubic-bezier(.22,.61,.36,1) both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(.34,1.56,.64,1)",
        elegant: "cubic-bezier(.22,.61,.36,1)",
      },
      backgroundImage: {
        grain: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0, 0 0 0 0 0, 0 0 0 0 0, 0 0 0 0.12 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>\")",
      },
    },
  },
  plugins: [],
};
export default config;
