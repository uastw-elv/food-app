/* PWA-Laufzeit für die Rezept-App (wird von pwa_build.py in index.html eingebettet).
   1. Ersatz für claude.use("db"), wenn die Seite nicht auf claude.ai läuft (lokal, Abgleich über pwa-sync.js).
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

  /* ---------- 1. Datenbank: lokal pro Gerät, optional per pwa-sync.js mit einem privaten GitHub-Repo abgeglichen ----------
     Eigene Änderungen: rk-sync-own = {Sammlung: {id: {d: Dokument|null (gelöscht), t: Zeitstempel}}}
     Andere Geräte:     rk-sync-remote = {Datei: {sha, data: gleiche Form}}
     Sichtbar ist je Dokument der neueste Stand über alle Geräte. */
  if (!window.claude) {
    const listeners = {};
    const read = (k, dflt) => { try { return JSON.parse(LS.get(k) || "null") || dflt } catch (e) { return dflt } };
    let own = read("rk-sync-own", null);
    if (!own) { // Übernahme aus der ersten Version (rk-db:<Sammlung>)
      own = {}; const now = Date.now();
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
        if (k && k.startsWith("rk-db:")) { const o = read(k, {}), c = k.slice(6); own[c] = {};
          for (const id in o) own[c][id] = { d: o[id], t: now }; } } } catch (e) {}
      LS.set("rk-sync-own", JSON.stringify(own));
    }
    let remote = read("rk-sync-remote", {});
    const view = c => {
      const best = {};
      const add = m => { for (const id in (m && m[c]) || {}) { const e = m[c][id]; if (!best[id] || e.t > best[id].t) best[id] = e; } };
      add(own); for (const f in remote) add(remote[f].data);
      const o = {}; for (const id in best) if (best[id].d != null) o[id] = best[id].d;
      return o;
    };
    const notify = c => (c ? [c] : Object.keys(listeners)).forEach(k => (listeners[k] || []).forEach(f => { try { f() } catch (e) {} }));
    const write = (c, id, d) => {
      own[c] = own[c] || {};
      // Zeitstempel immer größer als alle bekannten, auch bei falsch gehender Uhr
      let t = Date.now(); for (const f in remote) { const e = remote[f].data && remote[f].data[c] && remote[f].data[c][id]; if (e && e.t >= t) t = e.t + 1; }
      own[c][id] = { d: d == null ? null : JSON.parse(JSON.stringify(d)), t };
      LS.set("rk-sync-own", JSON.stringify(own)); LS.set("rk-sync-dirty", "1");
      notify(c); window.dispatchEvent(new Event("rk-db-change"));
    };
    const snap = c => {
      const o = view(c), docs = Object.keys(o).map(id => ({ id, exists: true, data: () => o[id] }));
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
    };
    const docSnap = (c, id) => { const o = view(c); return { id, exists: id in o, data: () => o[id] }; };
    const watch = (c, fn) => { (listeners[c] = listeners[c] || []).push(fn); setTimeout(fn, 0);
      return () => { listeners[c] = listeners[c].filter(x => x !== fn); }; };
    const collection = c => ({
      doc: id => ({
        id,
        set: async d => write(c, id, d),
        update: async d => write(c, id, Object.assign({}, view(c)[id] || {}, JSON.parse(JSON.stringify(d)))),
        delete: async () => write(c, id, null),
        get: async () => docSnap(c, id),
        onSnapshot: cb => watch(c, () => cb(docSnap(c, id))),
      }),
      add: async d => { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); write(c, id, d); return { id }; },
      get: async () => snap(c),
      onSnapshot: cb => watch(c, () => cb(snap(c))),
    });
    const DB = { collection, local: true };
    window.claude = { local: true, use: async name => (name === "db" ? DB : null) };
    // Schnittstelle für pwa-sync.js
    window.__rkStore = {
      own: () => own,
      remote: () => remote,
      setRemote: r => { remote = r; LS.set("rk-sync-remote", JSON.stringify(remote)); notify(); },
      mergeOwn: m => { // eigene Datei vom Server (z. B. nach Neuinstallation) mit lokalem Stand zusammenführen
        let changed = false;
        for (const c in m || {}) for (const id in m[c]) { own[c] = own[c] || {};
          if (!own[c][id] || m[c][id].t > own[c][id].t) { own[c][id] = m[c][id]; changed = true; } }
        if (changed) { LS.set("rk-sync-own", JSON.stringify(own)); notify(); }
        return changed;
      },
      dirty: () => LS.get("rk-sync-dirty") === "1",
      clean: () => LS.del("rk-sync-dirty"),
    };
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
