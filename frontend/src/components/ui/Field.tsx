import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink " +
  "placeholder:text-ink-muted focus:border-primary-600 aria-[invalid=true]:border-danger-600";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  id: string;
  children: ReactNode;
}

function FieldShell({ label, hint, error, required, id, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger-700" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, hint, error, id, className, required, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} id={fieldId}>
      <input
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cn(control, className)}
        {...rest}
      />
    </FieldShell>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
};

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextAreaField(
  { label, hint, error, id, className, required, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} id={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cn(control, "resize-y", className)}
        {...rest}
      />
    </FieldShell>
  );
});
