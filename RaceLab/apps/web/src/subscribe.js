// subscribe.js — logic for the hosted /subscribe checkout page (plain ESM, build-less).
//
// Flow: load ClerkJS from its CDN (publishable key from RACELAB_WEB in config.js —
// single source of truth, NOT a secret). Signed out → mount Clerk <SignIn/>. Signed
// in → show the plan toggle + the two action buttons. "S'abonner" mints a fresh Clerk
// session token and POSTs it to the server checkout endpoint; "Gérer mon abonnement"
// hits the portal endpoint. The server (built to the pinned contract) is the ONLY
// source of truth for attribution — ?user_id / ?plan in the URL are UX prefill only.
//
// Interface contract (server side built to match — do NOT drift):
//   POST {API_BASE}/api/stripe/checkout  Bearer <jwt>  { plan: "monthly"|"annual" }
//     → 200 { url } · 401 · 400 { error:"invalid_plan" }
//   POST {API_BASE}/api/stripe/portal    Bearer <jwt>  {}
//     → 200 { url } · 401 · 409 { error:"no_subscription" }
import { BRAND, RACELAB_WEB, SUBSCRIBE } from "./config.js";

const { CLERK_PUBLISHABLE_KEY, API_BASE } = RACELAB_WEB;

// Host-agnostic ClerkJS CDN. ClerkJS derives the Frontend API host from the
// publishable key itself, so this single URL works for any Clerk instance.
const CLERK_CDN = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

// ---- tiny DOM helpers -------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);

// Valid plan ids, matched to the toggle + the server's accepted values.
const PLANS = ["monthly", "annual"];

// URL params are UX prefill ONLY — never trusted for attribution (server decides).
const params = new URLSearchParams(location.search);
const prefilledPlan = PLANS.includes(params.get("plan")) ? params.get("plan") : "annual";

// ---- Clerk loader -----------------------------------------------------------
// Inject the ClerkJS script with the publishable key as a data attribute (read
// from config so the key stays single-sourced), then call Clerk.load().
function loadClerk() {
  return new Promise((resolve, reject) => {
    if (window.Clerk) return resolve(window.Clerk);
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.clerkPublishableKey = CLERK_PUBLISHABLE_KEY;
    s.src = CLERK_CDN;
    s.addEventListener("load", async () => {
      try {
        await window.Clerk.load();
        resolve(window.Clerk);
      } catch (err) {
        reject(err);
      }
    });
    s.addEventListener("error", () => reject(new Error("clerk_cdn_failed")));
    document.head.appendChild(s);
  });
}

// ---- UI state ---------------------------------------------------------------
function setError(msg) {
  const el = $("#subError");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}

function setBusy(busy) {
  for (const id of ["#subscribeBtn", "#manageBtn"]) {
    const btn = $(id);
    if (btn) btn.toggleAttribute("disabled", busy);
  }
}

// Which plan is currently selected on the toggle.
function selectedPlan() {
  return $('input[name="plan"]:checked')?.value || prefilledPlan;
}

// ---- API calls --------------------------------------------------------------
// POST helper: always sends a fresh Clerk session token as a Bearer header.
async function postWithToken(path, body) {
  const token = await window.Clerk.session.getToken();
  if (!token) {
    const e = new Error("no_token");
    e.status = 401;
    throw e;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON / empty body */
  }
  if (!res.ok) {
    const e = new Error(data?.error || `http_${res.status}`);
    e.status = res.status;
    e.payload = data;
    throw e;
  }
  return data;
}

async function onSubscribe() {
  setError("");
  setBusy(true);
  try {
    const data = await postWithToken("/api/stripe/checkout", { plan: selectedPlan() });
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    setError(SUBSCRIBE.errors.generic);
  } catch (err) {
    if (err.status === 401) {
      setError(SUBSCRIBE.errors.needSignIn);
      promptSignIn();
    } else {
      setError(SUBSCRIBE.errors.generic);
    }
  } finally {
    setBusy(false);
  }
}

async function onManage() {
  setError("");
  setBusy(true);
  try {
    const data = await postWithToken("/api/stripe/portal", {});
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    setError(SUBSCRIBE.errors.generic);
  } catch (err) {
    if (err.status === 401) {
      setError(SUBSCRIBE.errors.needSignIn);
      promptSignIn();
    } else if (err.status === 409 && err.payload?.error === "no_subscription") {
      setError(SUBSCRIBE.errors.noSubscription);
    } else {
      setError(SUBSCRIBE.errors.generic);
    }
  } finally {
    setBusy(false);
  }
}

// ---- sign-in / sign-up ------------------------------------------------------
// Mount Clerk's sign-in widget into the auth slot (anonymous users sign in here).
function promptSignIn() {
  const slot = $("#authSlot");
  if (!slot || !window.Clerk) return;
  slot.innerHTML = "";
  window.Clerk.mountSignIn(slot, { afterSignInUrl: location.href, afterSignUpUrl: location.href });
  slot.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---- render -----------------------------------------------------------------
function renderSignedIn() {
  $("#authView").hidden = true;
  $("#planView").hidden = false;
  // Reflect the URL-prefilled plan on the toggle (UX only).
  const input = $(`input[name="plan"][value="${prefilledPlan}"]`);
  if (input) input.checked = true;
}

function renderSignedOut() {
  $("#planView").hidden = true;
  $("#authView").hidden = false;
  promptSignIn();
}

// ---- boot -------------------------------------------------------------------
async function boot() {
  // Guard the placeholder: a real key starts pk_live_ / pk_test_. With the
  // committed placeholder, fail friendly instead of hanging on a bad CDN call.
  if (!/^pk_(live|test)_/.test(CLERK_PUBLISHABLE_KEY)) {
    setError(SUBSCRIBE.errors.config);
    setBusy(true);
    return;
  }

  $("#subscribeBtn")?.addEventListener("click", onSubscribe);
  $("#manageBtn")?.addEventListener("click", onManage);

  try {
    const clerk = await loadClerk();
    const sync = () => (clerk.user ? renderSignedIn() : renderSignedOut());
    sync();
    clerk.addListener(sync); // re-render on sign-in / sign-out
  } catch {
    setError(SUBSCRIBE.errors.generic);
  }
}

// brand wordmark (single-sourced)
document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = BRAND));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
