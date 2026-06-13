import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import { detectLocale, applyI18n, type Locale } from './lib/i18n';
import { initSmoothScroll, revealOnScroll } from './lib/scroll';
import { initCursor } from './lib/cursor';
import { magnetize } from './lib/magnetic';
import { el } from './lib/dom';
import { buildHero } from './sections/hero';
import { buildThesis } from './sections/thesis';
import { buildHow } from './sections/how-it-works';

const SECTION_IDS = ['hero','thesis','how','phone','library','night','proof','safety','download','footer'] as const;

function mountNav(locale: Locale) {
  const setLang = (l: Locale) => { applyI18n(l);
    document.querySelectorAll<HTMLButtonElement>('.lang button')
      .forEach((b) => b.setAttribute('aria-current', String(b.dataset.l === l))); };
  const frBtn = el('button', { 'data-l': 'fr' }, 'FR');
  const enBtn = el('button', { 'data-l': 'en' }, 'EN');
  frBtn.onclick = () => setLang('fr');
  enBtn.onclick = () => setLang('en');
  const nav = el('header', { class: 'nav' },
    el('a', { class: 'nav__logo', href: '#hero', 'aria-label': 'bloop' },
      'bloop', el('span', { class: 'nav__dot' }, '.')),
    el('nav', { class: 'lang', 'aria-label': 'language' }, frBtn, enBtn));
  document.body.prepend(nav);
  setLang(locale);
}

function main() {
  const app = document.getElementById('app')!;
  const locale = detectLocale();
  for (const id of SECTION_IDS) app.append(el('section', { id, class: 'section' }));
  const skip = el('a', { href: '#hero', class: 'skip' }, 'aller au contenu');
  document.body.prepend(skip);
  mountNav(locale);

  buildHero(document.getElementById('hero')!, locale);
  buildThesis(document.getElementById('thesis')!, locale);
  buildHow(document.getElementById('how')!, locale);

  initCursor();
  initSmoothScroll();
  document.querySelectorAll<HTMLElement>('.section').forEach(revealOnScroll);
  document.querySelectorAll<HTMLElement>('.btn').forEach((b) => magnetize(b));
}
main();
