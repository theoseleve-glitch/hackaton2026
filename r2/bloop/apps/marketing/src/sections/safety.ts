import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function buildSafety(root: HTMLElement, locale: Locale): void {
  const chips = locale === 'fr'
    ? ['anonyme', 'signalement intégré', 'accessible (WCAG-AA)', '18+ derrière une porte d’âge']
    : ['anonymous', 'report built in', 'accessible (WCAG-AA)', '18+ behind an age gate'];
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'safety.title' }, t('safety.title', locale)),
    el('p', { class: 'safety__body', 'data-i18n': 'safety.body' }, t('safety.body', locale)),
    el('div', { class: 'safety__chips', 'data-reveal': '' },
      ...chips.map((c) => el('span', { class: 'safety__chip' }, c))));
}
