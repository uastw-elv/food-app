/* Service Worker der Rezept-App, erzeugt von pipeline/pwa_build.py. Version: 21a726682e46
   Alle App-Dateien werden beim Installieren geladen (offline nutzbar). Jede Datei hat einen Inhalts-Hash,
   bei Updates werden nur geänderte Dateien neu geladen. */
const FILES = {
 "apple-touch-icon.png": "54757c14fb64",
 "bilder.json": "8b1e94731f74",
 "bilder_0.json": "a6cbf1e83a7f",
 "bilder_1.json": "4aecb797a113",
 "fonts/BricolageGrotesque-latin-ext.woff2": "1d04719f1325",
 "fonts/BricolageGrotesque-latin.woff2": "85f55a58a31e",
 "fonts/Inter-latin-ext.woff2": "a28eb6d3ccb5",
 "fonts/Inter-latin.woff2": "c940764593d0",
 "fonts.css": "43c466c59ee0",
 "icon-192.png": "82db16beb002",
 "icon-512.png": "5d58c1be9a93",
 "icon-maskable-512.png": "531d81c336ed",
 "igliste.json": "8c82bcdc3b05",
 "index.html": "3f774211d6b0",
 "kuehlschrank.js": "dc3de5c32a34",
 "manifest.webmanifest": "803ed8643b3c",
 "pwa-sync.js": "9ac5c5854ef9",
 "pwa.css": "6bbefd3e0b2b",
 "pwa.js": "21269b5b7975",
 "rezepte.json": "16377194226c",
 "saison.js": "463bb4d8d782",
 "saison.json": "ae61580f7ac0",
 "wochenplan.js": "29172e52cff8"
};
const APP = "rk-app", FONTS = "rk-fonts";
const scope = () => self.registration.scope;
const keyOf = (p, h) => new URL(p, scope()).href + "?v=" + h;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    for (const [p, h] of Object.entries(FILES)) {
      const k = keyOf(p, h);
      if (await c.match(k)) continue;
      const r = await fetch(k, { cache: "no-store" });
      if (!r.ok) throw new Error("Laden fehlgeschlagen: " + p);
      await c.put(k, r);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keep = new Set(Object.entries(FILES).map(([p, h]) => keyOf(p, h)));
    const c = await caches.open(APP);
    for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
    for (const n of await caches.keys()) if (n !== APP && n !== FONTS) await caches.delete(n);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    let p = url.href.startsWith(scope()) ? url.pathname.slice(new URL(scope()).pathname.length) : null;
    if (p === null) return;
    if (p === "" || req.mode === "navigate") p = "index.html";
    const h = FILES[p];
    if (!h) return;
    e.respondWith((async () => (await caches.match(keyOf(p, h))) || fetch(req))());
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const c = await caches.open(FONTS), hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }
      catch (err) { return new Response("", { status: 504 }); }
    })());
  }
});
