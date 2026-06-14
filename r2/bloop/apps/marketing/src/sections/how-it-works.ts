import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function buildHow(root: HTMLElement, locale: Locale): void {
  root.append(
    el('h2', { class: 'overline', 'data-i18n': 'how.title' }, t('how.title', locale)),
    el('div', { class: 'how__grid' },
      ...(['how.s1','how.s2','how.s3'] as const).map((k, i) =>
        el('div', { class: 'card how__step', 'data-reveal': '' },
          el('span', { class: 'how__num' }, String(i + 1)),
          el('p', { 'data-i18n': k }, t(k, locale))))));
}
