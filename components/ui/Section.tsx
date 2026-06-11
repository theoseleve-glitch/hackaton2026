import { cn } from "@/lib/utils";

/** Centered max-width container with responsive gutters. */
export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-12", className)}>
      {children}
    </div>
  );
}

/** Semantic section wrapper with consistent vertical rhythm. */
export function Section({
  children,
  id,
  className,
  as: As = "section",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <As id={id} className={cn("relative scroll-mt-20 py-24 md:py-32", className)}>
      {children}
    </As>
  );
}
