import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { splitChars } from '../lib/splitText';
import gsap from 'gsap';
import { prefersReducedMotion } from '../lib/scroll';

export function buildHero(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'hero');
  const head = el('h1', { class: 'h-hero hero__head', 'data-i18n': 'hero.headline' }, t('hero.headline', locale));
  const cta = el('a', { class: 'btn', href: '#download', 'data-i18n': 'hero.cta', 'data-cursor': 'go' }, t('hero.cta', locale));
  root.append(
    el('p', { class: 'overline', 'data-i18n': 'hero.eyebrow' }, t('hero.eyebrow', locale)),
    head,
    el('p', { class: 'hero__sub', 'data-i18n': 'hero.sub' }, t('hero.sub', locale)),
    cta,
  );
  const chars = splitChars(head);
  if (!prefersReducedMotion())
    gsap.from(chars, { yPercent: 120, opacity: 0, duration: 0.9, ease: 'power4.out', stagger: 0.03, delay: 0.2 });
}
