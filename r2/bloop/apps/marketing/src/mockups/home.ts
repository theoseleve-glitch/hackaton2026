import { el } from '../lib/dom';
import { phoneFrame } from './phone-frame';

/** Returns a phone-framed clean bloop home screen. */
export function phoneHome(): HTMLElement {
  return phoneFrame(
    el('div', { class: 'mk-logo' }, 'bloop', el('span', { class: 'nav__dot' }, '.')),
    el('div', { class: 'mk-profile card' },
      el('span', { class: 'mk-avatar', style: 'background:#5B7BFF' }, 'N'),
      el('span', {}, 'Nacho Wizard')),
    el('p', { class: 'overline' }, 'got a code?'),
    el('div', { class: 'mk-code' }, ...['X','X','S','V'].map((c) => el('span', { class: 'mk-cell' }, c))),
    el('button', { class: 'btn', style: 'width:100%' }, 'create room'));
}
