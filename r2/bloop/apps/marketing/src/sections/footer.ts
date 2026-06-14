import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function buildFooter(root: HTMLElement, locale: Locale): void {
  root.classList.add('footer');
  root.setAttribute('role', 'contentinfo');
  root.append(
    el('div', { class: 'nav__logo' }, 'bloop', el('span', { class: 'nav__dot' }, '.')),
    el('a', { href: '#', class: 'footer__link', 'data-i18n': 'footer.privacy' }, t('footer.privacy', locale)),
    el('p', { class: 'footer__tag', 'data-i18n': 'footer.tag' }, t('footer.tag', locale)));
}
