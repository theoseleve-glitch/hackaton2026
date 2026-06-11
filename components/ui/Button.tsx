"use client";

import { ArrowRight } from "lucide-react";
import { Magnetic } from "@/components/motion/Magnetic";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Common = {
  children: React.ReactNode;
  variant?: Variant;
  arrow?: boolean;
  magnetic?: boolean;
  className?: string;
};

const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-sm font-mono text-small font-medium uppercase tracking-[0.12em] transition-colors duration-[var(--duration-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 min-h-[48px] px-6";

const variants: Record<Variant, string> = {
  // Highest-contrast interactive element on the page — Commerce-mode primary.
  primary: "bg-accent text-paper hover:bg-accent-dim active:bg-accent-press",
  secondary: "border border-border bg-transparent text-ink hover:border-accent hover:text-accent",
  ghost: "bg-transparent text-ink-dim hover:text-accent px-0 min-h-0 tracking-[0.14em]",
};

function Inner({ children, arrow }: { children: React.ReactNode; arrow?: boolean }) {
  return (
    <>
      <span>{children}</span>
      {arrow && (
        <ArrowRight
          className="h-4 w-4 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-expo)] group-hover:translate-x-1"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </>
  );
}

export function Button(
  props: Common &
    (
      | ({ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>)
      | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
    ),
) {
  const { children, variant = "primary", arrow = true, magnetic = true, className, ...rest } = props;
  const cls = cn(base, variants[variant], className);

  const node =
    "href" in props && props.href !== undefined ? (
      <a className={cls} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        <Inner arrow={arrow}>{children}</Inner>
      </a>
    ) : (
      <button className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        <Inner arrow={arrow}>{children}</Inner>
      </button>
    );

  if (magnetic && variant !== "ghost") {
    return <Magnetic className="inline-block">{node}</Magnetic>;
  }
  return node;
}
