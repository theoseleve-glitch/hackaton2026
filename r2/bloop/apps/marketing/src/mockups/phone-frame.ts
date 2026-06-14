import { el } from '../lib/dom';

/** The ink phone bezel + cream screen used by every app-screen mockup. */
export const phoneFrame = (...children: (Node | string)[]): HTMLElement =>
  el('div', { class: 'phone' }, el('div', { class: 'phone__screen' }, ...children));
