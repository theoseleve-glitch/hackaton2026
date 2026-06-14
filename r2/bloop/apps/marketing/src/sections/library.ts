import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { GAMES } from '../content/games';

export function buildLibrary(root: HTMLElement, locale: Locale): void {
  const track = el('div', { class: 'lib__track', 'data-cursor': 'drag' },
    ...GAMES.map((g) => el('article', { class: 'lib__card card', style: `--accent:${g.accent}` },
      el('div', { class: 'lib__bar' }),
      el('h3', {}, g.name[locale], g.spicy ? el('span', { class: 'lib__18', 'aria-label': '18 plus' }, '18+') : ''),
      el('p', { class: 'lib__hook' }, g.hook[locale]),
      g.creator ? el('span', { class: 'lib__chip' }, g.creator) : '')));
  root.append(
    el('h2', { class: 'overline', 'data-i18n': 'library.title' }, t('library.title', locale)),
    el('div', { class: 'lib__scroller', 'data-reveal': '', tabindex: '0', role: 'group', 'aria-label': t('library.title', locale) }, track));
}
