import { el } from '../lib/dom';

export function revealSplit(): HTMLElement {
  const rows: [string, string][] = [
    ['taste a mystery jam every morning','50%'],
    ['taste a mystery cheese every night','50%']];
  return el('div', { class: 'phone' }, el('div', { class: 'phone__screen' },
    el('h3', { style: 'text-align:center' }, 'the votes are in!'),
    el('div', { class: 'split-banner' }, '⚖️ perfect split!'),
    ...rows.map(([label, p]) => el('div', { class: 'res' },
      el('span', {}, label), el('span', { class: 'res__bar', style: `--p:${p}` }),
      el('span', { class: 'res__pct' }, p)))));
}
