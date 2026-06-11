"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const container = {
  hidden: {},
  show: (gap: number) => ({ transition: { staggerChildren: gap } }),
};

const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.66, ease: [0.16, 1, 0.3, 1] } },
};

/** Container that staggers its <StaggerItem> children into view. */
export function Stagger({
  children,
  className,
  gap = 0.09,
  amount = 0.25,
}: {
  children: React.ReactNode;
  className?: string;
  gap?: number;
  amount?: number;
}) {
  return (
    <motion.div
      className={cn(className)}
      variants={container}
      custom={gap}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={cn(className)} variants={item}>
      {children}
    </motion.div>
  );
}
