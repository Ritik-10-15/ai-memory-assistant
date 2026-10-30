import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";

/** Switch between albums and the whole photo library. */
export function AlbumTabs() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold transition-colors",
      isActive ? "bg-sage-700 text-white" : "text-ink hover:bg-sage-50",
    );
  return (
    <nav aria-label="Albums and photos" className="mb-8">
      <ul className="inline-flex gap-1 rounded-full border border-line bg-card p-1">
        <li>
          <NavLink to="/caregiver/albums" end className={tab}>
            Albums
          </NavLink>
        </li>
        <li>
          <NavLink to="/caregiver/photos" className={tab}>
            All photos
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
