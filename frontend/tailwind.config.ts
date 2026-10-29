import type { Config } from "tailwindcss";

// Design tokens. Contrast (WCAG 2.2) was checked for every text/background
// pair used: brand-500 and care-500 reach 4.7:1 on white, so on the gray
// canvas they are used only as fills (white text) — text on the canvas uses
// brand-600 / care-600 or navy.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#173B63", 700: "#122F50", 800: "#0D233C" },
        brand: { 50: "#EBF3FA", 100: "#D6E6F4", 500: "#3478B4", 600: "#2A6597" },
        care: { 50: "#E6F4EF", 100: "#CDE9DF", 500: "#168365", 600: "#0F6B52" },
        canvas: "#F5F8FC",
        line: "#DCE3EC",
        ink: { DEFAULT: "#1F2A37", muted: "#5B6B7F" },
        caution: { 50: "#FFF4E0", 100: "#FDE6BF", 600: "#B26A00", 700: "#8A4B00" },
        danger: { 50: "#FDECEA", 100: "#F9D3CF", 600: "#C0362C", 700: "#A3261F" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        card: "0 1px 2px rgba(23, 59, 99, 0.06), 0 1px 3px rgba(23, 59, 99, 0.04)",
        raised: "0 4px 12px rgba(23, 59, 99, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
