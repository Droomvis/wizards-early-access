/* =========================================================================
   sw-mobile.js — service worker, enkel voor Wizards_Mobile.html.
   Cachet de "app shell" (dit bestand + de gedeelde shared/*-bestanden) zodat
   de app ook zonder netwerk opent (bv. in een tunnel op de trein). Kaarten
   zelf blijven altijd in localStorage staan (zie autosave() in de app) —
   dit bestand cachet enkel de code/stijlen, geen data.

   Drive-sync (opslaan/laden/samenvoegen) heeft uiteraard wél internet nodig;
   die acties falen dan gewoon met de bestaande "Kon niet verbinden"-melding
   in de app, zonder de rest van de app te breken.

   Cache-versie ophogen (CACHE_NAME) na een wijziging aan één van de
   gecachete bestanden, anders blijft een oude versie hangen bij offline gebruik.
   ========================================================================= */

const CACHE_NAME = "wizards-mobile-shell-v1";
const SHELL_FILES = [
  "./Wizards_Mobile.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./shared/card-data.js",
  "./shared/card-render.js",
  "./shared/card-filters.js",
  "./shared/hat-avatar.js",
  "./shared/drive-auth.js",
  "./shared/card-render.css",
  "./shared/hat-avatar.css",
  "./shared/login-overlay.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first voor de app-shell bestanden zelf; voor alles anders (bv. de
// Drive Apps Script-call) gewoon naar het netwerk, zonder te cachen — dat is
// live data en hoort niet offline "oud" geserveerd te worden.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isShellFile = SHELL_FILES.some((f) => req.url.endsWith(f.replace("./", "")));
  if (!isShellFile) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      });
    }).catch(() => caches.match(req))
  );
});
