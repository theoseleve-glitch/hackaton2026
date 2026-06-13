import { prefersReducedMotion } from './scroll';

export function initCursor(): void {
  if (matchMedia('(pointer: coarse)').matches || prefersReducedMotion()) return;
  const dot = document.createElement('div');
  dot.className = 'cursor';
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dot);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
  addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
  const tick = () => { x += (tx - x) * 0.18; y += (ty - y) * 0.18;
    dot.style.transform = `translate(${x}px,${y}px)`; requestAnimationFrame(tick); };
  tick();
  document.querySelectorAll<HTMLElement>('[data-cursor]').forEach((node) => {
    node.addEventListener('mouseenter', () => {
      dot.classList.add('cursor--active'); dot.dataset.label = node.dataset.cursor ?? '';
    });
    node.addEventListener('mouseleave', () => dot.classList.remove('cursor--active'));
  });
}
