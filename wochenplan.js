/* Wochenplan – eigenes Modul für die Rezept-App.
   Nutzt globale Helfer aus index.html: R, ratings, persons, setPersons, openR, esc, srcBadge, scaleRaw, catOf, CATS, amount.
   Optional aus saison.js: window.seasonScore(r) (0..1).
   Die Planungslogik (WP.engine) hängt nicht vom DOM ab und wird in tests/wochenplan_test.js geprüft. */
(function (root) {
"use strict";

/* ---------- Konstanten ---------- */
const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const SLOTS = [["fr", "Frühstück"], ["mi", "Mittagessen"], ["sn", "Snack"], ["ab", "Abendessen"]];
const SLOT = Object.fromEntries(SLOTS);
const SHARE = {fr: .25, mi: .35, sn: .10, ab: .30};
// kcal je Stunde: Richtwerte aus deinen Strava-Aktivitäten (Sep–Okt 2026); Schwimmen ohne eigene Daten geschätzt
const SPORTS = {radfahren: ["Radfahren", 500], laufen: ["Laufen", 650], schwimmen: ["Schwimmen", 500], krafttraining: ["Krafttraining", 550]};
const TIMES = {morgens: "morgens", mittags: "mittags", abends: "abends"};
// Ziele: Kalorienfaktor, Eiweiß-Energieanteil (ohne Gewicht) bzw. g je kg (mit Gewicht), Fett-Obergrenze
const GOALS = {
  ausgewogen: {l: "Ausgewogen", f: 1, p: .16, pkg: 1.0, fat: .32},
  proteinreich: {l: "Proteinreich", f: 1, p: .25, pkg: 1.8, fat: .32},
  kalorienarm: {l: "Kalorienarm", f: .8, p: .25, pkg: 1.6, fat: .30},
  kalorienreich: {l: "Kalorienreich", f: 1.2, p: .16, pkg: 1.4, fat: .35},
};
const DIETS = [["ernaehrungsform:vegetarisch", "Vegetarisch"], ["ernaehrungsform:vegan", "Vegan"],
  ["ernaehrungsform:laktosefrei", "Laktosefrei"], ["ernaehrungsform:glutenfrei", "Glutenfrei"]];
const MAINCAT = ["gefluegel", "rind", "schwein", "lamm", "wild", "fleisch", "fisch", "huelsenfruechte", "tofu_tempeh", "eier", "kaese",
  "nudeln", "reis", "kartoffel", "getreide", "eintopf", "auflauf", "salat", "gemuese"];
const RED = ["rind", "schwein", "lamm", "wild"];
const RATE = {"sehr gut": 0, "gut": .3, "bedingt": 1.2, "ungeeignet": 2.5};
const BF_YES = /porridge|oats|müsli|muesli|granola|pancake|pfannkuchen|rührei|omelett|shakshuka|frühstück|chia|french toast|toast|joghurt|skyr|smoothie|quark|waffel/i;
const BF_CORE = /porridge|oats|müsli|muesli|granola|pancake|pfannkuchen|waffel|french toast|bowl|chia/i;
const BF_NO = /marmelade|konfitüre|gelee|semmel|brötchen|brot selber|tortilla|wrap-teig|grundrezept|^brot\b|aufstrich|sirup|naan|zimtschnecke|donut|muffin|mousse|tiramisu|gugelhupf|kuchen/i;
const MAIN_ART = ["nudeln", "reis", "kartoffel", "huelsenfruechte", "tofu_tempeh", "auflauf", "eintopf", "braten", "gemuese", "getreide"];
const NOT_MEAL = /ideen\b|teig\b|grundrezept|\bsauce\b|soße selber|\bdip\b|dressing|marinade|gewürzmischung/i;

const DEFAULTS = {kcal: 2200, kg: "", goal: "ausgewogen", diet: [], guenstig: false, schnell: true, reste: false,
  slots: {fr: true, mi: true, sn: false, ab: true}, sport: Array.from({length: 7}, () => ({s: "", min: 60, at: "abends"}))};

/* ---------- Planungslogik (rein, testbar) ---------- */
function engine(ctx) {
  // ctx: {R, ratings, seasonScore?, rnd?}
  const rnd = ctx.rnd || Math.random;
  const has = (r, t) => r.tags.includes(t);
  const rt = r => (ctx.ratings && ctx.ratings[r.id]) || null;
  // Hauptkomponente aus Tags, sonst aus den Kernzutaten (viele Rezepte sind nicht vollständig getaggt)
  const ingCat = r => {
    if (r._wpc !== undefined) return r._wpc;
    let c = null;
    for (const i of r.ing) {
      if (i[1] !== "k" || !i[3]) continue;
      if (i[5] === "fisch") { c = "fisch"; break; }
      if (i[5] === "fleisch") c = /hähnchen|huhn|pute|ente/i.test(i[3]) ? "gefluegel" : /lamm/i.test(i[3]) ? "lamm" : /rind/i.test(i[3]) ? "rind" : "schwein";
    }
    return (r._wpc = c);
  };
  const mainCat = r => { const ic = ingCat(r); if (ic === "fisch") return ic;
    for (const c of MAINCAT) if (has(r, "gerichtart:" + c)) return c; return ic; };
  const isRed = r => !has(r, "ernaehrungsform:vegetarisch") && (RED.some(c => has(r, "gerichtart:" + c)) || ["rind", "schwein", "lamm"].includes(ingCat(r)));

  function eligible(r, S) {
    if (!r.wk || !r.n || r.status === "pruefen" || r.ing.length < 2 || !r.st.length) return false;
    if (has(r, "gang:getraenk") || has(r, "gang:grundrezept") || has(r, "gang:sauce") || NOT_MEAL.test(r.t)) return false;
    const x = rt(r); if (x && x.verdict === "aussortieren") return false;
    // Plausibilität: mehr als 1,3 kg Zutaten je Portion deutet auf falsche Mengen/Portionsangabe hin
    if (r._wpg === undefined) r._wpg = r.ing.reduce((a, i) => a + (i[4] || 0), 0) / (r.sv || 1);
    if (r._wpg > 1300) return false;
    return S.diet.every(t => has(r, t));
  }
  function slotOk(r, slot) {
    const k = r.n[0];
    if (slot === "fr") return (has(r, "gang:fruehstueck") || BF_YES.test(r.t)) && !BF_NO.test(r.t) &&
      !((has(r, "gang:gebaeck") || has(r, "gang:dessert")) && !BF_CORE.test(r.t)) && !has(r, "gang:sauce") && k >= 150 && k <= 900;
    if (slot === "sn") return (has(r, "gang:snack") || has(r, "gang:rad_snack")) && k >= 80 && k <= 650;
    const untagged = !r.tags.some(t => t.startsWith("gang:")) && !has(r, "geschmack:suess") && k >= 250 && r.n[1] >= 12 &&
      (ingCat(r) || MAIN_ART.some(c => has(r, "gerichtart:" + c)));
    return (has(r, "gang:hauptgericht") || has(r, "gang:suppe") || has(r, "gerichtart:eintopf") || has(r, "gerichtart:auflauf") ||
      (has(r, "gerichtart:salat") && k >= 250) || untagged) && !has(r, "gang:dessert") && !has(r, "gang:gebaeck") && !has(r, "gang:fruehstueck") && k >= 200 && k <= 1400;
  }
  function pools(S) {
    const P = {fr: [], mi: [], sn: [], ab: []};
    for (const r of ctx.R) {
      if (!eligible(r, S)) continue;
      for (const s of ["fr", "mi", "sn"]) if (slotOk(r, s)) P[s].push(r);
    }
    P.ab = P.mi;
    return P;
  }

  /* Tagesziele: kcal, Eiweiß (g), Rolle der Mahlzeiten rund ums Training */
  function dayTarget(S, d) {
    const g = GOALS[S.goal] || GOALS.ausgewogen, sp = S.sport[d] || {};
    const sk = sp.s && SPORTS[sp.s] ? Math.round(SPORTS[sp.s][1] * (sp.min || 60) / 60) : 0;
    const kcal = Math.round(S.kcal * g.f + sk);
    const kg = +S.kg || 0;
    const kraft = sp.s === "krafttraining";
    const prot = kg ? kg * (g.pkg + (kraft ? .2 : 0)) : kcal * (g.p + (kraft ? .03 : 0)) / 4;
    const roles = {}; // slot -> {sport, timing}
    let snackRole = null;
    if (sp.s) {
      if (sp.at === "morgens") { roles.fr = "nachher"; }
      else if (sp.at === "mittags") { roles.fr = "vorher"; roles.mi = "nachher"; }
      else { roles.mi = "vorher"; roles.ab = "nachher"; }
      if (sp.s === "radfahren" && sp.min >= 90) snackRole = "unterwegs";
      else if ((sp.min || 0) >= 60 && sp.at !== "morgens") snackRole = "vorher";
    }
    return {kcal, prot: Math.round(prot), sportKcal: sk, sport: sp.s || "", min: sp.min, at: sp.at, roles, snackRole, fat: g.fat};
  }
  function slotsOf(S, T) {
    return SLOTS.map(s => s[0]).filter(s => S.slots[s] || (s === "sn" && T.snackRole));
  }

  /* Bewertung eines Kandidaten für einen Platz (kleiner = besser) */
  function score(r, slot, need, S, T, st, d) {
    const n = r.n, kcal = n[0];
    const raw = need.kcal / kcal;
    let s = 2 * Math.abs(Math.log(raw));
    if (raw > 2 || raw < .5) s += 2 + Math.abs(Math.log(raw));
    const f = Math.min(2, Math.max(.5, raw));
    // Eiweiß
    const pd = need.prot > 0 ? Math.max(0, need.prot - n[1] * f) / need.prot : 0;
    s += pd * (S.goal === "proteinreich" ? 5 : 2.5);
    // Fett-Anteil
    const fp = n[3] * 9 / Math.max(kcal, 1);
    if (fp > T.fat + .08) s += (fp - T.fat - .08) * 6;
    // Ballaststoffe
    s -= Math.min(n[4] * f, 10) / 10 * .4;
    // Kosten
    const cost = (n[6] || 2) * f;
    s += S.guenstig ? cost / 1.5 : cost / 8;
    // Zeit unter der Woche
    if (S.schnell && d < 5 && slot !== "sn") s += r.tm ? (r.tm > 30 ? Math.min(3, (r.tm - 30) / 15 + 1) : 0) : .5;
    // Datenqualität
    s += (1 - n[5]) * 1.2;
    // Abwechslung
    const mc = mainCat(r);
    if (mc && slot !== "fr" && slot !== "sn") {
      s += (st.cat[mc] || 0) * .45 + (st.dayCat[d] && st.dayCat[d][mc] ? 1.2 : 0);
      if (isRed(r) && st.red >= 2) s += 1.5;
      if (mc === "fisch" && !st.cat.fisch && d >= 1) s -= 1.2 + d * .3;
      if (mc === "huelsenfruechte" && (st.cat.huelsenfruechte || 0) < 2) s -= .4;
    }
    for (const t of r.tags) if (t.startsWith("kueche:") && t !== "kueche:international") s += (st.cuisine[t] || 0) * .12;
    if (slot === "fr" && st.used.has(r.id)) s += 1.2;
    // Sport
    const role = slot === "sn" ? T.snackRole : T.roles[slot];
    if (role && T.sport) {
      if (role === "unterwegs") s += has(r, "gang:rad_snack") ? -.8 : .6;
      const h = r.sp.find(x => x[0] === T.sport && x[1] === (role === "unterwegs" ? "vorher" : role));
      s += h ? RATE[h[2]] ?? 1 : .8;
    }
    // Bewertungen
    const x = rt(r);
    if (x) { s -= ((x.stars || 3) - 3) * .35; if (x.verdict === "nochmal_kochen") s -= .6; if (x.verdict === "ueberarbeiten") s += .3; }
    // Saison
    if (ctx.seasonScore) { try { s -= .6 * (+ctx.seasonScore(r) || 0) } catch (e) {} }
    return s + rnd() * .5;
  }
  function pick(cands) {
    cands.sort((a, b) => a[1] - b[1]);
    const top = cands.slice(0, 6), s0 = top[0][1];
    const w = top.map(c => Math.exp(-(c[1] - s0) / .3)), sum = w.reduce((a, b) => a + b, 0);
    let x = rnd() * sum;
    for (let i = 0; i < top.length; i++) { x -= w[i]; if (x <= 0) return top[i][0]; }
    return top[0][0];
  }
  const q4 = f => Math.min(2, Math.max(.5, Math.round(f * 4) / 4));

  function newState() { return {used: new Set(), cat: {}, dayCat: {}, cuisine: {}, red: 0}; }
  function account(st, r, d, slot) {
    st.used.add(r.id);
    const mc = mainCat(r);
    if (mc && slot !== "fr" && slot !== "sn") { st.cat[mc] = (st.cat[mc] || 0) + 1; (st.dayCat[d] ||= {})[mc] = 1; if (isRed(r)) st.red++; }
    for (const t of r.tags) if (t.startsWith("kueche:")) st.cuisine[t] = (st.cuisine[t] || 0) + 1;
  }

  /* Bedarf eines Platzes aus dem, was der Tag schon hat */
  function needFor(slot, day, T, slots, byId) {
    let k = 0, p = 0, rest = 0;
    for (const s of slots) {
      const m = day[s];
      if (m && s !== slot) { const r = byId[m.id]; k += r.n[0] * m.f; p += r.n[1] * m.f; }
      else rest += SHARE[s];
    }
    const share = SHARE[slot] / (rest || SHARE[slot]);
    return {kcal: Math.max(150, (T.kcal - k) * share), prot: Math.max(0, (T.prot - p) * share)};
  }
  function rescale(day, T, slots, byId) {
    let tot = 0;
    for (const s of slots) if (day[s]) tot += byId[day[s].id].n[0] * day[s].f;
    if (!tot) return;
    const k = T.kcal / tot;
    for (const s of slots) if (day[s]) day[s].f = q4(day[s].f * k);
  }

  function generate(S) {
    const P = pools(S), byId = {};
    ctx.R.forEach(r => byId[r.id] = r);
    const st = newState(), days = [];
    for (let d = 0; d < 7; d++) {
      const T = dayTarget(S, d), slots = slotsOf(S, T), day = {};
      // Reste: Abendessen vom Vortag wird Mittagessen
      if (S.reste && d > 0 && slots.includes("mi") && days[d - 1].ab && !days[d - 1].ab.rest) {
        const prev = days[d - 1].ab; prev.double = true;
        day.mi = {id: prev.id, f: 1, rest: true};
      }
      for (const slot of ["ab", "mi", "fr", "sn"]) {   // großes zuerst, Frühstück/Snack gleichen aus
        if (!slots.includes(slot) || day[slot]) continue;
        const need = needFor(slot, day, T, slots, byId);
        const pool = P[slot].filter(r => slot === "fr" ? (st.used.has(r.id) ? countUse(days, r.id) < 2 : true) : !st.used.has(r.id));
        if (!pool.length) continue;
        const r = pick(pool.map(r => [r, score(r, slot, need, S, T, st, d)]));
        day[slot] = {id: r.id, f: q4(need.kcal / r.n[0])};
        account(st, r, d, slot);
      }
      rescale(day, T, slots, byId);
      days.push(day);
    }
    return {days, at: new Date().toISOString(), v: 1};
  }
  function countUse(days, id) { let n = 0; days.forEach(dd => Object.values(dd).forEach(m => { if (m.id === id) n++; })); return n; }

  /* Einen Platz neu würfeln */
  function swap(plan, S, d, slot) {
    const P = pools(S), byId = {};
    ctx.R.forEach(r => byId[r.id] = r);
    const st = newState();
    plan.days.forEach((dd, i) => Object.entries(dd).forEach(([s, m]) => { if ((i !== d || s !== slot) && byId[m.id] && !m.rest) account(st, byId[m.id], i, s); }));
    const T = dayTarget(S, d), slots = slotsOf(S, T), day = plan.days[d], old = day[slot];
    const need = needFor(slot, day, T, slots, byId);
    const pool = P[slot].filter(r => r.id !== (old && old.id) && (slot === "fr" || !st.used.has(r.id)));
    if (!pool.length) return false;
    const r = pick(pool.map(r => [r, score(r, slot, need, S, T, st, d)]));
    day[slot] = {id: r.id, f: q4(need.kcal / r.n[0])};
    // Reste-Kette mitziehen
    if (slot === "ab" && old && old.double && plan.days[d + 1] && plan.days[d + 1].mi && plan.days[d + 1].mi.rest) {
      day.ab.double = true; plan.days[d + 1].mi.id = r.id;
      const T2 = dayTarget(S, d + 1); rescale(plan.days[d + 1], T2, slotsOf(S, T2), byId);
    }
    if (slot === "mi" && old && old.rest && plan.days[d - 1] && plan.days[d - 1].ab) delete plan.days[d - 1].ab.double;
    rescale(day, T, slots, byId);
    return true;
  }

  /* Kennzahlen für Tag und Woche (auch für die Selbstprüfung) */
  function stats(plan, S) {
    const byId = {}; ctx.R.forEach(r => byId[r.id] = r);
    const days = plan.days.map((dd, d) => {
      const T = dayTarget(S, d); let k = 0, p = 0, c = 0, fa = 0, fi = 0, eur = 0;
      Object.values(dd).forEach(m => { const r = byId[m.id]; if (!r) return;
        k += r.n[0] * m.f; p += r.n[1] * m.f; c += r.n[2] * m.f; fa += r.n[3] * m.f; fi += r.n[4] * m.f; eur += (r.n[6] || 0) * m.f; });
      return {T, kcal: Math.round(k), prot: Math.round(p), carbs: Math.round(c), fat: Math.round(fa), fiber: Math.round(fi), eur};
    });
    const cats = {}, ids = new Set(); let red = 0;
    plan.days.forEach(dd => Object.entries(dd).forEach(([s, m]) => { const r = byId[m.id]; if (!r) return; ids.add(m.id);
      if (m.rest || s === "fr" || s === "sn") return; const mc = mainCat(r); if (mc) cats[mc] = (cats[mc] || 0) + 1; if (isRed(r)) red++; }));
    const sum = k => days.reduce((a, x) => a + x[k], 0);
    const kcalT = days.reduce((a, x) => a + x.T.kcal, 0), protT = days.reduce((a, x) => a + x.T.prot, 0);
    const e = sum("prot") * 4 + sum("carbs") * 4 + sum("fat") * 9 || 1;
    return {days, kcal: sum("kcal"), kcalT, prot: sum("prot"), protT, fiber: sum("fiber"), eur: sum("eur"),
      pPct: sum("prot") * 4 / e, cPct: sum("carbs") * 4 / e, fPct: sum("fat") * 9 / e, cats, red, distinct: ids.size};
  }
  return {generate, swap, stats, dayTarget, slotsOf, pools};
}

function checks(x, S) {
  const veg = S.diet.includes("ernaehrungsform:vegetarisch") || S.diet.includes("ernaehrungsform:vegan");
  const dev = x.kcal / x.kcalT - 1, out = [];
  const worst = Math.max(...x.days.map(d => Math.abs(d.kcal / d.T.kcal - 1)));
  out.push([Math.abs(dev) <= .05 && worst <= .12, `Kalorien: Ø ${fmt(x.kcal / 7)} von ${fmt(x.kcalT / 7)} kcal am Tag` + (worst > .12 ? ` (ein Tag weicht ${Math.round(worst * 100)} % ab)` : "")]);
  out.push([x.prot >= x.protT * .9, `Eiweiß: Ø ${Math.round(x.prot / 7)} g von ${Math.round(x.protT / 7)} g am Tag`]);
  out.push([x.fiber / 7 >= 30, `Ballaststoffe: Ø ${Math.round(x.fiber / 7)} g am Tag (Empfehlung mind. 30 g)`]);
  out.push([x.fPct <= (GOALS[S.goal] || GOALS.ausgewogen).fat + .05, `Energie aus Eiweiß/Kohlenhydraten/Fett: ${pct(x.pPct)} / ${pct(x.cPct)} / ${pct(x.fPct)}`]);
  if (!veg) out.push([(x.cats.fisch || 0) >= 1, `Fisch: ${x.cats.fisch || 0}× (Empfehlung 1–2× pro Woche)`]);
  if (!veg) out.push([x.red <= 3, `Fleisch: ${x.red}× (Empfehlung höchstens 2–3× pro Woche)`]);
  out.push([(x.cats.huelsenfruechte || 0) + (x.cats.tofu_tempeh || 0) >= 2, `Hülsenfrüchte & Tofu: ${(x.cats.huelsenfruechte || 0) + (x.cats.tofu_tempeh || 0)}× (Empfehlung mind. 2×)`]);
  out.push([true, `${x.distinct} verschiedene Gerichte`]);
  return out;
}
const fmt = n => Math.round(n).toLocaleString("de-AT");
const pct = n => Math.round(n * 100) + " %";
const fmtF = f => { const w = Math.floor(f), r = f - w, fr = {.25: "¼", .5: "½", .75: "¾"}[r] || "";
  return (w ? w : "") + fr || "0"; };

const WP = {engine, checks, DEFAULTS, DAYS, SLOTS, SPORTS, GOALS, DIETS, fmtF};
if (typeof module !== "undefined" && module.exports) { module.exports = WP; return; }
root.WP = WP;

/* ---------- Oberfläche ---------- */
const doc = root.document;
const css = `
#v-plan .wp-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px }
#v-plan details.panel > summary { cursor: pointer; font-weight: 700; font-family: var(--display); font-size: 1.1rem; list-style: none; display: flex; justify-content: space-between; gap: 8px; align-items: center; min-height: 44px }
#v-plan details.panel > summary::-webkit-details-marker { display: none }
#v-plan details.panel > summary::after { content: "▾"; color: var(--muted) } #v-plan details.panel[open] > summary::after { content: "▴" }
.wp-form { display: grid; gap: 14px }
.wp-row { display: grid; grid-template-columns: 9em minmax(0, 1fr); gap: 6px 12px; align-items: center }
.wp-row > .flabel { padding-top: 0 }
@media (max-width: 520px) { .wp-row { grid-template-columns: 1fr } }
.wp-form input[type=number] { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; width: 7.5em; min-height: 44px }
.wp-form select, .wp-sport select { min-height: 44px }
.wp-form .chip, .wp-sport .chip { min-height: 36px; padding: 6px 12px }
.wp-sport { display: grid; gap: 6px }
.wp-sport .sd { display: grid; grid-template-columns: 6.5em minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap: 6px; align-items: center }
.wp-sport .sd select { width: 100%; padding: 8px 6px }
@media (max-width: 520px) { .wp-sport .sd { grid-template-columns: 1fr 1fr 1fr; } .wp-sport .sd b { grid-column: 1 / -1 } }
.wp-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.wp-actions .btn { min-height: 44px }
.wp-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 14px }
.wp-checks li { display: grid; grid-template-columns: 1.4em 1fr; gap: 4px }
.wp-checks .ok { color: var(--accent); font-weight: 700 } .wp-checks .no { color: var(--warn); font-weight: 700 }
.wp-day { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 14px; display: grid; gap: 8px; min-width: 0 }
.wp-day h3 { font-size: 1.1rem; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline }
.wp-day .tot { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums }
.wp-hint { font-size: 13px; background: var(--accent-soft); color: var(--ink); border-radius: 10px; padding: 8px 10px; margin: 0 }
.wp-meals { list-style: none; margin: 0; padding: 0; display: grid }
.wp-meal { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; padding: 8px 0; border-top: 1px dashed var(--line); align-items: start }
.wp-meal .slot { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700 }
.wp-meal .ttl { all: unset; cursor: pointer; font-weight: 600; display: block; line-height: 1.3; overflow-wrap: anywhere }
.wp-meal .ttl:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px }
.wp-meal .ttl:hover { text-decoration: underline }
.wp-meal .facts { margin-top: 2px }
.wp-meal .pills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px }
.wp-meal .iconbtn { min-height: 40px; min-width: 44px }
.wp-days { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 12px }
.tabs { overflow-x: auto }
`;

let S = load("wp-settings", null), plan = load("wp-plan", null), wchecked = load("wp-checked", {});
S = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), S || {});
if (!Array.isArray(S.sport) || S.sport.length !== 7) S.sport = JSON.parse(JSON.stringify(DEFAULTS.sport));
function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def } catch (e) { return def } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
const g = id => doc.getElementById(id);
const E = () => engine({R: root.R || R, ratings: typeof ratings !== "undefined" ? ratings : {}, seasonScore: root.seasonScore});
const byId = () => { const m = {}; R.forEach(r => m[r.id] = r); return m; };

function mount() {
  let sec = g("v-plan");
  if (!sec) { sec = doc.createElement("section"); sec.id = "v-plan"; sec.hidden = true; doc.querySelector(".wrap").appendChild(sec); }
  if (!doc.querySelector('.tabs [data-tab="plan"]')) {
    const b = doc.createElement("button"); b.type = "button"; b.dataset.tab = "plan"; b.setAttribute("aria-pressed", "false"); b.textContent = "Wochenplan";
    const tabs = doc.querySelector(".tabs"); tabs.insertBefore(b, tabs.querySelector('[data-tab="liste"]'));
  }
  const st = doc.createElement("style"); st.textContent = css; doc.head.appendChild(st);
  sec.innerHTML = `
  <div class="wp-grid">
    <details class="panel" id="wpSet" ${plan ? "" : "open"}><summary>Vorgaben <span class="note" id="wpSetSum" style="font:400 13px var(--body)"></span></summary>
      <form class="wp-form" id="wpForm" onsubmit="return false">
        <div class="wp-row"><span class="flabel" id="wpGoalL">Ziel</span><div class="chips" role="group" aria-labelledby="wpGoalL" id="wpGoal"></div></div>
        <div class="wp-row"><span class="flabel" id="wpDietL">Ernährung</span><div class="chips" role="group" aria-labelledby="wpDietL" id="wpDiet"></div></div>
        <div class="wp-row"><span class="flabel" id="wpOptL">Wünsche</span><div class="chips" role="group" aria-labelledby="wpOptL" id="wpOpt"></div></div>
        <div class="wp-row"><span class="flabel" id="wpSlotL">Mahlzeiten</span><div class="chips" role="group" aria-labelledby="wpSlotL" id="wpSlots"></div></div>
        <div class="wp-row"><label class="flabel" for="wpKcal">Grundbedarf</label><div><input type="number" id="wpKcal" min="1200" max="5000" step="50" inputmode="numeric"> <span class="note">kcal am Tag ohne Sport</span></div></div>
        <div class="wp-row"><label class="flabel" for="wpKg">Gewicht</label><div><input type="number" id="wpKg" min="35" max="200" step="1" inputmode="numeric" placeholder="optional"> <span class="note">kg, für das Eiweißziel</span></div></div>
        <div class="wp-row" style="align-items:start"><span class="flabel" style="padding-top:10px">Training</span><div class="wp-sport" id="wpSport"></div></div>
        <p class="note" style="margin:0">Sport-Kalorien je Stunde aus deinen Strava-Aktivitäten: Rad ca. 500, Laufen ca. 650, Kraft ca. 550 kcal (Schwimmen geschätzt 500).</p>
      </form>
    </details>
    <div class="wp-actions"><button class="btn primary" type="button" id="wpGo">Neuen Wochenplan erstellen</button>
      <div class="persons" role="group" aria-labelledby="wpPersL" style="margin:0"><span id="wpPersL">Für</span>
        <button class="round small" type="button" id="wpPMinus" aria-label="Eine Person weniger">−</button><output id="wpPN" aria-live="polite"></output>
        <button class="round small" type="button" id="wpPPlus" aria-label="Eine Person mehr">+</button><span id="wpPTxt"></span></div>
      <span class="note" id="wpMsg" aria-live="polite"></span></div>
    <div class="panel" id="wpSum" hidden></div>
    <div class="wp-days" id="wpDays"></div>
    <div class="panel shop" id="wpShop" hidden></div>
  </div>`;
  buildForm();
  g("wpGo").onclick = () => { if (!R.length) return; plan = E().generate(S); store("wp-plan", plan); wchecked = {}; store("wp-checked", wchecked);
    g("wpSet").open = false; render(); g("wpMsg").textContent = "Neuer Plan erstellt."; g("wpSum").focus && g("wpSum").scrollIntoView({block: "start", behavior: "smooth"}); };
  g("wpPMinus").onclick = () => { setPersons(persons - 1); render(); };
  g("wpPPlus").onclick = () => { setPersons(persons + 1); render(); };
  g("wpDays").onclick = e => {
    const o = e.target.closest("[data-open]"), s = e.target.closest("[data-swap]");
    if (o) openR(R.find(r => r.id === o.dataset.open));
    if (s) { const [d, slot] = s.dataset.swap.split("|"); if (E().swap(plan, S, +d, slot)) { store("wp-plan", plan); render();
      const b = doc.querySelector(`[data-swap="${d}|${slot}"]`); if (b) b.focus(); g("wpMsg").textContent = `${SLOT[slot]} am ${DAYS[d]} getauscht.`; } }
  };
  g("wpShop").onchange = e => { const k = e.target.dataset.k; if (!k) return; e.target.checked ? wchecked[k] = 1 : delete wchecked[k];
    e.target.closest("li").classList.toggle("done", e.target.checked); store("wp-checked", wchecked); };
  g("wpShop").onclick = e => { if (e.target.id === "wpCopy") copyList(); if (e.target.id === "wpUncheck") { wchecked = {}; store("wp-checked", wchecked); render(); } };
}

function chipsHtml(list, isOn, attr) { return list.map(([k, l]) => `<button type="button" class="chip" ${attr}="${k}" aria-pressed="${isOn(k)}">${l}</button>`).join(""); }
function buildForm() {
  const OPTS = [["guenstig", "Kostengünstig"], ["schnell", "Unter der Woche schnell (≤ 30 Min.)"], ["reste", "Reste einplanen (abends doppelt, mittags Rest)"]];
  const sync = () => {
    g("wpGoal").innerHTML = chipsHtml(Object.entries(GOALS).map(([k, v]) => [k, v.l]), k => S.goal === k, "data-goal");
    g("wpDiet").innerHTML = chipsHtml(DIETS, k => S.diet.includes(k), "data-diet");
    g("wpOpt").innerHTML = chipsHtml(OPTS, k => !!S[k], "data-opt");
    g("wpSlots").innerHTML = chipsHtml(SLOTS, k => !!S.slots[k], "data-slot");
    const sp = S.sport.filter(x => x.s).length;
    g("wpSetSum").textContent = `${GOALS[S.goal].l}${S.diet.length ? ", " + DIETS.filter(x => S.diet.includes(x[0])).map(x => x[1].toLowerCase()).join(", ") : ""}, ${sp ? sp + "× Training" : "kein Training"}`;
  };
  g("wpForm").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.goal) { S.goal = b.dataset.goal; if (S.goal === "proteinreich" || S.goal === "kalorienreich") S.slots.sn = true; }
    if (b.dataset.diet) { const t = b.dataset.diet; S.diet = S.diet.includes(t) ? S.diet.filter(x => x !== t) : [...S.diet, t];
      if (t === "ernaehrungsform:vegan" && S.diet.includes(t) && !S.diet.includes("ernaehrungsform:vegetarisch")) S.diet.push("ernaehrungsform:vegetarisch"); }
    if (b.dataset.opt) S[b.dataset.opt] = !S[b.dataset.opt];
    if (b.dataset.slot) { S.slots[b.dataset.slot] = !S.slots[b.dataset.slot]; if (!["fr", "mi", "ab"].some(s => S.slots[s])) S.slots.ab = true; }
    store("wp-settings", S); sync(); const again = g("wpForm").querySelector(`[${Object.keys(b.dataset).map(k => "data-" + k)[0]}="${Object.values(b.dataset)[0]}"]`); if (again) again.focus();
  };
  g("wpKcal").value = S.kcal; g("wpKg").value = S.kg;
  g("wpKcal").onchange = () => { const v = +g("wpKcal").value; S.kcal = v >= 1200 && v <= 5000 ? v : DEFAULTS.kcal; g("wpKcal").value = S.kcal; store("wp-settings", S); };
  g("wpKg").onchange = () => { const v = +g("wpKg").value; S.kg = v >= 35 && v <= 200 ? v : ""; g("wpKg").value = S.kg; store("wp-settings", S); };
  const MIN = [30, 45, 60, 75, 90, 120, 180, 240];
  g("wpSport").innerHTML = DAYS.map((d, i) => `<div class="sd" role="group" aria-label="Training ${d}"><b>${d}</b>
    <select data-sp="${i}" aria-label="Sport am ${d}"><option value="">Ruhetag</option>${Object.entries(SPORTS).map(([k, v]) => `<option value="${k}" ${S.sport[i].s === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select>
    <select data-min="${i}" aria-label="Dauer am ${d}" ${S.sport[i].s ? "" : "disabled"}>${MIN.map(m => `<option value="${m}" ${S.sport[i].min === m ? "selected" : ""}>${m < 60 ? m + " Min." : (m / 60).toString().replace(".", ",") + " Std."}</option>`).join("")}</select>
    <select data-at="${i}" aria-label="Tageszeit am ${d}" ${S.sport[i].s ? "" : "disabled"}>${Object.keys(TIMES).map(t => `<option value="${t}" ${S.sport[i].at === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>`).join("");
  g("wpSport").onchange = e => { const t = e.target, i = +(t.dataset.sp ?? t.dataset.min ?? t.dataset.at);
    if (t.dataset.sp !== undefined) { S.sport[i].s = t.value; g("wpSport").querySelectorAll(`[data-min="${i}"],[data-at="${i}"]`).forEach(x => x.disabled = !t.value); }
    if (t.dataset.min !== undefined) S.sport[i].min = +t.value;
    if (t.dataset.at !== undefined) S.sport[i].at = t.value;
    store("wp-settings", S); sync(); };
  sync();
}

function sportHint(T) {
  if (!T.sport) return "";
  const n = SPORTS[T.sport][0], when = T.at, r = T.roles, parts = [];
  parts.push(`<b>${n}</b> ${T.min >= 60 ? (T.min / 60).toString().replace(".", ",") + " Std." : T.min + " Min."} ${when}, ca. +${fmt(T.sportKcal)} kcal eingeplant.`);
  const v = Object.keys(r).find(s => r[s] === "vorher"), a = Object.keys(r).find(s => r[s] === "nachher");
  if (v) parts.push(`Vorher: ${SLOT[v]} 2–3 Std. vor dem Training, kohlenhydratbetont, wenig Fett und Ballaststoffe.`);
  else if (when === "morgens") parts.push("Vorher reicht eine Kleinigkeit (z. B. Banane).");
  if (a) parts.push(`Danach: ${SLOT[a]} ${T.sport === "krafttraining" ? "mit 20–40 g Eiweiß" : "zum Auffüllen der Kohlenhydrate plus 20–30 g Eiweiß"}.`);
  if (T.snackRole === "unterwegs") parts.push("Bei langen Ausfahrten: 30–60 g Kohlenhydrate pro Stunde unterwegs.");
  else if (T.snackRole) parts.push("Snack 1–2 Std. vor dem Training.");
  return `<p class="wp-hint">${parts.join(" ")}</p>`;
}

function render() {
  const N = persons;
  g("wpPN").textContent = N; g("wpPTxt").textContent = N === 1 ? "Person" : "Personen";
  g("wpPMinus").disabled = N <= 1; g("wpPPlus").disabled = N >= 20;
  if (!R.length) { g("wpMsg").textContent = "Rezepte werden geladen …"; return; }
  if (!plan) { g("wpDays").innerHTML = `<div class="empty" style="grid-column:1/-1"><p>Wähle oben deine Vorgaben und tippe auf „Neuen Wochenplan erstellen“.</p></div>`;
    g("wpSum").hidden = g("wpShop").hidden = true; return; }
  const M = byId(), e = E();
  // Rezepte, die es nicht mehr gibt oder die aussortiert wurden, ersetzen
  let fixed = 0;
  plan.days.forEach((dd, d) => Object.entries(dd).forEach(([s, m]) => { const r = M[m.id], x = typeof ratings !== "undefined" && ratings[m.id];
    if (!r || !r.n || (x && x.verdict === "aussortieren")) { if (e.swap(plan, S, d, s)) fixed++; } }));
  if (fixed) { store("wp-plan", plan); g("wpMsg").textContent = `${fixed} aussortierte Gerichte ersetzt.`; }
  const x = e.stats(plan, S);
  const ck = checks(x, S);
  g("wpSum").hidden = false;
  g("wpSum").innerHTML = `<h2>Woche im Überblick</h2>
    <ul class="wp-checks">${ck.map(([ok, t]) => `<li><span class="${ok ? "ok" : "no"}" aria-label="${ok ? "erfüllt" : "Hinweis"}">${ok ? "✓" : "!"}</span><span>${esc(t)}</span></li>`).join("")}</ul>
    <p class="note" style="margin:0">Ca. ${(x.eur * N).toFixed(2).replace(".", ",")} € Zutaten für ${N} ${N === 1 ? "Person" : "Personen"} (Richtpreise). Nährwerte aus den Zutaten berechnet, Portionen sind auf dein Tagesziel angepasst.</p>`;
  g("wpDays").innerHTML = plan.days.map((dd, d) => {
    const T = x.days[d].T, s = x.days[d];
    const slots = e.slotsOf(S, T).filter(k => dd[k]).concat(Object.keys(dd).filter(k => !e.slotsOf(S, T).includes(k)));
    return `<section class="wp-day" aria-labelledby="wpd${d}"><h3 id="wpd${d}">${DAYS[d]} ${T.sport ? `<span class="pill">${SPORTS[T.sport][0]}</span>` : ""}
      <span class="tot">${fmt(s.kcal)} / ${fmt(T.kcal)} kcal · ${s.prot} g Eiweiß</span></h3>
      ${sportHint(T)}
      <ul class="wp-meals">${slots.map(k => meal(dd[k], k, d, T, M)).join("")}</ul></section>`;
  }).join("");
  renderShop(M);
}

function meal(m, slot, d, T, M) {
  const r = M[m.id]; if (!r) return "";
  const role = slot === "sn" ? T.snackRole : T.roles[slot];
  const h = role && T.sport ? r.sp.find(x => x[0] === T.sport && x[1] === (role === "unterwegs" ? "vorher" : role)) : null;
  const label = slot === "sn" && T.snackRole ? (T.snackRole === "unterwegs" ? "Snack für unterwegs" : "Snack vor dem Training") : SLOT[slot];
  const pills = [];
  if (m.rest) pills.push(`<span class="pill">Rest vom Vortag</span>`);
  if (m.double) pills.push(`<span class="pill">Doppelt kochen, Rest für morgen Mittag</span>`);
  if (h) pills.push(`<span class="pill ${RATE[h[2]] >= 1.2 ? "warn" : ""}" title="${esc(h[3])}">${role === "nachher" ? "Nach" : "Vor"} dem Training: ${esc(h[2])}</span>`);
  return `<li class="wp-meal"><div><span class="slot">${label}</span>
    <button type="button" class="ttl" data-open="${esc(r.id)}">${srcBadge(r, 16)} ${esc(r.t)}</button>
    <div class="facts"><span>${fmtF(m.f)} ${m.f === 1 ? "Portion" : "Portionen"}</span><span>${fmt(r.n[0] * m.f)} kcal</span><span>${Math.round(r.n[1] * m.f)} g Eiweiß</span>${r.tm && !m.rest ? `<span>${r.tm} Min.</span>` : ""}</div>
    ${pills.length ? `<div class="pills">${pills.join("")}</div>` : ""}</div>
    <button type="button" class="iconbtn" data-swap="${d}|${slot}" aria-label="${label} am ${DAYS[d]} tauschen">Tauschen</button></li>`;
}

/* Einkaufsliste: nur Kernzutaten, Vorrat und Optionales eingeklappt, je Posten das Gericht mit Tagen */
const DS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
function shopItems(M) {
  const items = {}, cook = {};
  plan.days.forEach((dd, d) => Object.values(dd).forEach(m => { const r = M[m.id]; if (!r) return;
    const c = cook[r.id] ||= {r, port: 0, days: []}; c.port += m.f * persons; if (!m.rest && !c.days.includes(DS[d])) c.days.push(DS[d]); }));
  Object.values(cook).forEach(({r, port, days}) => {
    const f = r.sv ? port / r.sv : port, dish = `${r.t} (${days.join(", ")})`;
    r.ing.forEach(i => {
      const key = (i[1] === "o" ? "o|" : i[1] === "v" ? "v|" : "k|") + (i[3] || i[0].toLowerCase());
      const it = items[key] ||= {key, role: i[1], name: i[3] || scaleRaw(i[0], f), cat: i[3] ? catOf(i[5]) : "Sonstiges", g: 0, gAll: true, raws: [], dishes: []};
      if (i[4]) it.g += i[4] * f; else it.gAll = false;
      it.raws.push(scaleRaw(i[0], f)); if (!it.dishes.includes(dish)) it.dishes.push(dish);
    });
  });
  return Object.values(items);
}
function renderShop(M) {
  const items = shopItems(M);
  const li = it => `<li class="${wchecked[it.key] ? "done" : ""}"><input type="checkbox" data-k="${esc(it.key)}" ${wchecked[it.key] ? "checked" : ""} aria-label="${esc(it.name)} erledigt">
    <span class="what"><b>${esc(it.name)}</b> ${it.name !== amount(it) ? `<span class="note">${esc(amount(it))}</span>` : ""}<span class="for">für ${esc(it.dishes.join("; "))}</span></span></li>`;
  const kern = items.filter(i => i.role === "k"), opt = items.filter(i => i.role === "o"), vor = items.filter(i => i.role === "v");
  const groups = [...CATS.map(c => c[0]), "Sonstiges"].map(c => [c, kern.filter(i => i.cat === c).sort((a, b) => a.name.localeCompare(b.name, "de"))]).filter(x => x[1].length);
  g("wpShop").hidden = false;
  g("wpShop").innerHTML = `<div class="dlg-head"><h2>Einkaufsliste für die Woche</h2><div class="row-btns"><button class="btn" type="button" id="wpCopy">Kopieren</button><button class="btn" type="button" id="wpUncheck">Haken entfernen</button></div></div>
    <p class="note" style="margin:0">Nur was du wirklich brauchst, für ${persons} ${persons === 1 ? "Person" : "Personen"}. Reste sind schon eingerechnet.</p><p class="note" id="wpCopyMsg" aria-live="polite" style="margin:0"></p>` +
    groups.map(([c, xs]) => `<h3>${c}</h3><ul>${xs.map(li).join("")}</ul>`).join("") +
    (vor.length ? `<details><summary class="note" style="cursor:pointer;margin-top:12px;min-height:32px">Im Vorrat prüfen (${vor.length})</summary><ul>${vor.map(li).join("")}</ul></details>` : "") +
    (opt.length ? `<details><summary class="note" style="cursor:pointer;margin-top:8px;min-height:32px">Optionale Empfehlungen (${opt.length})</summary><ul>${opt.map(li).join("")}</ul></details>` : "");
}
async function copyList() {
  const items = shopItems(byId()).filter(i => i.role === "k" && !wchecked[i.key]);
  const txt = `Einkaufsliste Wochenplan (${persons} P.)\n\n` + [...CATS.map(c => c[0]), "Sonstiges"].map(c => { const xs = items.filter(i => i.cat === c);
    return xs.length ? c + "\n" + xs.map(i => `- ${i.name}${i.name !== amount(i) ? " (" + amount(i) + ")" : ""} – für ${i.dishes.join("; ")}`).join("\n") : ""; }).filter(Boolean).join("\n\n");
  try { await navigator.clipboard.writeText(txt); g("wpCopyMsg").textContent = "Kopiert. In Notizen oder Erinnerungen einfügen."; }
  catch (e) { g("wpCopyMsg").textContent = "Kopieren ging hier nicht. Liste bitte markieren und kopieren."; }
}

/* Einhängen: Tab-Anzeige über die bestehende showTab-Logik */
function init() {
  mount();
  const show = () => { if (!g("v-plan").hidden) render(); };
  doc.addEventListener("tab-shown", e => { if (e.detail === "plan") render(); });
  doc.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) setTimeout(show, 0); });
  doc.addEventListener("saison-ready", () => show());
  let tries = 0; const wait = setInterval(() => { if ((typeof R !== "undefined" && R.length) || ++tries > 120) { clearInterval(wait); show(); } }, 250);
}
if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
