import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-canvas text-ink-muted border-line",
  info: "bg-brand-50 text-brand-600 border-brand-100",
  success: "bg-care-50 text-care-600 border-care-100",
  warning: "bg-caution-50 text-caution-700 border-caution-100",
  danger: "bg-danger-50 text-danger-700 border-danger-100",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
