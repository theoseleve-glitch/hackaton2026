"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useScroll, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/icons/Logo";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Section";
import { nav } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Nav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > prev && y > 140 && !open);
    setScrolled(y > 24);
  });

  return (
    <>
      <motion.header
        initial={{ y: 0 }}
        animate={{ y: hidden ? "-110%" : "0%" }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
          scrolled && "border-b border-border bg-paper/80 backdrop-blur-md",
        )}
      >
        <Container className="flex h-16 items-center justify-between">
          <a href="#top" aria-label="Fuel the Season — home" data-cursor>
            <Logo />
          </a>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Sections">
            {nav.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-mono text-caption uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-accent"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:block">
            <Button href={nav.cta.href} className="min-h-[40px] px-5">
              {nav.cta.label}
            </Button>
          </div>

          <button
            className="md:hidden text-ink"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu strokeWidth={1.5} />
          </button>
        </Container>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] flex flex-col bg-paper md:hidden"
          >
            <Container className="flex h-16 items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-ink">
                <X strokeWidth={1.5} />
              </button>
            </Container>
            <nav className="flex flex-1 flex-col justify-center gap-2 px-6" aria-label="Sections">
              {nav.links.map((l, i) => (
                <motion.a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display text-display-lg font-extrabold tracking-tight text-ink"
                >
                  {l.label}
                </motion.a>
              ))}
              <div className="mt-10">
                <Button href={nav.cta.href} onClick={() => setOpen(false)}>
                  {nav.cta.label}
                </Button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
