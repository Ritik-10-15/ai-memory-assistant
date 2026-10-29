import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./Button";

/** Navigation that looks like a button (a real link, so no nested controls). */
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, `gap-2 ${className ?? ""}`)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
