import { el } from '../lib/dom';
import gsap from 'gsap';
import { prefersReducedMotion } from '../lib/scroll';

export function runPreloader(onDone: () => void): void {
  const pct = el('span', { class: 'pre__pct' }, '0');
  const overlay = el('div', { class: 'pre' },
    el('div', { class: 'pre__logo' }, 'bloop', el('span', { class: 'nav__dot' }, '.')), pct);
  document.body.appendChild(overlay);
  if (prefersReducedMotion()) { overlay.remove(); onDone(); return; }
  const o = { v: 0 };
  gsap.to(o, { v: 100, duration: 1.8, ease: 'power2.inOut',
    onUpdate: () => (pct.textContent = String(Math.round(o.v))),
    onComplete: () => gsap.to(overlay, { yPercent: -100, duration: 0.6, ease: 'power4.inOut',
      onComplete: () => { overlay.remove(); onDone(); } }) });
}
