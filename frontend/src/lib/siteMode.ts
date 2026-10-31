import { createContext, useContext } from "react";

/**
 * How the public homepage is being served. The full app (App.tsx) reads it
 * from a <meta> tag the server adds in sandbox mode, so the homepage still
 * makes no API calls; the static public demo build never sets it.
 */
export interface SiteMode {
  /** Visitors can sign up for their own sandbox on this server. */
  sandbox: boolean;
}

export const SiteModeContext = createContext<SiteMode>({ sandbox: false });

export function siteModeFromPage(): SiteMode {
  return { sandbox: document.querySelector('meta[name="memory-assistant-sandbox"]') !== null };
}

export function useSiteMode(): SiteMode {
  return useContext(SiteModeContext);
}
