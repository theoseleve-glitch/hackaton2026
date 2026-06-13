import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { STORE } from '../content/links';

function badge(label: string, href: string, placeholder: boolean): HTMLElement {
  const a = el('a', { class: 'badge', href, 'data-cursor': 'go' }, label);
  if (placeholder) { a.classList.add('badge--soon'); a.setAttribute('aria-disabled', 'true'); }
  return a;
}

export function buildDownload(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'download');
  root.append(
    el('h2', { class: 'h-display', 'data-i18n': 'download.title' }, t('download.title', locale)),
    el('div', { class: 'download__badges' },
      badge('App Store', STORE.appStore.url, STORE.appStore.placeholder),
      badge('Google Play', STORE.googlePlay.url, STORE.googlePlay.placeholder)),
    el('div', { class: 'qr', 'aria-hidden': 'true' }));
}
