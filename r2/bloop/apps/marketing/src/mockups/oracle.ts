import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function oracleCard(locale: Locale): HTMLElement {
  const supers: [string, string][] = [
    ['the anchor','merci de ta participation. sincèrement.'],
    ['free fall','le trône était chaud. bref.'],
    ['the comeback','personne ne t’attendait. erreur.'],
    ['unbreakable','toujours là. flippant.']];
  return el('div', { class: 'oracle card' },
    el('p', { class: 'overline', 'data-i18n': 'night.oracle' }, t('night.oracle', locale)),
    el('div', { class: 'oracle__crown' }, '👑'),
    el('div', { class: 'oracle__list' }, ...supers.map(([title, sub]) =>
      el('div', { class: 'oracle__row' },
        el('strong', {}, title), el('span', {}, sub)))),
    el('p', { class: 'oracle__nudge' }, 'play at bloop.app'));
}
