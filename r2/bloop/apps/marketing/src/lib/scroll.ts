import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initSmoothScroll(): Lenis | null {
  if (prefersReducedMotion()) return null;
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function revealOnScroll(scope: HTMLElement): void {
  const targets = scope.querySelectorAll<HTMLElement>('[data-reveal]');
  if (prefersReducedMotion()) { gsap.set(targets, { opacity: 1, y: 0 }); return; }
  gsap.from(targets, {
    opacity: 0, y: 44, duration: 0.8, ease: 'power3.out', stagger: 0.1,
    scrollTrigger: { trigger: scope, start: 'top 80%' },
  });
}

export function pinScrub(section: HTMLElement, length = '+=120%'): gsap.core.Timeline {
  // Idempotent across re-renders: kill any prior trigger for this section before recreating.
  ScrollTrigger.getById(section.id)?.kill();
  const tl = gsap.timeline({
    scrollTrigger: {
      id: section.id, trigger: section, start: 'top top', end: length,
      pin: !prefersReducedMotion(), scrub: prefersReducedMotion() ? false : 1,
    },
  });
  return tl;
}
