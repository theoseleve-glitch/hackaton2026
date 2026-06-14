import gsap from 'gsap';

const COLORS = ['#FF6F61', '#FFCC4D', '#4ECDC4', '#5B7BFF', '#FF6B9D'];

/** Fire a brief 12-piece confetti burst centered in `host` (host must be position:relative). */
export function burstConfetti(host: HTMLElement, count = 12): void {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    p.style.background = COLORS[i % COLORS.length];
    host.appendChild(p);
    gsap.fromTo(p,
      { x: 0, y: 0, opacity: 1, scale: 1, rotation: 0 },
      { x: gsap.utils.random(-180, 180), y: gsap.utils.random(-220, -40),
        rotation: gsap.utils.random(-200, 200), opacity: 0, scale: 0.5,
        duration: 1.4, ease: 'power2.out', onComplete: () => p.remove() });
  }
}
