import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { STORE } from '../content/links';

function badge(label: string, href: string, placeholder: boolean, locale: Locale): HTMLElement {
  if (placeholder)
    return el('span', { class: 'badge badge--soon', role: 'link', 'aria-disabled': 'true' },
      label, el('span', { class: 'badge__soon' }, t('download.soon', locale)));
  return el('a', { class: 'badge', href, 'data-cursor': 'go' }, label);
}

export function buildDownload(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'download');
  root.append(
    el('h2', { class: 'h-display', 'data-i18n': 'download.title' }, t('download.title', locale)),
    el('div', { class: 'download__badges' },
      badge('App Store', STORE.appStore.url, STORE.appStore.placeholder, locale),
      badge('Google Play', STORE.googlePlay.url, STORE.googlePlay.placeholder, locale)),
    el('div', { class: 'qr', 'aria-hidden': 'true' }));
}
