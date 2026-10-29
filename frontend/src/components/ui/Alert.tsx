import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const styles: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-primary-100 bg-primary-50 text-ink", Icon: Info },
  success: { box: "border-sage-100 bg-sage-50 text-sage-700", Icon: CheckCircle2 },
  warning: { box: "border-caution-100 bg-caution-50 text-caution-700", Icon: AlertTriangle },
  error: { box: "border-danger-100 bg-danger-50 text-danger-700", Icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[tone];
  // Errors interrupt (role=alert); everything else is announced politely.
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? "mt-0.5" : undefined)}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
