import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { phoneHome } from '../mockups/home';
import { phoneLobby } from '../mockups/lobby';

export function buildEveryPhone(root: HTMLElement, locale: Locale): void {
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'phone.title' }, t('phone.title', locale)),
    el('p', { class: 'phone__body', 'data-i18n': 'phone.body' }, t('phone.body', locale)),
    el('div', { class: 'phone__row', 'data-reveal': '' }, phoneHome(), phoneLobby()));
}
