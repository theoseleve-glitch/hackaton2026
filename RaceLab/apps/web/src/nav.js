// nav.js — smart sticky nav: hide-on-scroll-down / reveal-on-up, .scrolled past
// 40px, active-link indicator, and a full-screen mobile overlay. The primary CTA
// is marked [data-magnetic] so cursor.js adopts it. Motion = transform/opacity/
// backdrop-filter only; fully inert (final visible state) under env.reduced.
import { BRAND, NAV, HERO } from "./config.js";
import { gsap } from "gsap";

export function init(ctx) {
  const { ScrollTrigger, lenis, env } = ctx;
  const nav = document.querySelector("nav");
  if (!nav) return;

  nav.innerHTML = `
    <div class="nav__bar">
      <a class="nav__brand" href="#hero" aria-label="${BRAND} — home">
        <span class="nav__mark" aria-hidden="true"></span>
        <span class="nav__word">${BRAND}</span>
      </a>

      <div class="nav__links">
        ${NAV.map(
          (n) =>
            `<a class="nav__link" href="${n.href}" data-target="${n.href}"><span>${n.label}</span></a>`
        ).join("")}
      </div>

      <a class="btn btn--primary nav__cta" data-magnetic href="${HERO.ctaPrimary.href}">${HERO.ctaPrimary.label}</a>

      <button class="nav__burger" aria-label="Open menu" aria-expanded="false" aria-controls="nav-overlay">
        <span class="nav__burger-line"></span>
        <span class="nav__burger-line"></span>
      </button>
    </div>

    <div class="nav__overlay" id="nav-overlay" aria-hidden="true">
      <div class="nav__overlay-inner">
        ${NAV.map(
          (n, i) =>
            `<a class="nav__big" href="${n.href}" data-target="${n.href}" style="--i:${i}"><span class="nav__big-index mono">0${i + 1}</span><span class="nav__big-label">${n.label}</span></a>`
        ).join("")}
        <a class="btn btn--primary nav__overlay-cta" href="${HERO.ctaPrimary.href}" style="--i:${NAV.length}">${HERO.ctaPrimary.label}</a>
      </div>
    </div>`;

  const links = Array.from(nav.querySelectorAll(".nav__link"));
  const overlayLinks = Array.from(nav.querySelectorAll(".nav__big, .nav__overlay-cta"));
  const burger = nav.querySelector(".nav__burger");
  const overlay = nav.querySelector(".nav__overlay");

  // --- Hide-on-down / reveal-on-up + .scrolled backdrop --------------------
  // Under reduced-motion we keep the nav permanently pinned & visible: no
  // hiding behaviour, only the (CSS-transitionless) .scrolled border swap.
  let last = 0;
  let ticking = false;

  const applyScroll = (y) => {
    nav.classList.toggle("scrolled", y > 40);
    if (!env.reduced) {
      // Don't hide while the mobile overlay is open or near the very top.
      if (!nav.classList.contains("open")) {
        if (y > last && y > 200) nav.classList.add("hidden");
        else nav.classList.remove("hidden");
      }
    }
    last = y;
  };

  const onScroll = (y) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      applyScroll(y);
      ticking = false;
    });
  };

  if (lenis) {
    lenis.on("scroll", ({ scroll }) => onScroll(scroll));
  } else {
    addEventListener("scroll", () => onScroll(scrollY), { passive: true });
  }
  applyScroll(lenis ? 0 : scrollY);

  // --- Active-section indicator -------------------------------------------
  // Pick the linked section whose band straddles the viewport center. Rect-based
  // (relative to the viewport) so it stays correct across the pinned TUNE section,
  // where per-section ScrollTriggers get distorted by the pin spacer.
  const linked = links
    .map((a) => ({ a, sec: a.dataset.target?.startsWith("#") ? document.querySelector(a.dataset.target) : null }))
    .filter((x) => x.sec);
  const updateActive = () => {
    const center = innerHeight * 0.5;
    let current = null;
    for (const x of linked) {
      const r = x.sec.getBoundingClientRect();
      if (r.top <= center && r.bottom > center) current = x;
    }
    links.forEach((a) => a.classList.toggle("active", !!current && a === current.a));
  };
  if (lenis) lenis.on("scroll", updateActive);
  else addEventListener("scroll", updateActive, { passive: true });
  updateActive();

  // --- Mobile overlay ------------------------------------------------------
  const closeOverlay = () => {
    if (!nav.classList.contains("open")) return;
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nav-locked");
    lenis?.start();
    if (!env.reduced) {
      gsap.to(overlayLinks, {
        autoAlpha: 0,
        y: 24,
        duration: 0.25,
        ease: "power2.in",
        stagger: { each: 0.04, from: "end" },
      });
    }
    burger.focus();
  };

  const openOverlay = () => {
    nav.classList.add("open");
    nav.classList.remove("hidden");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Close menu");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("nav-locked");
    lenis?.stop();
    if (env.reduced) {
      gsap.set(overlayLinks, { autoAlpha: 1, y: 0 });
    } else {
      gsap.fromTo(
        overlayLinks,
        { autoAlpha: 0, y: 36 },
        { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.07, delay: 0.08 }
      );
    }
    overlayLinks[0]?.focus();
  };

  // Overlay links start hidden so the open stagger reads as an entrance.
  if (!env.reduced) gsap.set(overlayLinks, { autoAlpha: 0, y: 36 });

  burger.addEventListener("click", () => {
    if (nav.classList.contains("open")) closeOverlay();
    else openOverlay();
  });

  overlayLinks.forEach((a) => a.addEventListener("click", closeOverlay));

  // Trap Tab focus inside the overlay while it's open (WCAG 2.4.3 / 2.1.2).
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !nav.classList.contains("open")) return;
    const f = overlayLinks.filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      first.focus();
    }
  });

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });
}
