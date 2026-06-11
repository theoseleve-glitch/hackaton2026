"use client";

import { MotionConfig } from "framer-motion";
import { SmoothScroll } from "./SmoothScroll";
import { Cursor } from "./Cursor";
import { Grain } from "./Grain";

/** Client-side shell: reduced-motion config, smooth scroll, cursor, grain. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SmoothScroll>{children}</SmoothScroll>
      <Cursor />
      <Grain />
    </MotionConfig>
  );
}
