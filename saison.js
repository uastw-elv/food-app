/* Saisonkalender & Warenkunde (Österreich)
   Lädt saison.json, zeigt den Tab "Saison" (Monat wählen, Sorten mit Kurzinfo, "Wo steckt was?")
   und hängt an passende Rezepte das Tag "saison:jetzt" (Filter im Katalog, Wisch-Thema).
   Öffentlich: window.inSeason(r, month), window.seasonScore(r, month), Event "saison-ready" auf document. */
(() => {
const MON = ["", "Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MON1 = ["", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
// EU-Referenzmengen (VO 1169/2011) je Tag; Ballaststoffe: Richtwert 30 g (DGE)
const NUT = [["vitamin_c_mg", "Vitamin C", 80, "mg"], ["vitamin_a_ug", "Vitamin A", 800, "µg"], ["vitamin_k_ug", "Vitamin K", 75, "µg"],
  ["folate_ug", "Folat", 200, "µg"], ["vitamin_e_mg", "Vitamin E", 12, "mg"], ["vitamin_b6_mg", "Vitamin B6", 1.4, "mg"],
  ["potassium_mg", "Kalium", 2000, "mg"], ["magnesium_mg", "Magnesium", 375, "mg"], ["calcium_mg", "Calcium", 800, "mg"],
  ["iron_mg", "Eisen", 14, "mg"], ["fib", "Ballaststoffe", 30, "g"]];
const CAT = {gemuese: "Gemüse", obst: "Obst", kraeuter: "Kräuter"};
// Grundzutaten, die fast immer verfügbar sind: zählen nicht als „Saison-Star“ eines Rezepts
const BASIS = new Set(["zwiebel", "knoblauch", "schalotte", "fruehlingszwiebel", "karotte", "kartoffel", "suppengruen", "champignons",
  "chili", "zitrone", "lauch", "stangensellerie"]);
// Mischungen (Suppengrün, gemischte Kräuter) zählen für Rezepte, erscheinen aber nicht als eigene Sorte
const MIX = new Set(["suppengruen", "kraeuter"]);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const fmt = (x, d = 1) => x == null ? "–" : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("de-AT");
const NOW = new Date().getMonth() + 1;
let SZ = [], BY = {}, month = NOW, cat = "alle", nut = "vitamin_c_mg", withImport = false;

const css = document.createElement("style");
css.textContent = `
.sz-top { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-bottom: 12px }
.sz-month { display: flex; align-items: center; gap: 6px }
.sz-month select { min-height: 44px; font-weight: 600 }
.sz-month .round { width: 44px; height: 44px; font-size: 1.1rem }
.sz-sec { margin: 18px 0 8px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap }
.sz-sec h2 { font-size: 1.15rem } .sz-sec p { margin: 0 }
.sz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 10px }
@media (min-width: 700px) { .sz-grid { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)) } }
.sz-item { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; text-align: left; font: inherit; color: inherit;
  cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-height: 44px; min-width: 0 }
.sz-item:hover { border-color: var(--accent) }
.sz-item b { font-size: 1rem } .sz-item .note { font-size: 12.5px; line-height: 1.35 }
.sz-tags { display: flex; flex-wrap: wrap; gap: 4px }
.sz-strip { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px }
.sz-strip span { height: 8px; border-radius: 3px; background: var(--line) }
.sz-strip span.fr { background: var(--accent) }
.sz-strip span.la { background: repeating-linear-gradient(135deg, var(--accent) 0 2px, var(--accent-soft) 2px 5px) }
.sz-strip span.gw { background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--accent) }
.sz-strip span.cur { outline: 2px solid var(--ink); outline-offset: 1px }
.sz-big { gap: 3px } .sz-big span { height: auto; padding: 6px 0 4px; text-align: center; font-size: 11px; font-weight: 600; color: var(--muted) }
.sz-big span.fr { color: var(--accent-ink) }
.sz-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--muted); align-items: center }
.sz-legend i { display: inline-block; width: 16px; height: 10px; border-radius: 3px; vertical-align: middle; margin-right: 5px }
.sz-bars { display: grid; gap: 7px }
.sz-bar { display: grid; grid-template-columns: minmax(7em, 9em) 1fr auto; gap: 8px; align-items: center; font-size: 13.5px }
.sz-bar .track { height: 10px; background: var(--bg); border-radius: 99px; overflow: hidden; border: 1px solid var(--line) }
.sz-bar .fill { height: 100%; background: var(--accent); border-radius: 99px }
.sz-bar .val { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 7.5em; text-align: right }
.sz-bar button { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; color: var(--ink) }
.sz-bar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
@media (max-width: 480px) { .sz-bar { grid-template-columns: 1fr auto; } .sz-bar .track { grid-column: 1 / -1; grid-row: 2 } }
.sz-panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 14px 16px; display: grid; gap: 10px; margin-top: 8px }
.sz-rgrid { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(180px, 210px); gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity }
.sz-rgrid .card { scroll-snap-align: start }
.tabs { flex-wrap: wrap }
.sz-check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; cursor: pointer }
.sz-check input { width: 20px; height: 20px; accent-color: var(--accent) }
.sz-rec { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px }
.sz-rec li { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap }
`;
document.head.appendChild(css);

/* ---------- Regeln ---------- */
const avail = (it, m) => it.fr.includes(m) || it.la.includes(m);
const regional = it => (it.fr.length || it.la.length || it.gw.length) && !it.f.includes("tk") && it.c !== "kraeuter";
const isImport = it => !it.fr.length && !it.la.length && !it.gw.length;
function produceOf(r) {
  const seen = new Set(), out = [];
  r.ing.forEach(i => { const it = i[1] === "k" && i[3] && BY[i[3]]; if (it && (it.c === "gemuese" || it.c === "obst") && !seen.has(it.s)) { seen.add(it.s); out.push(it); } });
  return out;
}
/* Saisonal im Monat m: Alle regionalen Obst-/Gemüse-Kernzutaten sind frisch oder als Lagerware da, mindestens eine davon ist
   keine Allerwelts-Grundzutat, und Importware (Banane, Avocado …) überwiegt nicht. TK/Dose (Erbsen, Mais) und Kräuter zählen nicht. */
function inSeason(r, m = month) {
  if (!SZ.length || !r || !r.ing) return false;
  const p = produceOf(r), reg = p.filter(regional), imp = p.filter(isImport);
  return reg.length > 0 && reg.every(it => avail(it, m)) && reg.some(it => !BASIS.has(it.s)) && imp.length <= reg.length;
}
function seasonScore(r, m = month) {
  if (!SZ.length || !r || !r.ing) return 0;
  const reg = produceOf(r).filter(regional);
  return reg.length ? reg.filter(it => avail(it, m)).length / reg.length : 0;
}
window.inSeason = inSeason; window.seasonScore = seasonScore;

const ranges = ms => {
  if (!ms.length) return "";
  if (ms.length === 12) return "ganzjährig";
  const set = new Set(ms), out = [];
  let start = [...Array(12)].map((_, i) => i + 1).find(m => set.has(m) && !set.has(m === 1 ? 12 : m - 1));
  if (!start) return "ganzjährig";
  const seen = new Set();
  for (let k = 0; k < 12; k++) {
    const m = (start - 1 + k) % 12 + 1;
    if (!set.has(m) || seen.has(m)) continue;
    let e = m; while (set.has(e % 12 + 1) && e % 12 + 1 !== m) { e = e % 12 + 1; seen.add(e); } seen.add(m);
    out.push(e === m ? MON[m] : `${MON[m]} bis ${MON[e]}`);
  }
  return out.join(", ");
};
const status = (it, m) => it.fr.includes(m) ? ["fr", "Frisch vom Feld"] : it.la.includes(m) ? ["la", "Lagerware"] :
  it.gw.includes(m) ? ["gw", "Gewächshaus (AT)"] : isImport(it) ? ["im", "Importware"] : ["no", "Keine Saison"];
const prev = m => m === 1 ? 12 : m - 1, next = m => m === 12 ? 1 : m + 1;
const strip = (it, big) => `<div class="sz-strip${big ? " sz-big" : ""}" aria-hidden="true">${[...Array(12)].map((_, i) => {
  const m = i + 1, c = it.fr.includes(m) ? "fr" : it.la.includes(m) ? "la" : it.gw.includes(m) ? "gw" : "";
  return `<span class="${c}${m === month ? " cur" : ""}">${big ? MON1[m] : ""}</span>`; }).join("")}</div>`;
const seasonText = it => isImport(it) ? "Importware, keine heimische Saison." :
  [it.fr.length && `Frisch: ${ranges(it.fr)}`, it.la.length && `Lager: ${ranges(it.la)}`, it.gw.length && `Gewächshaus: ${ranges(it.gw)}`].filter(Boolean).join(". ") + ".";
const pct = (it, k) => { const n = NUT.find(x => x[0] === k), v = k === "fib" ? it.fib : it.v[k]; return v == null ? null : v / n[2] * 100; };
const topNut = it => NUT.map(n => [n[1], pct(it, n[0])]).filter(x => x[1] != null && x[1] >= 15).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);

/* ---------- Tags im Katalog ---------- */
function applyTags() {
  if (!SZ.length || !R.length) return;
  R.forEach(r => { r.tags = r.tags.filter(t => t !== "saison:jetzt"); if (inSeason(r, month)) r.tags.push("saison:jetzt"); });
  L["saison:jetzt"] = month === NOW ? `Passt zur Saison (${MON[month]})` : `Passt zur Saison im ${MON[month]}`;
}
function ingFilter(it) {
  R.forEach(r => { r.tags = r.tags.filter(t => !t.startsWith("zutat:")); if (r.ing.some(i => i[3] === it.n)) r.tags.push("zutat:" + it.s); });
  Object.keys(sel).filter(t => t.startsWith("zutat:")).forEach(t => delete sel[t]);
  L["zutat:" + it.s] = "Mit " + it.n; sel["zutat:" + it.s] = 1;
  save(); buildDims(); shown = 60; $("dlg").close(); showTab("katalog"); render();
  $("filters").open = true; $("count").scrollIntoView({block: "center"});
}
if (!DIMS.some(d => d[0] === "saison")) DIMS.splice(1, 0, ["saison", "Saison"], ["zutat", "Obst & Gemüse"]);
if (!THEMES.some(t => t[0] === "saison:jetzt")) THEMES.splice(2, 0, ["saison:jetzt", "Saisonal jetzt"]);
const _build = buildDims;
buildDims = function () { applyTags(); return _build.apply(this, arguments); };

/* ---------- Ansicht ---------- */
const sec = $("v-saison");
function renderSaison() {
  if (!sec) return;
  if (!SZ.length) { sec.innerHTML = `<p class="note">Lade Saisonkalender …</p>`; return; }
  const vis = SZ.filter(it => !MIX.has(it.s) && (cat === "alle" || it.c === cat));
  const fr = vis.filter(it => it.fr.includes(month)), la = vis.filter(it => !it.fr.includes(month) && it.la.includes(month)),
    gw = vis.filter(it => !avail(it, month) && it.gw.includes(month));
  // Neu = vorher gar nicht heimisch da; Endet bald = nächsten Monat weder frisch noch vom Lager
  const neu = fr.filter(it => !avail(it, prev(month))).map(it => it.s), weg = fr.filter(it => !avail(it, next(month))).map(it => it.s);
  const card = it => { const t = topNut(it), st = status(it, month);
    return `<button type="button" class="sz-item" data-sz="${esc(it.s)}" aria-label="${esc(it.n)}: ${st[1]}${neu.includes(it.s) ? ", neu in diesem Monat" : ""}${weg.includes(it.s) ? ", Saison endet bald" : ""}. Infos öffnen">
      <span style="display:flex;flex-wrap:wrap;justify-content:space-between;column-gap:6px;align-items:baseline;min-width:0"><b style="overflow-wrap:anywhere">${esc(it.n)}</b><span class="note">${CAT[it.c] || ""}</span></span>
      ${strip(it)}
      <span class="sz-tags">${neu.includes(it.s) ? `<span class="pill">Neu</span>` : ""}${weg.includes(it.s) && it.fr.length < 12 ? `<span class="pill warn">Endet bald</span>` : ""}</span>
      ${t.length ? `<span class="note">Viel ${t.join(", ")}</span>` : ""}</button>`; };
  const group = (title, hint, list) => list.length ? `<div class="sz-sec"><h2>${title} <span class="note" style="font-weight:400">(${list.length})</span></h2><p class="note">${hint}</p></div>
    <div class="sz-grid">${list.map(card).join("")}</div>` : "";
  const recs = R.filter(r => r.tags.includes("saison:jetzt") && !(ratings[r.id] && ratings[r.id].verdict === "aussortieren"));
  const pool = recs.filter(r => r.wk && r.st.length && r.status !== "pruefen"); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const pick = pool.sort((a, b) => ((ratings[b.id] || {}).stars || 0) - ((ratings[a.id] || {}).stars || 0)).slice(0, 6);
  sec.innerHTML = `
    <div class="sz-top">
      <div class="sz-month" role="group" aria-label="Monat wählen">
        <button type="button" class="round small" id="szPrev" aria-label="Voriger Monat: ${MON[prev(month)]}">‹</button>
        <select id="szMonth" aria-label="Monat">${MON.slice(1).map((n, i) => `<option value="${i + 1}" ${i + 1 === month ? "selected" : ""}>${n}${i + 1 === NOW ? " (jetzt)" : ""}</option>`).join("")}</select>
        <button type="button" class="round small" id="szNext" aria-label="Nächster Monat: ${MON[next(month)]}">›</button>
      </div>
      <div class="chips" role="group" aria-label="Art">${[["alle", "Alles"], ["gemuese", "Gemüse"], ["obst", "Obst"], ["kraeuter", "Kräuter"]].map(([k, l]) =>
        `<button type="button" class="chip" data-cat="${k}" aria-pressed="${cat === k}">${l}</button>`).join("")}</div>
    </div>
    <div class="sz-legend" aria-hidden="true"><span><i style="background:var(--accent)"></i>Frisch vom Feld</span>
      <span><i style="background:repeating-linear-gradient(135deg,var(--accent) 0 2px,var(--accent-soft) 2px 5px)"></i>Lagerware</span>
      <span><i style="box-shadow:inset 0 0 0 1.5px var(--accent)"></i>Gewächshaus (AT)</span><span>Leiste = Jänner bis Dezember</span></div>
    <div class="sz-panel" style="margin-top:14px"><div class="dlg-head" style="flex-wrap:wrap"><h2 style="font-size:1.15rem">Rezepte für den ${MON[month]}</h2>
      <div class="row-btns"><button class="btn primary" type="button" id="szCat">Alle ${recs.length} im Katalog</button><button class="btn" type="button" id="szSwipe">Saisonal wischen</button></div></div>
      <p class="note" style="margin:0">Passt, wenn alle heimischen Obst- und Gemüse-Hauptzutaten im ${MON[month]} frisch oder vom Lager zu haben sind.</p>
      ${pick.length ? `<div class="sz-rgrid" id="szRecs" role="region" aria-label="Vorschläge, seitlich scrollbar" tabindex="0">${pick.map(card_).join("")}</div>` : ""}</div>
    ${group("Frisch vom Feld", "Erntezeit in Österreich, am aromatischsten und meist günstig.", fr)}
    ${group("Aus dem Lager", "Heimische Ernte, gut gelagert.", la)}
    ${group("Aus heimischem Gewächshaus", "Geschützter Anbau außerhalb der Hauptsaison.", gw)}
    <div class="sz-sec"><h2 id="szWoH">Wo steckt was?</h2><p class="note">Je 100 g, im Vergleich zum Tagesbedarf. Nur was im ${MON[month]} Saison hat${withImport ? " plus Importware" : ""}.</p></div>
    <div class="sz-panel">
      <div class="chips" role="group" aria-labelledby="szWoH">${NUT.map(n => `<button type="button" class="chip" data-nut="${n[0]}" aria-pressed="${nut === n[0]}">${n[1]}</button>`).join("")}</div>
      <label class="sz-check"><input type="checkbox" id="szImp" ${withImport ? "checked" : ""}> Auch Importware zeigen (Banane, Zitrusfrüchte …)</label>
      <div class="sz-bars" id="szRank"></div>
    </div>
    <p class="note" style="margin-top:16px">Saisonzeiten für Österreich, redaktionell nach den üblichen Saisonkalendern (die umweltberatung, AMA); je nach Region und Wetter verschiebt sich die Ernte um ein paar Wochen. Nährwerte: USDA FoodData Central (SR Legacy, CC0), roh je 100 g.</p>`;
  renderRank();
}
const card_ = r => typeof card === "function" ? card(r) : `<button type="button" class="card" data-id="${esc(r.id)}"><div class="body"><h3>${esc(r.t)}</h3></div></button>`;
function renderRank() {
  const n = NUT.find(x => x[0] === nut), pool = SZ.filter(it => !MIX.has(it.s) && (cat === "alle" || it.c === cat) && (avail(it, month) || it.gw.includes(month) || (withImport && isImport(it))));
  const rows = pool.map(it => [it, pct(it, nut), nut === "fib" ? it.fib : it.v[nut]]).filter(x => x[1] != null && x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 12);
  $("szRank").innerHTML = rows.length ? rows.map(([it, p, v]) => `<div class="sz-bar"><button type="button" data-sz="${esc(it.s)}">${esc(it.n)}</button>
    <span class="track" aria-hidden="true"><span class="fill" style="display:block;width:${Math.min(100, p).toFixed(0)}%"></span></span>
    <span class="val">${fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0)} ${n[3]} · ${Math.round(p)} %</span></div>`).join("")
    : `<p class="note">Keine Werte für diese Auswahl.</p>`;
}
sec && sec.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.sz) return openItem(BY_S[b.dataset.sz]);
  if (b.dataset.cat) { cat = b.dataset.cat; return renderSaison(); }
  if (b.dataset.nut) { nut = b.dataset.nut; sec.querySelectorAll("[data-nut]").forEach(x => x.setAttribute("aria-pressed", x.dataset.nut === nut)); return renderRank(); }
  if (b.id === "szPrev") return setMonth(prev(month), "szPrev");
  if (b.id === "szNext") return setMonth(next(month), "szNext");
  if (b.id === "szCat") { Object.keys(sel).filter(t => t.startsWith("saison:") || t.startsWith("zutat:")).forEach(t => delete sel[t]); sel["saison:jetzt"] = 1; save(); buildDims(); shown = 60; showTab("katalog"); render(); return; }
  if (b.id === "szSwipe") { $("theme").value = "saison:jetzt"; try { localStorage.setItem("rk-theme", "saison:jetzt") } catch (e) {} showTab("wischen"); newDeck(); return; }
  if (b.classList.contains("card")) { const r = R.find(x => x.id === b.dataset.id); if (r) openR(r); }
});
sec && sec.addEventListener("change", e => {
  if (e.target.id === "szMonth") setMonth(+e.target.value, "szMonth");
  if (e.target.id === "szImp") { withImport = e.target.checked; renderRank(); }
});
function setMonth(m, focusId) {
  month = m; applyTags(); buildDims(); render(); renderSaison();
  const f = $(focusId); if (f) f.focus();
  document.dispatchEvent(new Event("saison-month"));
}
let BY_S = {};
function openItem(it) {
  if (!it) return;
  const st = status(it, month), rc = R.filter(r => r.ing.some(i => i[3] === it.n)).length;
  const all = NUT.map(n => [n, pct(it, n[0]), n[0] === "fib" ? it.fib : it.v[n[0]]]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
  const bars = all.filter(x => x[1] >= 1), little = all.filter(x => x[1] < 1).map(x => x[0][1]);
  const notes = [it.f.includes("naeherung") && "Nährwerte als Näherung über ein verwandtes Produkt (kein eigener USDA-Eintrag).",
    it.f.includes("ohne_werte") && "Für diese Sorte gibt es keine Nährwerte in der USDA-Datenbank.",
    it.f.includes("tk") && "In Rezepten meist TK- oder Dosenware, deshalb zählt sie bei „Passt zur Saison“ nicht mit."].filter(Boolean);
  $("dlgbody").innerHTML = `
    <div class="dlg-head"><div><h2>${esc(it.n)}</h2><div class="credit">${CAT[it.c] || ""} · im ${MON[month]}: ${st[1]}</div></div>
      <button class="btn" type="button" id="close">Schließen</button></div>
    <p style="margin:0">${esc(it.i)}</p>
    <div class="box"><h3>Saison in Österreich</h3>${isImport(it) ? "" : strip(it, true)}
      <p class="note" style="margin:8px 0 0">${esc(seasonText(it))}</p></div>
    ${bars.length ? `<div class="box"><h3>Nährstoffe je 100 g</h3>
      <p class="note" style="margin:0 0 8px">${it.kcal != null ? `${fmt(it.kcal, 0)} kcal. ` : ""}Balken = Anteil am Tagesbedarf (EU-Referenzwert).${it.kn ? ` Besonders viel: ${esc(it.kn)}.` : ""}</p>
      <div class="sz-bars">${bars.map(([n, p, v]) => `<div class="sz-bar"><span>${n[1]}</span><span class="track" aria-hidden="true"><span class="fill" style="display:block;width:${Math.min(100, p).toFixed(0)}%"></span></span>
        <span class="val">${fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0)} ${n[3]} · ${Math.round(p)} %</span></div>`).join("")}</div>
      ${little.length ? `<p class="note" style="margin:8px 0 0">Kaum enthalten: ${little.join(", ")}.</p>` : ""}</div>` : ""}
    <div class="cols"><div class="box"><h3>Lagern</h3><p style="margin:0">${esc(it.l)}</p></div>
      <div class="box"><h3>Zubereiten</h3><p style="margin:0">${esc(it.z)}</p></div></div>
    ${notes.length ? `<p class="note" style="margin:0">${notes.map(esc).join(" ")}</p>` : ""}
    ${rc ? `<div><button class="btn primary" type="button" id="szIng">${rc} Rezept${rc > 1 ? "e" : ""} mit ${esc(it.n)} zeigen</button></div>` : ""}
    <p class="credit">Nährwerte: USDA FoodData Central (SR Legacy, CC0), roh. Saison: redaktionell nach AT-Saisonkalendern.</p>`;
  $("close").onclick = () => $("dlg").close();
  if (rc) $("szIng").onclick = () => ingFilter(it);
  if (!$("dlg").open) $("dlg").showModal();
  $("close").focus();
}

/* Rezeptdetail: Saison-Hinweis zu den Obst-/Gemüse-Zutaten */
const _openR = openR;
openR = function (r) {
  _openR.apply(this, arguments);
  if (!SZ.length || !r) return;
  const p = produceOf(r).filter(it => !it.f.includes("tk")); if (!p.length) return;
  const ok = inSeason(r, month);
  const li = p.map(it => { const st = status(it, month);
    return `<li><button type="button" class="iconbtn" data-szr="${esc(it.s)}" style="font-size:13px;color:var(--ink)">${esc(it.n)}</button> <span class="note">${st[1]}${st[0] === "no" ? ` · Saison: ${esc(ranges(it.fr) || ranges(it.gw))}` : ""}</span></li>`; }).join("");
  const box = `<div class="box" id="szBox"><h3>Saison im ${MON[month]}</h3>
    <p style="margin:0 0 6px">${ok ? `<span class="pill">Passt zur Saison</span>` : `<span class="pill warn">Nicht ganz saisonal</span>`}</p>
    <ul class="ing">${li}</ul></div>`;
  const anchor = $("rate"); if (anchor) anchor.insertAdjacentHTML("beforebegin", box); else $("dlgbody").insertAdjacentHTML("beforeend", box);
  $("szBox").onclick = e => { const b = e.target.closest("[data-szr]"); if (b) openItem(BY_S[b.dataset.szr]); };
};

/* Tab-Wechsel */
const _show = showTab;
showTab = function (t) { _show.apply(this, arguments); if (t === "saison") renderSaison(); };

fetch("saison.json").then(r => r.json()).then(d => {
  SZ = d.items; BY = Object.fromEntries(SZ.map(it => [it.n, it])); BY_S = Object.fromEntries(SZ.map(it => [it.s, it]));
  if (R.length) { buildDims(); render(); }
  if (typeof tab !== "undefined" && tab === "saison") renderSaison();
  document.dispatchEvent(new Event("saison-ready"));
}).catch(() => { if (sec) sec.innerHTML = `<p class="note">Der Saisonkalender konnte nicht geladen werden. Seite neu laden.</p>`; });
})();
