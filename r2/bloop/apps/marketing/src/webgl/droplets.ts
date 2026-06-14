import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { blobSchedule } from '../math/metaball';
import type { BloopScene, Blob } from './bloop';

const SCHEDULE = blobSchedule(6); // up to 6 droplets bloop out across the mid-scroll band

/**
 * Drive the main coral blob down the page on scroll, weaving side to side, while
 * extra droplets "bloop" into the metaball field at their scheduled scroll points.
 * Pure WebGL (no DOM mutation) so it never conflicts with section reveals and is
 * cheap to recreate after a locale re-render.
 */
export function choreograph(scene: BloopScene): void {
  ScrollTrigger.create({
    trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      const main: Blob = { x: Math.sin(p * Math.PI * 3) * 0.4, y: 0.6 - p * 1.4, r: 0.55 };
      const blobs: Blob[] = [main];
      for (const d of SCHEDULE) {
        if (p >= d.at) {
          const grow = Math.min(1, (p - d.at) * 6);
          blobs.push({
            x: Math.cos(d.index * 1.7) * (0.35 + d.index * 0.04),
            y: main.y + 0.35 + d.index * 0.06,
            r: 0.13 * grow,
          });
        }
      }
      scene.setBlobs(blobs);
    },
  });
}
