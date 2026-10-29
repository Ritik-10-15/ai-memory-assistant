import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  MonitorSmartphone,
  ScanFace,
  Settings,
  Users,
  X,
} from "lucide-react";
import { api } from "@/api/client";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/caregiver", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/caregiver/people", label: "Registered people", icon: Users },
  { to: "/caregiver/enroll", label: "Face enrollment", icon: ScanFace },
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
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                isActive ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10 hover:text-white",
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

function SidebarFooter({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="space-y-1 border-t border-white/15 pt-4">
      <Link
        to="/"
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-white/90 hover:bg-white/10 hover:text-white"
      >
        <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />
        Patient screen
      </Link>
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-white/90 hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-ink">
        <HeartHandshake className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="font-semibold text-white">Memory Assistant</p>
        <p className="text-sm text-white/90">Caregiver workspace</p>
      </div>
    </div>
  );
}

export function CaregiverLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation, and move focus to the new page.
  useEffect(() => {
    setMenuOpen(false);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [location.pathname]);

  async function signOut() {
    await api.caregiverLogout().catch(() => undefined);
    navigate("/caregiver/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-8 bg-primary-700 px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav aria-label="Caregiver" className="flex-1">
          <NavItems />
        </nav>
        <SidebarFooter onSignOut={signOut} />
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 bg-primary-700 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <Brand />
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-xl p-2 text-white hover:bg-white/10"
          >
            {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Caregiver" className="mt-3 space-y-4 pb-2">
            <NavItems onNavigate={() => setMenuOpen(false)} />
            <SidebarFooter onSignOut={signOut} />
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
