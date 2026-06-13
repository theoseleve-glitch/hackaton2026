import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { revealSplit } from '../mockups/reveal-split';

export function buildProof(root: HTMLElement, locale: Locale): void {
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'proof.title' }, t('proof.title', locale)),
    el('div', { class: 'proof__wrap', 'data-reveal': '' }, revealSplit()));
}
