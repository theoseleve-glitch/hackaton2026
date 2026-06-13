import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
let registered = false;
export function registerGsap() {
  if (!registered && typeof window !== "undefined") { gsap.registerPlugin(ScrollTrigger); registered = true; }
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const EASE_OUT = "power3.out";
export const EASE_SCRUB = "power2.inOut";
