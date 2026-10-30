import type { ReactNode } from "react";

/** A calm, large message for empty, loading-failed or offline situations. */
export function PatientEmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-line bg-card px-6 py-12 text-center shadow-card">
      {icon && <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-sage-50 text-sage-700">{icon}</div>}
      <p className="font-serif text-3xl font-semibold text-ink">{title}</p>
      {text && <p className="mt-3 max-w-lg text-xl text-ink">{text}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
