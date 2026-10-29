import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-paper text-ink-muted border-line",
  info: "bg-primary-50 text-primary-700 border-primary-100",
  success: "bg-sage-50 text-sage-700 border-sage-100",
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
