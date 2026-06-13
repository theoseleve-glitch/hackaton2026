import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { oracleCard } from '../mockups/oracle';

export function buildNight(root: HTMLElement, locale: Locale): void {
  root.classList.add('night');
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'night.title' }, t('night.title', locale)),
    el('div', { 'data-reveal': '' }, oracleCard(locale)));
}
