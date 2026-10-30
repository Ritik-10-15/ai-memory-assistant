import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  HeartHandshake,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  MonitorSmartphone,
  ScanFace,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/cn";
import { useApplyPreferences, usePreferences } from "./preferences";

export const NAV = [
  { to: "/caregiver", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/caregiver/people", label: "Loved ones", icon: Users },
  { to: "/caregiver/enroll", label: "Face enrollment", icon: ScanFace },
  { to: "/caregiver/photos", label: "Family photos", icon: Images },
  { to: "/caregiver/memories", label: "Memories", icon: MessageSquareText },
  { to: "/caregiver/visits", label: "Visit history", icon: CalendarClock },
  { to: "/caregiver/settings", label: "Settings", icon: Settings },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-medium transition-colors",
                isActive
                  ? "bg-sage-50 font-semibold text-sage-700 before:absolute before:inset-y-2.5 before:left-0 before:w-1 before:rounded-full before:bg-primary-600"
                  : "text-ink-muted hover:bg-paper hover:text-ink",
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function AccountPanel({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="rounded-3xl border border-line bg-paper p-3">
      <div className="flex items-center gap-3 px-1 pb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-sage-700">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="font-semibold text-ink">Caregiver</p>
          <p className="text-sm text-ink-muted">Signed in</p>
        </div>
      </div>
      <div className="space-y-1 border-t border-line pt-2">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium text-ink hover:bg-card"
        >
          <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />
          Patient screen
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-medium text-ink hover:bg-card"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/caregiver" className="flex items-center gap-3 rounded-2xl">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage-700 text-white">
        <HeartHandshake className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block font-serif text-xl text-ink">Memory Assistant</span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Caregiver workspace</span>
      </span>
    </Link>
  );
}

export function CaregiverLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefs] = usePreferences();
  useApplyPreferences(prefs);

  // Close the mobile menu on navigation, and move focus to the new page.
  useEffect(() => {
    setMenuOpen(false);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function signOut() {
    await api.caregiverLogout().catch(() => undefined);
    navigate("/caregiver/login", { replace: true });
  }

  return (
    <div className="theme-companion min-h-screen bg-paper font-sans text-ink lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-5 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-raised"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <div className="hidden border-r border-line bg-card lg:block">
        <aside className="sticky top-0 flex h-screen flex-col gap-8 px-4 py-6">
          <div className="px-2">
            <Brand />
          </div>
          <nav aria-label="Caregiver" className="flex-1 overflow-y-auto">
            <NavItems />
          </nav>
          <AccountPanel onSignOut={signOut} />
        </aside>
      </div>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between">
          <Brand />
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-paper"
          >
            {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Caregiver" className="mt-3 space-y-4 pb-2">
            <NavItems onNavigate={() => setMenuOpen(false)} />
            <AccountPanel onSignOut={signOut} />
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
