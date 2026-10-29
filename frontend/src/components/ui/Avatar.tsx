import { useState } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const sizes = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-28 w-28 text-3xl",
  "2xl": "h-40 w-40 text-5xl",
};

// Warm monogram tones (each pair ≥ 4.5:1). A person always gets the same
// tone, so a familiar face keeps a familiar colour even without a photo.
const TONES = [
  "bg-clay-100 text-clay-700",
  "bg-sage-100 text-sage-700",
  "bg-sky-100 text-sky-700",
  "bg-primary-100 text-primary-800",
];

export function toneFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** Person photo with a warm monogram fallback (no photo, or it fails to load). */
export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImg = src && failedSrc !== src;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-serif font-semibold",
        showImg ? "bg-paper" : toneFor(name),
        sizes[size],
        className,
      )}
    >
      {showImg ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </div>
  );
}
