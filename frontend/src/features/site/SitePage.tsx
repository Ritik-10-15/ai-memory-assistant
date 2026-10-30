import { useEffect } from "react";
import { DemoAlbums } from "./demo/DemoAlbums";
import { DemoExperience } from "./demo/DemoExperience";
import { About, Features, Hero, HowItWorks, SiteFooter } from "./Sections";
import { SiteNav } from "./SiteNav";
import "./site.css";

/**
 * Public homepage (/welcome): what Memory Assistant is, how it works, and a
 * simulated demo. Self-contained — it reads no patient data and never opens
 * the camera; the real patient app (/) and caregiver workspace are separate.
 */
export default function SitePage() {
  useEffect(() => {
    document.title = "Memory Assistant · Every familiar face holds a story";
  }, []);

  return (
    <div className="site-root min-h-screen bg-mint font-body text-deep antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-cream focus:px-5 focus:py-3 focus:font-semibold focus:text-deep focus:shadow-lift"
      >
        Skip to main content
      </a>
      <SiteNav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <HowItWorks />
        <Features />
        <DemoExperience />
        <DemoAlbums />
        <About />
      </main>
      <SiteFooter />
    </div>
  );
}
