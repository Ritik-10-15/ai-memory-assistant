import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Alert } from "./Alert";
import { Button } from "./Button";

export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 py-10 text-ink-muted", className)}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-line/70", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-navy">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      tone="error"
      title="Something went wrong"
      action={
        onRetry && (
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            onClick={onRetry}
          >
            Retry
          </Button>
        )
      }
    >
      {message}
    </Alert>
  );
}
