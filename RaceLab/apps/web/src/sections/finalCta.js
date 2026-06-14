// finalCta.js — Task 15: the closing CTA + site footer.
//
// Fills #final (full-viewport, deepest bg) with the headline, sub, and the last
// magnetic CTA, then builds the <footer> (sibling of <main>): brand wordmark,
// tagline, link row, and a © line. A faint knockout word "DIALED" parallaxes
// behind the headline to echo the hero's knockout treatment and close the loop.
//
// Motion: transform/opacity only. Split-word headline rises on entrance; the
// knockout word scrubs on scroll; CTA is [data-magnetic] so cursor.js adopts it.
// Under env.reduced: all final states set, no ScrollTriggers registered.
import { BRAND, FINAL, FOOTER } from "../config.js";

// Wrap a string in per-word split-text spans matching the hero convention:
// <span class="word"><span class="inner">…</span></span>, with a sentinel space.
function splitWords(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="word"><span class="inner">${w}</span></span>`)
    .join(" ");
}

export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;

  // ---- #final -------------------------------------------------------------
  const root = document.getElementById("final");
  if (root) {
    root.innerHTML = `
      <div class="final__bg" aria-hidden="true">
        <span class="final__knockout">${FINAL.heading.replace(/[.!?]+$/, "")}</span>
      </div>
      <div class="container final__inner">
        <h2 class="final__h">${splitWords(FINAL.heading)}</h2>
        <p class="final__sub">${FINAL.sub}</p>
        <a class="btn btn--primary final__cta" data-magnetic href="${FINAL.cta.href}">
          <span>${FINAL.cta.label}</span>
          <span class="final__cta-arrow" aria-hidden="true">→</span>
        </a>
      </div>`;

    const inners = root.querySelectorAll(".final__h .inner");
    const sub = root.querySelector(".final__sub");
    const cta = root.querySelector(".final__cta");
    const knockout = root.querySelector(".final__knockout");

    if (env.reduced) {
      // Inert: everything visible, no scroll animation registered.
      gsap.set(inners, { yPercent: 0, autoAlpha: 1 });
      gsap.set([sub, cta], { y: 0, autoAlpha: 1 });
      gsap.set(knockout, { autoAlpha: 1 });
    } else {
      // Headline split-words rise; sub + CTA fade-up; staged on scroll-in.
      gsap.set(inners, { yPercent: 110 });
      gsap.set([sub, cta], { autoAlpha: 0, y: 30 });

      ScrollTrigger.create({
        trigger: root,
        start: "top 70%",
        once: true,
        onEnter: () => {
          const tl = gsap.timeline();
          tl.to(inners, {
            yPercent: 0,
            duration: 1,
            ease: "power3.out",
            stagger: 0.09,
          })
            .to(sub, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.55")
            .to(cta, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.5");
        },
      });

      // Faint knockout word parallaxes upward as the section scrolls — a quiet
      // echo of the hero knockout (loop closure).
      gsap.fromTo(
        knockout,
        { yPercent: 14 },
        {
          yPercent: -14,
          ease: "none",
          scrollTrigger: {
            trigger: root,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        }
      );
    }
  }

  // ---- <footer> -----------------------------------------------------------
  const footer = document.querySelector("footer");
  if (footer) {
    footer.innerHTML = `
      <div class="container footer__inner">
        <div class="footer__brandcol">
          <a class="footer__brand" href="#hero" aria-label="${BRAND} — home">
            <span class="footer__mark" aria-hidden="true"></span>
            <span class="footer__word">${BRAND}</span>
          </a>
          <p class="footer__tagline mono">${FOOTER.tagline}</p>
        </div>
        <nav class="footer__links" aria-label="Footer">
          ${FOOTER.links
            .map((l) => `<a class="footer__link" href="${l.href}">${l.label}</a>`)
            .join("")}
        </nav>
      </div>
      <div class="container footer__base">
        <span class="footer__copy mono">© 2026 ${BRAND}. ${FOOTER.legal}</span>
      </div>`;

    // Footer fades up on entry; inert under reduced-motion via the shared helper.
    reveal([footer.querySelector(".footer__inner"), footer.querySelector(".footer__base")], {
      y: 28,
      stagger: 0.12,
      start: "top 92%",
      trigger: footer,
    });
  }
}
