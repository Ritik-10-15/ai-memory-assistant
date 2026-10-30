import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, LogIn, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { PillAnchor } from "./ui";

export const SECTIONS = [
  { id: "top", label: "Home" },
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "about", label: "About" },
] as const;

/** Which section is in the middle of the viewport (for the active link). */
function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.01] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl",
          light ? "bg-cream text-forest" : "bg-forest text-mint",
        )}
      >
        <HeartHandshake className="h-[1.35rem] w-[1.35rem]" aria-hidden="true" />
      </span>
      <span className="leading-none">
        <span className={cn("block font-display text-[1.35rem]", light ? "text-cream" : "text-deep")}>Memory Assistant</span>
        <span className={cn("mt-1 block text-[11px] font-semibold uppercase tracking-[0.18em]", light ? "text-mint-200" : "text-moss")}>
          AI · Recognise · Remember
        </span>
      </span>
    </span>
  );
}

export function SiteNav() {
  const ids = SECTIONS.map((s) => s.id);
  const active = useActiveSection([...ids, "demo"]);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu and returns focus to its button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = (id: string) =>
    cn(
      "relative rounded-full px-3 py-2 text-[15px] font-medium transition-colors",
      "after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:origin-left after:rounded-full after:bg-forest after:transition-transform",
      active === id ? "text-deep after:scale-x-100" : "text-moss after:scale-x-0 hover:text-deep hover:after:scale-x-100",
    );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300",
        scrolled || open ? "border-b border-forest/10 bg-mint/90 shadow-soft backdrop-blur" : "border-b border-transparent bg-mint",
      )}
    >
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <a href="#top" className="rounded-2xl" aria-label="Memory Assistant, back to top">
          <Brand />
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={linkClass(s.id)} aria-current={active === s.id ? "location" : undefined}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            to="/caregiver/login"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-forest hover:bg-mint-100"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Caregiver login
          </Link>
          <PillAnchor href="#demo" aria-current={active === "demo" ? "location" : undefined}>
            Try demo
          </PillAnchor>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-deep hover:bg-mint-100 lg:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </nav>

      {open && (
        <div id="site-menu" className="border-t border-forest/10 bg-mint px-5 pb-6 pt-2 lg:hidden">
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setOpen(false)}
                  aria-current={active === s.id ? "location" : undefined}
                  className={cn(
                    "flex min-h-12 items-center rounded-2xl px-4 text-lg font-medium",
                    active === s.id ? "bg-mint-100 text-deep" : "text-moss hover:bg-mint-100 hover:text-deep",
                  )}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PillAnchor href="#demo" size="lg" onClick={() => setOpen(false)}>
              Try demo
            </PillAnchor>
            <Link
              to="/caregiver/login"
              className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full border border-forest/30 font-semibold text-forest hover:border-forest"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Caregiver login
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
