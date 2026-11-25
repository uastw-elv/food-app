/* PWA-Laufzeit für die Rezept-App (wird von pwa_build.py in index.html eingebettet).
   1. Lokaler Ersatz für claude.use("db"), wenn die Seite nicht auf claude.ai läuft (speichert pro Gerät).
   2. Entschlüsselt .json-Dateien beim fetch() (AES-GCM), Passwort einmal pro Gerät.
   3. Registriert den Service Worker (offline) und meldet neue Versionen. */
(() => {
  "use strict";
  const CFG = window.__PWA__ || {};
  const LS = {
    get: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} },
    del: k => { try { localStorage.removeItem(k) } catch (e) {} },
  };

  /* ---------- 1. Lokale Datenbank ---------- */
  if (!window.claude) {
    const listeners = {};
    const load = c => { try { return JSON.parse(LS.get("rk-db:" + c) || "{}") } catch (e) { return {} } };
    const snap = c => {
      const o = load(c), docs = Object.keys(o).map(id => ({ id, exists: true, data: () => o[id] }));
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
    };
    const docSnap = (c, id) => { const o = load(c); return { id, exists: id in o, data: () => o[id] }; };
    const store = (c, o) => {
      LS.set("rk-db:" + c, JSON.stringify(o));
      (listeners[c] || []).forEach(f => { try { f() } catch (e) {} });
    };
    const watch = (c, fn) => { (listeners[c] = listeners[c] || []).push(fn); setTimeout(fn, 0);
      return () => { listeners[c] = listeners[c].filter(x => x !== fn); }; };
    const collection = c => ({
      doc: id => ({
        id,
        set: async d => { const o = load(c); o[id] = JSON.parse(JSON.stringify(d)); store(c, o); },
        update: async d => { const o = load(c); o[id] = Object.assign({}, o[id] || {}, JSON.parse(JSON.stringify(d))); store(c, o); },
        delete: async () => { const o = load(c); delete o[id]; store(c, o); },
        get: async () => docSnap(c, id),
        onSnapshot: cb => watch(c, () => cb(docSnap(c, id))),
      }),
      add: async d => { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const o = load(c); o[id] = JSON.parse(JSON.stringify(d)); store(c, o); return { id }; },
      get: async () => snap(c),
      onSnapshot: cb => watch(c, () => cb(snap(c))),
    });
    const DB = { collection, local: true };
    window.claude = { local: true, use: async name => (name === "db" ? DB : null) };
  }

  /* ---------- 2. Entschlüsselung ---------- */
  const te = new TextEncoder();
  const b64 = { enc: u => btoa(String.fromCharCode(...new Uint8Array(u))), dec: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)) };
  const MAGIC = [82, 75, 69, 49]; // "RKE1"
  const isEnc = u => u.length > 16 && MAGIC.every((m, i) => u[i] === m);
  const decrypt = (key, u) => crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(4, 16) }, key, u.subarray(16));
  const importRaw = raw => crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["decrypt"]);
  const verify = async key => { try { await decrypt(key, b64.dec(CFG.check)); return true } catch (e) { return false } };

  async function derive(pw) {
    const base = await crypto.subtle.importKey("raw", te.encode(pw.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64.dec(CFG.salt), iterations: CFG.iter }, base, 256);
    return importRaw(bits);
  }

  function askPassword() {
    return new Promise(resolve => {
      const show = () => {
        const wrap = document.querySelector(".wrap");
        if (wrap) wrap.inert = true;
        const box = document.createElement("div");
        box.className = "pwa-lock";
        box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "pwaLockH");
        box.innerHTML = `<form class="pwa-lock-card" novalidate>
          <img src="icon-192.png" alt="" width="72" height="72">
          <h1 id="pwaLockH">Willkommen</h1>
          <p>Die Rezepte sind privat. Gib einmal das Passwort ein, danach merkt sich dein iPhone es.</p>
          <label for="pwaPw">Passwort</label>
          <input id="pwaPw" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required aria-describedby="pwaErr">
          <p id="pwaErr" class="pwa-err" aria-live="assertive"></p>
          <button class="btn primary" type="submit">Öffnen</button></form>`;
        document.body.appendChild(box);
        const f = box.querySelector("form"), inp = box.querySelector("input"), err = box.querySelector("#pwaErr"), btn = box.querySelector("button");
        inp.focus();
        f.onsubmit = async e => {
          e.preventDefault();
          if (!inp.value) { err.textContent = "Bitte Passwort eingeben."; inp.setAttribute("aria-invalid", "true"); inp.focus(); return; }
          btn.disabled = true; err.textContent = ""; btn.textContent = "Prüfe …";
          const key = await derive(inp.value);
          if (await verify(key)) {
            LS.set("rk-key", b64.enc(await crypto.subtle.exportKey("raw", key)));
            box.remove(); if (wrap) wrap.inert = false; resolve(key);
          } else {
            err.textContent = "Das Passwort stimmt nicht. Bitte noch einmal versuchen.";
            inp.setAttribute("aria-invalid", "true"); btn.disabled = false; btn.textContent = "Öffnen"; inp.select();
          }
        };
      };
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", show) : show();
    });
  }

  async function getKey() {
    const s = LS.get("rk-key");
    if (s) { try { const k = await importRaw(b64.dec(s)); if (await verify(k)) return k; } catch (e) {} LS.del("rk-key"); }
    return askPassword();
  }

  if (CFG.salt) {
    const keyP = getKey();
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
      if (url.origin !== location.origin || !url.pathname.endsWith(".json")) return orig(input, init);
      const key = await keyP;
      const res = await orig(input, init);
      if (!res.ok) return res;
      const u = new Uint8Array(await res.arrayBuffer());
      const body = isEnc(u) ? await decrypt(key, u) : u;
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }

  /* ---------- 3. Service Worker + Update-Hinweis ---------- */
  function showUpdate() {
    if (document.querySelector(".pwa-update")) return;
    const bar = document.createElement("div");
    bar.className = "pwa-update"; bar.setAttribute("role", "status");
    bar.innerHTML = `<span>Eine neue Version ist da.</span><button class="btn primary" type="button">Jetzt laden</button>`;
    bar.querySelector("button").onclick = () => location.reload();
    document.body.appendChild(bar);
  }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) showUpdate(); had = true; });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      }).catch(() => {});
    });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
