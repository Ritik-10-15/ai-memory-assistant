import type { Config } from "tailwindcss";

/**
 * "Family album" design tokens — warm paper, sage, soft teal, warm blue and
 * a terracotta highlight. Every text/background pair used in the app was
 * checked against WCAG 2.2 AA (4.5:1 text, 3:1 UI/icons); see README.
 *
 * Roles:
 *   primary  soft teal — main actions, links, focus
 *   sage     recognised / success / calm confirmation
 *   sky      warm blue — informational accents
 *   clay     terracotta — warm highlights (featured memory, emphasis)
 *   caution  "not sure" states
 *   danger   destructive actions and errors
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF6EE",
        card: "#FFFDF9",
        ink: { DEFAULT: "#2E2A26", muted: "#675E56" },
        line: { DEFAULT: "#E8DED1", strong: "#8F8174" },
        primary: {
          50: "#E9F2F0",
          100: "#D3E6E2",
          200: "#AFD0CA",
          600: "#2C6F6C",
          700: "#23605E",
          800: "#1B4D4B",
          900: "#143A39",
        },
        sage: { 50: "#EDF3EB", 100: "#D9E6D5", 200: "#B9CFB4", 600: "#5A7A5E", 700: "#46634A" },
        sky: { 50: "#EBF1F6", 100: "#D4E1EC", 600: "#3D6788", 700: "#2F5675" },
        clay: { 50: "#FBEEE7", 100: "#F4D9CC", 200: "#EBBDA8", 600: "#A84E2E", 700: "#963F22" },
        caution: { 50: "#FFF4DE", 100: "#F7E3B8", 600: "#A86F0C", 700: "#835400" },
        danger: { 50: "#FBEBE8", 100: "#F3D0CA", 600: "#B13B2D", 700: "#93301F" },
      },
      fontFamily: {
        sans: ['"Nunito Sans Variable"', '"Nunito Sans"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        serif: ['"Fraunces Variable"', "Fraunces", "Georgia", "serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        card: "0 1px 2px rgba(70, 50, 30, 0.05), 0 2px 8px rgba(70, 50, 30, 0.04)",
        raised: "0 6px 20px rgba(70, 50, 30, 0.10)",
        photo: "0 2px 4px rgba(70, 50, 30, 0.08), 0 10px 24px rgba(70, 50, 30, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
