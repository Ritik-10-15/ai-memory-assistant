/**
 * True in the public portfolio build (`npm run build:demo`): only the
 * homepage and its simulated demo are included, and links into the private
 * patient and caregiver app are replaced. Fixed at build time.
 */
export const PUBLIC_DEMO = import.meta.env.VITE_PUBLIC_DEMO === "true";
