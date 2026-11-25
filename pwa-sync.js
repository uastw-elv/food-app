/* Gemeinsamer Speicher für Bewertungen und Importe über ein privates GitHub-Repo.
   Jedes iPhone schreibt nur seine eigene Datei bewertungen/<geraet>.json und liest die der anderen.
   So gibt es keine Schreibkonflikte; je Dokument gewinnt der neueste Stand (siehe pwa.js, Abschnitt 1). */
(() => {
  "use strict";
  const S = window.__rkStore;
  if (!S) return; // läuft auf claude.ai, dort speichert der Katalog selbst
  const CFG = window.__PWA__ || {};
  const LS = {
    get: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} },
    del: k => { try { localStorage.removeItem(k) } catch (e) {} },
  };
  const DIR = "bewertungen";
  const conf = () => { try { return JSON.parse(LS.get("rk-gh") || "null") } catch (e) { return null } };
  const slug = s => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "iphone";
  const ownPath = g => `${DIR}/${slug(g.device)}.json`;
  const utf8b64 = str => { const u = new TextEncoder().encode(str); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function api(g, path, opt = {}) {
    const r = await fetch(`https://api.github.com/repos/${g.repo}${path}`, Object.assign({}, opt, {
      cache: "no-store",
      headers: Object.assign({ Authorization: "Bearer " + g.token, Accept: "application/vnd.github+json" }, opt.headers || {}),
    }));
    return r;
  }
  const why = (r, what) => r.status === 401 ? "Der GitHub-Schlüssel ist ungültig oder abgelaufen."
    : r.status === 403 ? `Der Schlüssel darf das Repo nicht ${what}. Beim Schlüssel „Contents: Read and write“ wählen.`
    : r.status === 404 ? "Repo nicht gefunden, oder der Schlüssel hat keinen Zugriff darauf."
    : `GitHub antwortet mit Fehler ${r.status}.`;

  /* ---------- Abgleich ---------- */
  let state = { kind: conf() ? "idle" : "off", msg: "", at: LS.get("rk-sync-at") };
  const setState = (kind, msg) => { state = { kind, msg: msg || "", at: kind === "ok" ? new Date().toISOString() : state.at };
    if (kind === "ok") LS.set("rk-sync-at", state.at); render(); };
  let running = null, again = false;

  async function pull(g) {
    const r = await api(g, `/contents/${DIR}?per_page=100`);
    if (r.status === 404) return; // Ordner gibt es noch nicht
    if (!r.ok) throw new Error(why(r, "lesen"));
    const list = await r.json(), mine = ownPath(g), remote = Object.assign({}, S.remote()), seen = new Set();
    for (const f of list) {
      if (f.type !== "file" || !f.name.endsWith(".json")) continue;
      if (f.path === mine) {
        if (LS.get("rk-sync-sha") !== f.sha) { // eigene Datei auf dem Server ist neuer (z. B. nach Neuinstallation)
          const x = await api(g, `/contents/${f.path}`, { headers: { Accept: "application/vnd.github.raw+json" } });
          if (x.ok) { const j = await x.json(); if (S.mergeOwn(j.data)) LS.set("rk-sync-dirty", "1"); LS.set("rk-sync-sha", f.sha); }
        }
        continue;
      }
      seen.add(f.path);
      if (remote[f.path] && remote[f.path].sha === f.sha) continue;
      const x = await api(g, `/contents/${f.path}`, { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!x.ok) throw new Error(why(x, "lesen"));
      const j = await x.json();
      remote[f.path] = { sha: f.sha, device: j.device || f.name, data: j.data || {} };
    }
    for (const p in remote) if (!seen.has(p)) delete remote[p];
    S.setRemote(remote);
  }

  async function push(g) {
    if (!S.dirty()) return;
    const path = ownPath(g);
    const body = sha => JSON.stringify({ message: `Bewertungen von ${g.device}`, sha: sha || undefined,
      content: utf8b64(JSON.stringify({ device: g.device, updated: new Date().toISOString(), data: S.own() }, null, 1)) });
    let r = await api(g, `/contents/${path}`, { method: "PUT", body: body(LS.get("rk-sync-sha")) });
    if (r.status === 409 || r.status === 422) { // sha veraltet oder Datei existiert schon: aktuellen Stand holen, zusammenführen, nochmal
      const x = await api(g, `/contents/${path}`);
      if (x.ok) { const j = await x.json(); try { S.mergeOwn(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\n/g, "")), c => c.charCodeAt(0)))).data) } catch (e) {} LS.set("rk-sync-sha", j.sha); }
      r = await api(g, `/contents/${path}`, { method: "PUT", body: body(LS.get("rk-sync-sha")) });
    }
    if (!r.ok) throw new Error(why(r, "schreiben"));
    const j = await r.json(); LS.set("rk-sync-sha", j.content.sha); S.clean();
  }

  async function sync() {
    const g = conf(); if (!g) { setState("off"); return; }
    if (running) { again = true; return running; }
    if (!navigator.onLine) { setState("wait", "Kein Internet. Änderungen werden später abgeglichen."); return; }
    setState("busy");
    running = (async () => {
      try { await pull(g); await push(g); setState("ok"); }
      catch (e) { setState(e instanceof TypeError ? "wait" : "err", e instanceof TypeError ? "Keine Verbindung zu GitHub. Später nochmal." : e.message); }
      finally { running = null; if (again) { again = false; setTimeout(sync, 500); } }
    })();
    return running;
  }
  let tPush = null;
  window.addEventListener("rk-db-change", () => { if (!conf()) return; render(); clearTimeout(tPush); tPush = setTimeout(sync, 1500); });
  window.addEventListener("online", () => sync());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  setInterval(() => { if (document.visibilityState === "visible") sync(); }, 180000);

  /* ---------- Oberfläche: Knopf im Kopf + Einstellungen ---------- */
  const LABEL = { off: "Nur auf diesem iPhone", idle: "Gemeinsam", busy: "Gleiche ab …", ok: "Gemeinsam", wait: "Wartet auf Internet", err: "Abgleich gestört" };
  let btn, dlg;
  function render() {
    if (!btn) return;
    const k = S.dirty() && state.kind === "ok" ? "busy" : state.kind;
    btn.dataset.k = k;
    btn.querySelector("span").textContent = LABEL[k];
    btn.setAttribute("aria-label", `Gemeinsam speichern: ${LABEL[k]}. Einstellungen öffnen`);
    if (dlg && dlg.open) {
      const at = state.at ? new Date(state.at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }) : null;
      const others = Object.values(S.remote()).map(r => r.device).filter(Boolean);
      dlg.querySelector("#syStatus").textContent = state.kind === "off" ? "Noch nicht verbunden. Bewertungen bleiben nur auf diesem iPhone."
        : (state.msg || LABEL[state.kind]) + (at ? ` · Zuletzt abgeglichen: ${at}` : "") + (others.length ? ` · Daten von: ${others.join(", ")}` : "");
      dlg.querySelector("#syStatus").className = "note" + (state.kind === "err" ? " sy-err" : "");
      dlg.querySelector("#syNow").hidden = dlg.querySelector("#syOff").hidden = !conf();
    }
  }
  function openDlg() {
    const g = conf() || { repo: CFG.dataRepo || "", device: "", token: "" };
    dlg.querySelector("#syDev").value = g.device || "";
    dlg.querySelector("#syRepo").value = g.repo || CFG.dataRepo || "";
    dlg.querySelector("#syTok").value = "";
    dlg.querySelector("#syTok").placeholder = g.token ? "Gespeichert. Nur für einen neuen Schlüssel ausfüllen." : "github_pat_…";
    dlg.showModal(); render();
  }
  function build() {
    const head = document.querySelector(".wrap > header"); if (!head) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "pwa-syncbtn";
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9H7z"/></svg><span></span>`;
    btn.onclick = openDlg;
    head.prepend(btn);
    dlg = document.createElement("dialog");
    dlg.className = "pwa-sydlg"; dlg.setAttribute("aria-labelledby", "syH");
    dlg.innerHTML = `<form method="dialog" class="dlg" novalidate>
      <div class="dlg-head"><h2 id="syH">Gemeinsam speichern</h2><button class="btn" type="button" id="syClose">Schließen</button></div>
      <p style="margin:0">Bewertungen und importierte Rezepte werden in eurem privaten GitHub-Repo abgelegt, damit beide iPhones dasselbe sehen. Das richtest du auf jedem iPhone einmal ein.</p>
      <label for="syDev">Name dieses iPhones</label>
      <input id="syDev" autocomplete="off" placeholder="z. B. Elvis" aria-describedby="syDevH" required>
      <p class="note" id="syDevH" style="margin:-4px 0 0">Jedes iPhone braucht einen eigenen Namen.</p>
      <label for="syTok">GitHub-Schlüssel</label>
      <input id="syTok" type="password" autocomplete="off" autocapitalize="none" spellcheck="false">
      <label for="syRepo">Daten-Repo</label>
      <input id="syRepo" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="besitzer/repo">
      <p id="syStatus" class="note" role="status" aria-live="polite"></p>
      <div class="row-btns"><button class="btn primary" type="button" id="syGo">Verbinden</button>
        <button class="btn" type="button" id="syNow">Jetzt abgleichen</button>
        <button class="btn" type="button" id="syOff">Trennen</button></div></form>`;
    document.body.appendChild(dlg);
    const $ = id => dlg.querySelector("#" + id), st = $("syStatus");
    const fail = (msg, el) => { st.textContent = msg; st.className = "note sy-err"; if (el) { el.setAttribute("aria-invalid", "true"); el.focus(); } };
    $("syClose").onclick = () => dlg.close();
    $("syNow").onclick = () => sync();
    $("syOff").onclick = () => { LS.del("rk-gh"); LS.del("rk-sync-sha"); setState("off"); st.textContent = "Getrennt. Deine Bewertungen bleiben auf diesem iPhone."; };
    $("syGo").onclick = async () => {
      dlg.querySelectorAll("[aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
      const old = conf() || {};
      const g = { device: $("syDev").value.trim(), token: $("syTok").value.trim() || old.token || "", repo: $("syRepo").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "") };
      if (!g.device) return fail("Bitte gib diesem iPhone einen Namen.", $("syDev"));
      if (!g.token) return fail("Bitte den GitHub-Schlüssel einfügen.", $("syTok"));
      if (!/^[\w.-]+\/[\w.-]+$/.test(g.repo)) return fail("Das Repo bitte als besitzer/name angeben.", $("syRepo"));
      const taken = Object.keys(S.remote()).some(p => p === ownPath(g));
      st.className = "note"; st.textContent = "Prüfe Zugang …"; $("syGo").disabled = true;
      try {
        const r = await api(g, "");
        if (!r.ok) return fail(why(r, "lesen"), r.status === 404 ? $("syRepo") : $("syTok"));
        const info = await r.json();
        if (!info.private) return fail("Das Repo ist öffentlich. Bewertungen gehören in ein privates Repo.", $("syRepo"));
        if (slug(old.device) !== slug(g.device)) LS.del("rk-sync-sha");
        LS.set("rk-gh", JSON.stringify(g)); LS.set("rk-sync-dirty", "1");
        if (taken) st.textContent = "Hinweis: Diesen Namen nutzt schon ein anderes iPhone. Wenn das nicht dieses iPhone war, bitte einen anderen Namen wählen.";
        await sync();
        if (state.kind === "ok") { st.textContent = "Verbunden. Ab jetzt gleichen sich beide iPhones von selbst ab."; $("syTok").value = ""; }
      } catch (e) { fail("Keine Verbindung zu GitHub. Bitte Internet prüfen."); }
      finally { $("syGo").disabled = false; }
    };
    render();
  }
  const start = () => { build(); if (conf()) sync(); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
