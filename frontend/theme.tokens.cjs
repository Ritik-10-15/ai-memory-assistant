/**
 * Themeable colour tokens.
 *
 * Components use semantic Tailwind names (paper, card, ink, primary, sage…).
 * Each name is a CSS variable, so a theme is just a class that redefines the
 * variables — the same components render in either look:
 *
 *   album      (default)          warm paper, teal, terracotta, Fraunces
 *                                 → caregiver workspace
 *   companion  .theme-companion   mint, forest, plum, DM Serif Display
 *                                 → patient app (Phase 3), matching the
 *                                   public homepage (Phase 1)
 *
 * Every text/background pair used was checked against WCAG 2.2 AA in both.
 */
const album = {
  paper: "#FBF6EE",
  card: "#FFFDF9",
  "ink-DEFAULT": "#2E2A26",
  "ink-muted": "#675E56",
  "line-DEFAULT": "#E8DED1",
  "line-strong": "#8F8174",
  "primary-50": "#E9F2F0",
  "primary-100": "#D3E6E2",
  "primary-200": "#AFD0CA",
  "primary-600": "#2C6F6C",
  "primary-700": "#23605E",
  "primary-800": "#1B4D4B",
  "primary-900": "#143A39",
  "sage-50": "#EDF3EB",
  "sage-100": "#D9E6D5",
  "sage-200": "#B9CFB4",
  "sage-600": "#5A7A5E",
  "sage-700": "#46634A",
  "sky-50": "#EBF1F6",
  "sky-100": "#D4E1EC",
  "sky-600": "#3D6788",
  "sky-700": "#2F5675",
  "clay-50": "#FBEEE7",
  "clay-100": "#F4D9CC",
  "clay-200": "#EBBDA8",
  "clay-600": "#A84E2E",
  "clay-700": "#963F22",
};

/** Overrides for the patient companion theme (anything not listed is shared). */
const companion = {
  paper: "#F1F8EF", // mint
  card: "#FFFCF6", // cream
  "ink-DEFAULT": "#172721", // deep
  "ink-muted": "#5C6E65", // moss
  "line-DEFAULT": "#D7E5D2",
  "line-strong": "#7C8E84",
  // Primary actions: muted purple.
  "primary-50": "#F8EEF7",
  "primary-100": "#EFDCEE",
  "primary-200": "#DFBDDD",
  "primary-600": "#A04CA0",
  "primary-700": "#8A3A8A",
  "primary-800": "#733073",
  "primary-900": "#5C265C",
  // Recognised / calm confirmation: forest green.
  "sage-50": "#E8F2E5",
  "sage-100": "#D3E6CE",
  "sage-200": "#B4D2AC",
  "sage-600": "#3B6E57",
  "sage-700": "#285744",
  // Info / variety tone: warm sand instead of blue.
  "sky-50": "#FBF3E4",
  "sky-100": "#F5E6CC",
  "sky-600": "#8A5A1A",
  "sky-700": "#6E4A12",
  // Warm highlight → plum as well, so there is one accent colour.
  "clay-50": "#F8EEF7",
  "clay-100": "#EFDCEE",
  "clay-200": "#DFBDDD",
  "clay-600": "#A04CA0",
  "clay-700": "#8A3A8A",
};

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

function cssVars(map) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [`--c-${k}`, channels(v)]));
}

/** Tailwind `colors` entries pointing at the variables (opacity modifiers work). */
function tailwindColors() {
  const out = {};
  for (const key of Object.keys(album)) {
    const [name, shade] = key.includes("-") ? key.split("-") : [key, null];
    const value = `rgb(var(--c-${key}) / <alpha-value>)`;
    if (!shade) out[name] = value;
    else (out[name] ??= {})[shade] = value;
  }
  return out;
}

module.exports = { album, companion, cssVars, tailwindColors };
