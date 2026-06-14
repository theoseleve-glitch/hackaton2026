import { el } from '../lib/dom';
import { phoneFrame } from './phone-frame';

export function phoneLobby(): HTMLElement {
  const squad: [string, string, string][] = [['You','#FFCC4D','👑'], ['Léa','#5B7BFF',''], ['Tom','#FF6B9D','']];
  return phoneFrame(
    el('div', { class: 'mk-code mk-code--yellow' }, ...['X','X','S','V'].map((c) => el('span', { class: 'mk-cell' }, c))),
    el('p', { class: 'overline' }, 'your squad · 3 of 16'),
    el('div', { class: 'mk-squad' }, ...squad.map(([n,c,k]) =>
      el('div', { class: 'mk-player' }, el('span', { class: 'mk-avatar', style: `background:${c}` }, n[0]),
        el('span', {}, n), el('span', { class: 'mk-crown' }, k)))),
    el('button', { class: 'btn', style: 'width:100%' }, 'start — tu préfères ?'));
}
