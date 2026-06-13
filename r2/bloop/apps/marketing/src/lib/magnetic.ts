import { prefersReducedMotion } from './scroll';
import gsap from 'gsap';

export function magnetize(node: HTMLElement, radius = 80): void {
  if (node.dataset.mag) return;                         // idempotent: don't double-bind on re-render
  if (prefersReducedMotion() || matchMedia('(pointer: coarse)').matches) return;
  node.dataset.mag = '1';
  node.addEventListener('mousemove', (e) => {
    const r = node.getBoundingClientRect();
    const mx = e.clientX - (r.left + r.width / 2);
    const my = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(mx, my) < radius + Math.max(r.width, r.height) / 2)
      gsap.to(node, { x: mx * 0.3, y: my * 0.3, duration: 0.4, ease: 'power3.out' });
  });
  node.addEventListener('mouseleave', () =>
    gsap.to(node, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' }));
}
