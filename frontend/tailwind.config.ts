import type { Config } from "tailwindcss";

import plugin from "tailwindcss/plugin";
import { album, companion, cssVars, tailwindColors } from "./theme.tokens.cjs";

/**
 * Design tokens. The core palette (paper, card, ink, line, primary, sage,
 * sky, clay) is themeable through CSS variables — see theme.tokens.cjs:
 *   album      default            → caregiver workspace
 *   companion  .theme-companion   → patient app (mint / forest / plum)
 * Roles: primary = main actions, links, focus; sage = recognised/success;
 * sky = info; clay = warm highlight; caution = "not sure"; danger = errors.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ...tailwindColors(),
        caution: { 50: "#FFF4DE", 100: "#F7E3B8", 600: "#A86F0C", 700: "#835400" },
        danger: { 50: "#FBEBE8", 100: "#F3D0CA", 600: "#B13B2D", 700: "#93301F" },

        // Public homepage (/welcome). Contrast: deep on mint 14.4:1, moss on
        // mint 5.0:1, forest on mint 7.7:1, white on plum 5.2:1, plum text on
        // mint 4.8:1 (plum-700 for small text: 6.4:1).
        mint: { DEFAULT: "#F1F8EF", 100: "#E3F0DF", 200: "#CFE4C9" },
        forest: { DEFAULT: "#285744", 700: "#1F4535", 800: "#183628" },
        deep: "#172721",
        moss: "#5C6E65",
        plum: { DEFAULT: "#A04CA0", 50: "#F8EEF7", 100: "#EFDCEE", 700: "#8A3A8A" },
        cream: "#FFFCF6",
      },
      fontFamily: {
        // Themeable: album = Nunito Sans + Fraunces, companion = Inter + DM Serif Display.
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        display: ['"DM Serif Display"', "Georgia", "serif"],
        body: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        card: "0 1px 2px rgba(70, 50, 30, 0.05), 0 2px 8px rgba(70, 50, 30, 0.04)",
        raised: "0 6px 20px rgba(70, 50, 30, 0.10)",
        photo: "0 2px 4px rgba(70, 50, 30, 0.08), 0 10px 24px rgba(70, 50, 30, 0.08)",
        soft: "0 1px 2px rgba(23, 39, 33, 0.05), 0 8px 24px rgba(23, 39, 33, 0.06)",
        lift: "0 2px 6px rgba(23, 39, 33, 0.06), 0 24px 48px -12px rgba(23, 39, 33, 0.18)",
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": {
          ...cssVars(album),
          "--font-sans": '"Nunito Sans Variable", "Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
          "--font-serif": '"Fraunces Variable", Fraunces, Georgia, serif',
        },
        ".theme-companion": {
          ...cssVars(companion),
          "--font-sans": '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
          "--font-serif": '"DM Serif Display", Georgia, serif',
        },
      });
    }),
  ],
} satisfies Config;
