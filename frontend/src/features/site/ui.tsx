import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/lib/cn";

type Tone = "plum" | "forest" | "outline" | "outline-light" | "ghost";

const tones: Record<Tone, string> = {
  plum: "bg-plum text-white shadow-soft hover:bg-plum-700 active:translate-y-px",
  forest: "bg-forest text-white hover:bg-forest-700 active:translate-y-px",
  outline: "border border-forest/30 bg-cream/60 text-forest hover:border-forest hover:bg-cream active:translate-y-px",
  "outline-light": "border border-white/40 text-white hover:border-white hover:bg-white/10 active:translate-y-px",
  ghost: "text-forest hover:bg-mint-100",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,border-color,transform,box-shadow] duration-200";

const sizes = { md: "min-h-11 px-5 text-[15px]", lg: "min-h-[3.25rem] px-7 text-base" };

export function pillClass(tone: Tone = "plum", size: keyof typeof sizes = "md", className?: string) {
  return cn(base, tones[tone], sizes[size], className);
}

/** In-page or external link styled as a pill button. */
export function PillAnchor({
  tone = "plum",
  size = "md",
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { tone?: Tone; size?: keyof typeof sizes }) {
  return (
    <a className={pillClass(tone, size, className)} {...rest}>
      {children}
    </a>
  );
}

/** App route styled as a pill button. */
export function PillLink({
  tone = "plum",
  size = "md",
  className,
  children,
  ...rest
}: LinkProps & { tone?: Tone; size?: keyof typeof sizes }) {
  return (
    <Link className={pillClass(tone, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={cn(
        "text-sm font-semibold uppercase tracking-[0.14em]",
        light ? "text-mint-200" : "text-plum-700",
      )}
    >
      {children}
    </p>
  );
}

/** Section heading block: eyebrow, editorial serif title, supporting line. */
export function SectionIntro({
  id,
  eyebrow,
  title,
  children,
  light = false,
  align = "left",
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  light?: boolean;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className={cn(
          "mt-3 font-display text-4xl font-normal leading-[1.08] tracking-[-0.01em] sm:text-5xl",
          light ? "text-cream" : "text-deep",
        )}
      >
        {title}
      </h2>
      {children && (
        <p className={cn("mt-4 text-lg leading-relaxed", light ? "text-mint-100" : "text-moss")}>{children}</p>
      )}
    </div>
  );
}

/**
 * Fade-and-rise as the element scrolls into view, once. Without
 * IntersectionObserver (or with reduced motion, handled in CSS) content is
 * simply shown — nothing is ever hidden from people who can't see motion.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      data-visible={visible}
      className={cn("site-reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
