import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-700 active:bg-navy-800",
  secondary: "border border-line bg-white text-navy hover:bg-brand-50 active:bg-brand-100",
  accent: "bg-care-500 text-white hover:bg-care-600",
  ghost: "text-navy hover:bg-brand-50",
  danger: "bg-danger-600 text-white hover:bg-danger-700",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm gap-1.5",
  md: "min-h-11 px-4 text-[15px] gap-2",
  lg: "min-h-12 px-5 text-base gap-2",
  // Patient controls: very large targets, well above the WCAG 2.5.8 minimum.
  xl: "min-h-16 px-7 text-xl gap-3",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-[1.1em] w-[1.1em] animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});
