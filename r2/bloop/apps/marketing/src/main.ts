import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import { detectLocale, type Locale } from './lib/i18n';
import { initSmoothScroll, revealOnScroll, prefersReducedMotion } from './lib/scroll';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initCursor } from './lib/cursor';
import { magnetize } from './lib/magnetic';
import { el } from './lib/dom';
import { buildHero } from './sections/hero';
import { buildThesis } from './sections/thesis';
import { buildHow } from './sections/how-it-works';
import { buildEveryPhone } from './sections/every-phone';
import { buildLibrary } from './sections/library';
import { buildNight } from './sections/night-oracle';
import { buildProof } from './sections/proof';
import { buildSafety } from './sections/safety';
import { buildDownload } from './sections/download';
import { buildFooter } from './sections/footer';
import { runPreloader } from './sections/preloader';
import { shouldRenderBlob } from './webgl/fallback';

const BUILDERS: Record<string, (r: HTMLElement, l: Locale) => void> = {
  hero: buildHero, thesis: buildThesis, how: buildHow, phone: buildEveryPhone,
  library: buildLibrary, night: buildNight, proof: buildProof, safety: buildSafety,
  download: buildDownload, footer: buildFooter,
};
const SECTION_IDS = Object.keys(BUILDERS);

let bloopChoreograph: (() => void) | null = null;

function renderSections(locale: Locale): void {
  ScrollTrigger.getAll().forEach((st) => st.kill());
  for (const [id, build] of Object.entries(BUILDERS)) {
    const sec = document.getElementById(id)!;
    sec.innerHTML = '';
    sec.className = 'section';
    build(sec, locale);
  }
  document.querySelectorAll<HTMLElement>('.section').forEach(revealOnScroll);
  document.querySelectorAll<HTMLElement>('.btn,.badge').forEach((b) => magnetize(b));
  bloopChoreograph?.();
  ScrollTrigger.refresh();
}

async function mountBlob(): Promise<void> {
  if (!shouldRenderBlob()) return;
  if (document.getElementById('bloop-canvas')) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'bloop-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const [{ BloopScene }, { choreograph }] = await Promise.all([
    import('./webgl/bloop'),
    import('./webgl/droplets'),
  ]);
  const scene = new BloopScene(canvas);
  bloopChoreograph = () => choreograph(scene);
  bloopChoreograph();
}

function setActiveLang(locale: Locale): void {
  document.querySelectorAll<HTMLButtonElement>('.lang button')
    .forEach((b) => b.setAttribute('aria-current', String(b.dataset.l === locale)));
}

function mountNav(initial: Locale): void {
  const setLang = (l: Locale) => {
    document.documentElement.lang = l;
    localStorage.setItem('bloop_locale', l);
    setActiveLang(l);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !prefersReducedMotion()) doc.startViewTransition(() => renderSections(l));
    else renderSections(l);
  };
  const frBtn = el('button', { 'data-l': 'fr', 'aria-label': 'Français' }, 'FR');
  const enBtn = el('button', { 'data-l': 'en', 'aria-label': 'English' }, 'EN');
  frBtn.onclick = () => setLang('fr');
  enBtn.onclick = () => setLang('en');
  const nav = el('header', { class: 'nav' },
    el('a', { class: 'nav__logo', href: '#hero', 'aria-label': 'bloop' },
      'bloop', el('span', { class: 'nav__dot' }, '.')),
    el('nav', { class: 'lang', 'aria-label': 'language' }, frBtn, enBtn));
  document.body.prepend(nav);
  setActiveLang(initial);
}

function main(): void {
  const app = document.getElementById('app')!;
  const locale = detectLocale();
  document.documentElement.lang = locale;
  for (const id of SECTION_IDS) app.append(el('section', { id, class: 'section' }));
  document.body.prepend(el('a', { href: '#hero', class: 'skip' }, 'aller au contenu'));
  mountNav(locale);
  renderSections(locale);
  initCursor();
  runPreloader(() => { initSmoothScroll(); ScrollTrigger.refresh(); });
  void mountBlob();
}
main();
