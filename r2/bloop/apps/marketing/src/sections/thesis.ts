import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { pinScrub, prefersReducedMotion } from '../lib/scroll';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { burstConfetti } from '../lib/confetti';
import gsap from 'gsap';

export function buildThesis(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'thesis');
  const line = el('h2', { class: 'h-display thesis__line', 'data-i18n': 'thesis.line' }, t('thesis.line', locale));
  const echo = el('p', { class: 'thesis__echo', 'data-i18n': 'thesis.echo' }, t('thesis.echo', locale));
  const rows = ['63%', '37%'].map((p, i) =>
    el('div', { class: 'vote', 'data-vote': String(i) },
      el('span', { class: 'vote__bar', style: `--p:${p}` }),
      el('span', { class: 'vote__pct' }, p)));
  const stage = el('div', { class: 'thesis__stage' }, ...rows);
  root.append(stage, line, echo);

  const tl = pinScrub(root);
  if (!prefersReducedMotion()) {
    tl.from(stage.querySelectorAll('.vote__bar'), { scaleX: 0, transformOrigin: 'left', stagger: 0.15, duration: 0.4 })
      .from(line, { scale: 0.6, opacity: 0, ease: 'back.out(2)', duration: 0.3 }, '>-0.1');
  } else {
    gsap.set(stage.querySelectorAll('.vote__bar'), { scaleX: 1 });
  }

  if (!prefersReducedMotion()) {
    ScrollTrigger.create({
      trigger: root, start: 'top 45%', once: true,
      onEnter: () => burstConfetti(root),
    });
  }
}
