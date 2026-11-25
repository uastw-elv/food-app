/* Kühlschrank – eigenes Modul für die Rezept-App.
   Tab "Kühlschrank": Zutaten per Kachel, Suche oder Foto angeben, passende Rezepte nach Abdeckung.
   Nutzt globale Helfer aus index.html: R, ratings, openR, togglePick, picks, esc, imgOf, srcBadge, showTab.
   Fotoerkennung nur in der Claude-App (claude.use("sample")). In der iPhone-App (pwa.js, claude.local) gibt es
   statt der Foto-Knöpfe einen Hinweis; Zutaten dort über Kacheln und Suche.
   Die Abgleich-Logik (KB.engine) hängt nicht vom DOM ab und wird in tests/kuehlschrank_test.js geprüft. */
(function (root) {
"use strict";

/* ---------- Stammdaten ---------- */
// Österreichische und umgangssprachliche Namen -> Name in der Rezept-DB
const SYN = {
  "paradeiser": "Tomate", "tomaten": "Tomate", "cocktailtomaten": "Tomate", "kirschtomaten": "Tomate", "erdäpfel": "Kartoffel", "erdapfel": "Kartoffel",
  "kartoffeln": "Kartoffel", "karfiol": "Blumenkohl", "topfen": "Quark (Topfen)", "quark": "Quark (Topfen)", "obers": "Schlagsahne", "schlagobers": "Schlagsahne",
  "sahne": "Schlagsahne", "rahm": "Saure Sahne", "sauerrahm": "Saure Sahne", "schmand": "Saure Sahne", "faschiertes": "Rinderhackfleisch",
  "hackfleisch": "Rinderhackfleisch", "hack": "Rinderhackfleisch", "melanzani": "Aubergine", "fisolen": "Grüne Bohnen", "bohnen": "Grüne Bohnen",
  "huhn": "Hähnchenbrust", "hühnerfleisch": "Hähnchenbrust", "hähnchen": "Hähnchenbrust", "hühnerbrust": "Hähnchenbrust", "pute": "Hähnchenbrust",
  "möhre": "Karotte", "möhren": "Karotte", "karotten": "Karotte", "eier": "Ei", "pasta": "Nudeln", "spaghetti": "Nudeln", "penne": "Nudeln",
  "käse": "Käse (Hartkäse)", "gouda": "Käse (Hartkäse)", "emmentaler": "Käse (Hartkäse)", "bergkäse": "Käse (Hartkäse)", "schafkäse": "Feta (Schafskäse)",
  "feta": "Feta (Schafskäse)", "semmel": "Weißbrot/Brötchen", "semmeln": "Weißbrot/Brötchen", "brötchen": "Weißbrot/Brötchen", "toast": "Weißbrot/Brötchen",
  "kren": "Kren (Meerrettich)", "meerrettich": "Kren (Meerrettich)", "rosenkohl": "Kohlsprossen (Rosenkohl)", "kohlsprossen": "Kohlsprossen (Rosenkohl)",
  "feldsalat": "Vogerlsalat (Feldsalat)", "vogerlsalat": "Vogerlsalat (Feldsalat)", "pfifferling": "Eierschwammerl (Pfifferling)", "eierschwammerl": "Eierschwammerl (Pfifferling)",
  "johannisbeere": "Ribisel (Johannisbeere)", "ribisel": "Ribisel (Johannisbeere)", "aprikose": "Marille", "zwetschke": "Pflaume", "zwetschge": "Pflaume",
  "pilze": "Champignons", "schwammerl": "Champignons", "champignon": "Champignons", "frühlingszwiebeln": "Frühlingszwiebel", "jungzwiebel": "Frühlingszwiebel",
  "salat": "Blattsalat", "kopfsalat": "Blattsalat", "eisbergsalat": "Blattsalat", "zucchini": "Zucchini", "paprikaschote": "Paprika", "porree": "Lauch",
  "sellerie": "Knollensellerie", "staudensellerie": "Stangensellerie", "rote rübe": "Rote Bete", "rote rüben": "Rote Bete", "randen": "Rote Bete",
  "mehl": "Weizenmehl", "öl": "Pflanzenöl", "rapsöl": "Pflanzenöl", "sonnenblumenöl": "Pflanzenöl", "joghurt": "Joghurt", "naturjoghurt": "Joghurt",
  "skyr": "Joghurt", "mozarella": "Mozzarella", "reis": "Reis", "basmati": "Reis", "dosentomaten": "Tomaten (Dose)", "passata": "Tomaten (Dose)",
  "kokosnussmilch": "Kokosmilch", "lachsfilet": "Lachs", "thunfisch": "Thunfisch (Dose)", "shrimps": "Garnelen", "crevetten": "Garnelen",
  "würstel": "Würstchen", "frankfurter": "Würstchen", "wurst": "Würstchen", "schinken": "Schinken (gekocht)", "prosciutto": "Rohschinken",
  "zitronen": "Zitrone", "limetten": "Limette", "äpfel": "Apfel", "birnen": "Birne", "bananen": "Banane", "orangen": "Orange", "erdbeeren": "Erdbeere",
  "heidelbeeren": "Heidelbeere", "blaubeeren": "Heidelbeere", "himbeeren": "Himbeere", "nüsse": "Walnüsse", "walnuss": "Walnüsse", "haferflocken": "Haferflocken",
  "brühe": "Gemüsebrühe", "suppenwürfel": "Gemüsebrühe", "kichererbse": "Kichererbsen", "linse": "Linsen", "tofu": "Tofu", "spinat": "Spinat",
  "chilischote": "Chili", "peperoni": "Chili", "mais": "Mais", "erbse": "Erbsen", "gurken": "Gurke", "salatgurke": "Gurke", "essiggurkerl": "Essiggurke",
};
// Wer X hat, hat auch Y (z. B. Zitrone -> Zitronensaft)
const COVERS = {
  "Zitrone": ["Zitronensaft", "Zitronenschale"], "Limette": ["Limettensaft", "Limettenschale"], "Orange": ["Orangensaft", "Orangenschale"],
  "Ei": ["Eigelb", "Eiweiß (Eiklar)"], "Schlagsahne": ["Sahne"], "Weißbrot/Brötchen": ["Semmelbrösel"], "Brot": ["Semmelbrösel"],
  "Tomaten (Dose)": ["Tomatenmark"], "Huhn (ganz)": ["Hähnchenbrust"], "Hähnchenbrust": ["Huhn (ganz)"],
};
// immer vorhanden, zählt nie als fehlend
const ALWAYS = new Set(["Wasser", "Salz", "Pfeffer", "Eiswürfel"]);
// Grundvorrat (wenn eingeschaltet): diese Regale und Namen gelten als vorhanden
const PANTRY_CAT = new Set(["gewuerz"]);
const PANTRY = new Set(["Zwiebel", "Knoblauch", "Dinkelmehl", "Olivenöl", "Pflanzenöl", "Zucker", "Weizenmehl", "Essig", "Backpulver", "Vanillezucker", "Puderzucker", "Speisestärke",
  "Gemüsebrühe", "Fleischbrühe", "Senf", "Sojasauce", "Tomatenmark", "Honig", "Hefe", "Butterschmalz", "Kokosfett", "Margarine", "Sesamöl",
  "Ketchup", "Mayonnaise", "Semmelbrösel", "Gewürze (gemischt)", "Kräuter (gemischt)", "Ahornsirup", "Lorbeerblatt", "Paprikapulver", "Currypulver",
  "Zimt", "Muskatnuss", "Kreuzkümmel", "Chilipulver", "Kurkuma", "Vanilleschote", "Kakaopulver"]);
// Zutaten ohne DB-Namen, die nach Vorrat klingen
const PANTRY_TXT = /pulver|gewürz|chiliflocken|salz|pfeffer|öl\b|essig|brühe|fond\b|sirup|zucker|aroma|backpulver|natron|stärke|hefeflocken|agavendicksaft|sojasauce|senf/i;
// kein Grund für einen Vorschlag: nur Salz + Zwiebel reicht nicht
const WEAK = new Set(["Wasser", "Salz", "Pfeffer", "Zwiebel", "Knoblauch", "Olivenöl", "Pflanzenöl", "Zucker", "Weizenmehl", "Butter", "Milch"]);

const SHELVES = [
  ["Gemüse", ["gemuese"]], ["Obst", ["obst", "trockenobst"]], ["Kräuter", ["kraeuter"]], ["Kühlregal", ["milchprodukt", "ei"]],
  ["Fleisch & Fisch", ["fleisch", "fisch"]], ["Nudeln, Reis & Brot", ["getreide", "backware"]], ["Hülsenfrüchte & Tofu", ["huelsenfruechte"]],
  ["Dosen & Gläser", ["konserve", "sauce"]], ["Nüsse & Samen", ["nuesse"]], ["Backen & Süßes", ["backzutat"]],
];
const CAT_ICON = {gemuese: "🥬", obst: "🍎", trockenobst: "🍇", kraeuter: "🌿", milchprodukt: "🥛", ei: "🥚", fleisch: "🥩", fisch: "🐟", getreide: "🌾",
  backware: "🍞", huelsenfruechte: "🫘", konserve: "🥫", sauce: "🫙", nuesse: "🥜", backzutat: "🧁", fett_oel: "🫒", gewuerz: "🧂", getraenk: "🥤", alkohol: "🍷"};
const ICON = {
  "Tomate": "🍅", "Kartoffel": "🥔", "Karotte": "🥕", "Zwiebel": "🧅", "Knoblauch": "🧄", "Paprika": "🫑", "Gurke": "🥒", "Brokkoli": "🥦", "Mais": "🌽",
  "Aubergine": "🍆", "Chili": "🌶️", "Champignons": "🍄", "Eierschwammerl (Pfifferling)": "🍄", "Spinat": "🥬", "Blattsalat": "🥬", "Avocado": "🥑",
  "Süßkartoffel": "🍠", "Ingwer": "🫚", "Erbsen": "🫛", "Grüne Bohnen": "🫛", "Kürbis": "🎃", "Zucchini": "🥒", "Lauch": "🥬", "Frühlingszwiebel": "🧅",
  "Apfel": "🍎", "Birne": "🍐", "Banane": "🍌", "Zitrone": "🍋", "Limette": "🍋", "Orange": "🍊", "Erdbeere": "🍓", "Himbeere": "🍓", "Heidelbeere": "🫐",
  "Kirsche": "🍒", "Pfirsich": "🍑", "Marille": "🍑", "Ananas": "🍍", "Weintraube": "🍇", "Kokosraspeln": "🥥", "Kokosmilch": "🥥", "Mango": "🥭",
  "Milch": "🥛", "Butter": "🧈", "Ei": "🥚", "Käse (Hartkäse)": "🧀", "Parmesan": "🧀", "Mozzarella": "🧀", "Feta (Schafskäse)": "🧀", "Frischkäse": "🧀",
  "Joghurt": "🥣", "Quark (Topfen)": "🥣", "Schlagsahne": "🥛", "Saure Sahne": "🥛",
  "Rinderhackfleisch": "🥩", "Rindfleisch": "🥩", "Schweinefleisch": "🥩", "Lammfleisch": "🥩", "Hähnchenbrust": "🍗", "Huhn (ganz)": "🍗", "Speck": "🥓",
  "Schinken (gekocht)": "🍖", "Rohschinken": "🍖", "Würstchen": "🌭", "Lachs": "🐟", "Fischfilet (weiß)": "🐟", "Thunfisch (Dose)": "🐟", "Garnelen": "🦐",
  "Nudeln": "🍝", "Reis": "🍚", "Brot": "🍞", "Weißbrot/Brötchen": "🥖", "Haferflocken": "🥣", "Couscous": "🌾", "Blätterteig": "🥐", "Weizenmehl": "🌾",
  "Tofu": "🧊", "Linsen": "🫘", "Kichererbsen": "🫘", "Weiße Bohnen": "🫘", "Tomaten (Dose)": "🥫", "Oliven": "🫒", "Olivenöl": "🫒",
  "Walnüsse": "🌰", "Haselnüsse": "🌰", "Mandeln": "🌰", "Sesam": "🌰", "Pinienkerne": "🌰", "Schokolade": "🍫", "Honig": "🍯", "Zucker": "🧂",
  "Basilikum": "🌿", "Petersilie": "🌿", "Koriander": "🌿", "Schnittlauch": "🌿", "Dill": "🌿", "Minze": "🌿", "Weißwein": "🍷", "Rotwein": "🍷", "Bier": "🍺",
};
// Kacheln: was oft gebraucht wird und typischerweise im Kühlschrank / Vorrat liegt
const TILE_MAX = 14;

/* ---------- Abgleich (rein, testbar) ---------- */
const norm = s => String(s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
function vocab(R) {
  const V = {};
  for (const r of R) for (const i of r.ing) if (i[3]) { const v = V[i[3]] ||= {n: i[3], cat: i[5] || null, cnt: 0}; v.cnt++; if (!v.cat && i[5]) v.cat = i[5]; }
  return V;
}
// Suchwörter je Zutat: Name, Teile in Klammern, Synonyme
function stems(name) {
  const out = new Set(), n = norm(name);
  out.add(n.replace(/\s*\(.*\)$/, ""));
  (n.match(/\(([^)]+)\)/g) || []).forEach(p => out.add(p.slice(1, -1)));
  n.split("/").forEach(p => out.add(p.replace(/\s*\(.*\)$/, "").trim()));
  for (const k in SYN) if (SYN[k] === name) out.add(k);
  return [...out].filter(s => s.length >= 3);
}
// freier Text -> Name in der DB (oder der Text selbst)
function resolve(text, V) {
  const t = norm(text).replace(/^\d+\s*(x|stk\.?|stück)?\s*/, "");
  if (!t) return null;
  for (const n in V) if (norm(n) === t) return n;
  if (SYN[t] && V[SYN[t]]) return SYN[t];
  for (const n in V) if (stems(n).includes(t)) return n;
  // Mehrzahl / Wortende
  const t2 = t.replace(/(en|n|e|s)$/, "");
  if (t2.length >= 3) { for (const n in V) if (norm(n).replace(/(en|n|e|s)$/, "") === t2) return n; if (SYN[t2] && V[SYN[t2]]) return SYN[t2]; }
  return String(text).trim().replace(/^./, c => c.toUpperCase()).slice(0, 60);
}
function search(q, V, limit = 12) {
  q = norm(q); if (!q) return [];
  const hits = [];
  for (const n in V) {
    const st = stems(n), name = norm(n);
    let s = name.startsWith(q) ? 3 : st.some(x => x.startsWith(q)) ? 2 : name.includes(q) || st.some(x => x.includes(q)) ? 1 : 0;
    if (s) hits.push([n, s * 1e6 + V[n].cnt]);
  }
  return hits.sort((a, b) => b[1] - a[1]).slice(0, limit).map(h => h[0]);
}

// Mengen vom Zutatentext abschneiden: "30 g Chia-Samen (weiß)" -> "Chia-Samen"
const UNIT = "(?:g|kg|ml|l|cl|dl|el|tl|stk\\.?|stück|bl|pkg\\.?|packung|pck\\.?|dose|dosen|becher|bund|prise|prisen|msp\\.?|zehe|zehen|scheibe|scheiben|handvoll|glas|tasse|tassen|cm|stg|stange|stangen|kopf|würfel)";
const QTY = new RegExp("^[\\d.,/½¼¾⅓\\s-]*(?:" + UNIT + "\\b\\.?)?\\s*", "i");
const bare = t => { const x = String(t).replace(QTY, "").replace(/\s*\(.*?\)/g, "").replace(/,.*$/, "").trim(); return (x || String(t)).replace(/^./, c => c.toUpperCase()).slice(0, 50); };
// keine eigenen Gerichte: kommen ans Ende
const NOT_DISH = /glasur|essig\b|sirup|likör|marmelade|konfitüre|gewürzmischung|grundrezept|\bdressing|\bmarinade|\bdip\b|gelee|teig\b/i;

function engine(ctx) {
  // ctx: {R, ratings}
  const rts = () => (typeof ctx.ratings === "function" ? ctx.ratings() : ctx.ratings) || {};
  const V = vocab(ctx.R);
  const STEM = {}; const stemOf = n => STEM[n] ||= stems(n);
  function haveSet(items) {
    const H = new Set();
    for (const n of items) { H.add(n); (COVERS[n] || []).forEach(c => H.add(c)); }
    return H;
  }
  // Zutat ohne DB-Namen: über Suchwörter im Zutatentext finden
  const textHit = (txt, items) => { const t = norm(txt); return items.find(n => stemOf(n).some(s => new RegExp("(^|[^a-zäöüß])" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(t))); };
  function assess(r, items, H, o) {
    const need = new Map(), have = new Map(), pantry = [], used = new Set(), opt = [];
    for (const i of r.ing) {
      const key = i[3] || null, label = key || bare(i[0]);
      if (key && ALWAYS.has(key)) continue;
      const isPantry = o.vorrat && (i[1] === "v" || (key ? PANTRY.has(key) || PANTRY_CAT.has(i[5]) : PANTRY_TXT.test(i[0])));
      let hit = key && H.has(key) ? key : null;
      if (!hit && !key) hit = textHit(i[0], items);
      if (!hit && key && !V[key]) hit = textHit(key, items);
      if (i[1] === "o") { if (hit) opt.push(label); continue; }
      if (hit) { have.set(label, i[0]); used.add(hit); continue; }
      if (isPantry) { pantry.push(label); continue; }
      if (i[1] === "v" && !o.vorrat) { need.set(label, i[0]); continue; }
      need.set(label, i[0]);
    }
    const strong = [...used].filter(n => !WEAK.has(n));
    const total = have.size + need.size;
    return {r, have: [...have.keys()], miss: [...need.keys()], missTxt: [...need.values()], pantry, opt, used: [...used], strong: strong.length,
      cover: total ? have.size / total : 0};
  }
  function suggest(items, o) {
    o = Object.assign({vorrat: true, maxMiss: 2, diet: [], gang: "", sort: "passt"}, o || {});
    if (!items.length) return [];
    const H = haveSet(items), out = [];
    for (const r of ctx.R) {
      if (r.ing.length < 2 || !r.st || !r.st.length) continue;
      const rt = rts()[r.id]; if (rt && rt.verdict === "aussortieren") continue;
      if (o.diet.length && !o.diet.every(t => r.tags.includes(t))) continue;
      if (o.gang && !r.tags.includes(o.gang)) continue;
      const a = assess(r, items, H, o);
      if (!a.used.length || a.miss.length > o.maxMiss || a.have.length === 0) continue;
      if (!a.strong && a.miss.length) continue;   // nur Grundzutaten getroffen und trotzdem etwas fehlt: kein guter Vorschlag
      a.stars = (rt && rt.stars) || 0;
      out.push(a);
    }
    const nd = a => NOT_DISH.test(a.r.t) || (!o.gang && a.r.tags.includes("gang:getraenk")) ? 1 : 0;
    // Hauptzutaten (Fisch, Fleisch, Hülsenfrüchte, Nudeln …) zählen mehr als Zitrone oder Kräuter
    const W = {fleisch: 1.6, fisch: 1.6, huelsenfruechte: 1.4, getreide: 1.2, backware: 1, gemuese: 1, milchprodukt: .9, ei: .9, obst: .7, kraeuter: .5};
    const w = n => (V[n] && W[V[n].cat]) || .7;
    const sc = a => a.used.reduce((s, n) => s + w(n), 0) - .7 * a.miss.length + .2 * a.cover - (a.have.length + a.miss.length < 2 ? .6 : 0);
    const by = o.sort === "passt" ? (a, b) => nd(a) - nd(b) || sc(b) - sc(a) || b.stars - a.stars
      : o.sort === "nutzt" ? (a, b) => nd(a) - nd(b) || b.used.length - a.used.length || a.miss.length - b.miss.length || b.cover - a.cover || b.stars - a.stars
      : (a, b) => a.miss.length - b.miss.length || nd(a) - nd(b) || b.used.length - a.used.length || b.cover - a.cover || b.stars - a.stars;
    return out.sort((a, b) => by(a, b) || (a.r.status === "pruefen") - (b.r.status === "pruefen") || a.r.t.localeCompare(b.r.t, "de"));
  }
  function tiles() {
    // je Regal die häufigsten Zutaten, ohne Grundvorrat
    return SHELVES.map(([lab, cats]) => [lab, Object.values(V).filter(v => cats.includes(v.cat) && !ALWAYS.has(v.n) && !PANTRY.has(v.n) && v.cnt >= 3)
      .sort((a, b) => b.cnt - a.cnt).slice(0, TILE_MAX).map(v => v.n)]).filter(x => x[1].length);
  }
  return {V, suggest, assess, tiles, resolve: t => resolve(t, V), search: (q, l) => search(q, V, l)};
}

/* ---------- Fotoerkennung ---------- */
function photoPrompt(names) {
  return `Du siehst ${"ein oder mehrere Fotos"} aus einem Kühlschrank oder Vorratsschrank. Liste die Lebensmittel auf, die man darauf erkennen kann.

Regeln:
- Nur was wirklich zu sehen ist. Nichts erraten, was verdeckt ist. Bei Verpackungen die Beschriftung lesen.
- Benutze möglichst genau einen Namen aus der Liste unten. Passt keiner, nimm einen kurzen deutschen Namen im Singular (z. B. "Hummus").
- "sicher": false, wenn du dir nicht sicher bist (z. B. undurchsichtige Dose, unklare Packung).
- Keine Getränke außer Milch und Säften, keine Gewürze, außer sie sind eindeutig zu lesen.
- Ist auf dem Bild kein Kühlschrank und kein Essen, gib eine leere Liste zurück und schreib den Grund in "hinweis".

Namen in der Rezept-Datenbank:
${names.join(", ")}

Antworte nur mit JSON in genau dieser Form:
{"zutaten":[{"name":"Tomate","sicher":true},{"name":"Joghurt","sicher":false}],"hinweis":""}`;
}
function parseJson(txt) {
  const s = String(txt || ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw {code: "invalid_json"};
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw {code: "invalid_json"}; }
}

/* ---------- Export für Tests ---------- */
const KB = {engine, resolve, search, stems, vocab, photoPrompt, parseJson, SYN, COVERS, ALWAYS, PANTRY};
if (typeof module !== "undefined" && module.exports) { module.exports = KB; return; }
root.KB = KB;

/* ---------- Oberfläche ---------- */
const doc = root.document;
const css = `
.kb-grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) }
@media (min-width: 900px) { .kb-grid { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: start } .kb-left { position: sticky; top: 10px } }
.kb-left { display: grid; gap: 12px; min-width: 0 }
.kb-actions { display: flex; flex-wrap: wrap; gap: 8px }
.kb-actions .btn { min-height: 44px }
.kb-search { position: relative; display: grid; gap: 6px }
.kb-search input { font-size: 16px; width: 100%; min-height: 44px }
.kb-have { display: flex; flex-wrap: wrap; gap: 6px; min-height: 0 }
.kb-have .chip { min-height: 36px; display: inline-flex; align-items: center; gap: 4px; background: var(--accent-soft); color: var(--ink); border-color: var(--accent) }
.kb-have .chip .x { font-size: 16px; line-height: 1; color: var(--muted) }
.kb-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px }
.kb-tile { display: grid; justify-items: center; gap: 2px; padding: 8px 4px 6px; min-height: 64px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--surface); color: var(--ink); font: 500 12.5px/1.2 var(--body); cursor: pointer; text-align: center; overflow-wrap: break-word; hyphens: manual; min-width: 0 }
.kb-tile .e { font-size: 24px; line-height: 1.1 }
.kb-tile[aria-pressed=true] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent) }
.kb-tile[aria-pressed=true]::after { content: "✓"; font-size: 11px; font-weight: 700 }
.kb-shelf summary { cursor: pointer; font-weight: 600; min-height: 44px; display: flex; align-items: center; gap: 6px; list-style: none }
.kb-shelf summary::-webkit-details-marker { display: none }
.kb-shelf summary::before { content: ""; width: 8px; height: 8px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(-45deg); margin-right: 4px; flex: none }
.kb-shelf[open] summary::before { transform: rotate(45deg) }
.kb-shelf summary .note { font-weight: 400 }
.kb-shelf[open] summary { margin-bottom: 6px }
.kb-opts { display: grid; gap: 8px }
.kb-opts .row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center }
.kb-opts select { min-height: 40px }
.kb-opts label.ck { display: inline-flex; gap: 8px; align-items: center; min-height: 40px; cursor: pointer }
.kb-opts input[type=checkbox], .kb-rec input[type=checkbox] { width: 22px; height: 22px; accent-color: var(--accent) }
.kb-res { display: grid; gap: 10px }
.kb-res h3 { font-size: 1.05rem; margin-top: 6px }
.kb-card { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 10px }
.kb-card img, .kb-card .ph { width: 76px; height: 76px; border-radius: 10px; object-fit: cover; background: var(--accent-soft); display: grid; place-items: center;
  font: 700 26px var(--display); color: var(--accent) }
.kb-card .t { font: 600 15px/1.3 var(--body); color: var(--ink); background: none; border: 0; padding: 0; text-align: left; cursor: pointer; text-decoration: underline;
  text-decoration-color: var(--line); text-underline-offset: 3px }
.kb-card .meta { font-size: 13px; color: var(--muted); margin: 2px 0 }
.kb-card .miss { font-size: 13.5px; margin: 2px 0 }
.kb-card .miss b { color: var(--warn) }
.kb-card .ok b { color: var(--accent) }
.kb-card .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px }
.kb-card .acts .btn { min-height: 40px; padding: 7px 12px; font-size: 13.5px }
.kb-bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; margin: 4px 0 }
.kb-bar i { display: block; height: 100%; background: var(--accent) }
.kb-rec { display: grid; gap: 6px; margin: 8px 0 }
.kb-rec li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 8px; align-items: center }
.kb-rec ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px }
.kb-rec input[type=text] { font-size: 16px; min-height: 40px; width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink) }
.kb-rec .unsure { font-size: 12px; color: var(--warn); white-space: nowrap }
.kb-thumbs { display: flex; gap: 6px; flex-wrap: wrap }
.kb-thumbs img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line) }
.kb-err { color: var(--bad) }
.kb-jump { min-height: 44px }
@media (min-width: 900px) { .kb-jump { display: none } }
.kb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.kb-dlbox { margin: 10px 0; padding: 10px 12px; border-left: 4px solid var(--accent); background: var(--accent-soft); border-radius: 8px; font-size: 14px }
.kb-dlbox b.m { color: var(--warn) }
`;
const g = id => doc.getElementById(id);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch (e) { return d } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} };
const H = s => typeof esc === "function" ? esc(s) : String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
let items = load("kb-items", []), O = Object.assign({vorrat: true, maxMiss: 2, diet: [], gang: "", sort: "passt"}, load("kb-opts", {}));
let E = null, EN = 0, shownN = 20, sample = null, sampleLim = null, ctl = null, photos = [], recog = null;
const eng = () => { const RR = typeof R !== "undefined" ? R : []; if (!E || EN !== RR.length) { E = engine({R: RR, ratings: () => typeof ratings !== "undefined" ? ratings : {}}); EN = RR.length; } return E; };
const iconOf = n => { const v = eng().V[n]; return ICON[n] || (v && CAT_ICON[v.cat]) || "🍽️"; };
const short = n => n.replace(/\s*\(.*\)$/, "");
const say = t => { const s = g("kbLive"); if (s) { s.textContent = ""; setTimeout(() => s.textContent = t, 30); } };
const saveItems = () => { store("kb-items", items); };
const isLocal = () => !!(root.claude && root.claude.local);

function mount() {
  let sec = g("v-kuehl");
  if (!sec) { sec = doc.createElement("section"); sec.id = "v-kuehl"; sec.hidden = true; sec.setAttribute("aria-label", "Kühlschrank: was habe ich da?"); sec.lang = "de"; doc.querySelector(".wrap").appendChild(sec); }
  if (!doc.querySelector('.tabs [data-tab="kuehl"]')) {
    const b = doc.createElement("button"); b.type = "button"; b.dataset.tab = "kuehl"; b.setAttribute("aria-pressed", "false");
    b.innerHTML = `Kühlschrank <span class="n" id="kbN"></span>`;
    const tabs = doc.querySelector(".tabs"); tabs.insertBefore(b, tabs.querySelector('[data-tab="liste"]'));
  }
  const st = doc.createElement("style"); st.textContent = css; doc.head.appendChild(st);
  sec.innerHTML = `
  <p class="kb-sr" aria-live="polite" id="kbLive"></p>
  <div class="kb-grid">
    <div class="kb-left">
      <div class="panel">
        <div class="dlg-head"><h2>Was hast du da?</h2><button class="btn" type="button" id="kbClear" hidden>Alles entfernen</button></div>
        <div class="kb-actions">
          <button class="btn primary" type="button" id="kbCam"><span aria-hidden="true">📷 </span>Kühlschrank fotografieren</button>
          <button class="btn" type="button" id="kbLib">Foto auswählen</button>
          <input type="file" id="kbCamIn" accept="image/*" capture="environment" hidden>
          <input type="file" id="kbLibIn" accept="image/*" multiple hidden>
        </div>
        <div id="kbPhoto" aria-live="polite"></div>
        <div class="kb-search">
          <label for="kbQ" class="flabel" style="font-weight:600">Zutat suchen</label>
          <input type="search" id="kbQ" placeholder="z. B. Topfen, Zucchini, Linsen" autocomplete="off" enterkeyhint="done" aria-describedby="kbQHint">
          <span class="note" id="kbQHint">Antippen fügt hinzu, nochmal antippen entfernt.</span>
          <div class="kb-tiles" id="kbHits" role="group" aria-label="Suchtreffer"></div>
        </div>
        <div><h3 style="font-size:1rem;margin-bottom:6px" id="kbHaveH">Im Kühlschrank <span class="note" id="kbHaveN"></span></h3>
          <div class="kb-have" id="kbHave" role="list" aria-labelledby="kbHaveH"></div></div>
        <button class="btn primary kb-jump" type="button" id="kbJump" hidden></button>
      </div>
      <div class="panel"><h2 style="font-size:1.1rem">Häufige Zutaten</h2><div id="kbShelves"></div></div>
    </div>
    <div class="panel">
      <div class="dlg-head"><h2 id="kbResH" tabindex="-1">Das kannst du kochen</h2></div>
      <div class="kb-opts" id="kbOpts">
        <div class="row"><label class="ck"><input type="checkbox" id="kbVorrat"> Grundvorrat ist da <span class="note">(Salz, Öl, Mehl, Zucker, Zwiebel, Knoblauch, Gewürze, Brühe …)</span></label></div>
        <div class="row">
          <label for="kbMax" class="note" style="font-weight:600">Darf fehlen</label>
          <select id="kbMax"><option value="0">nichts</option><option value="1">höchstens 1 Zutat</option><option value="2">höchstens 2 Zutaten</option><option value="3">höchstens 3 Zutaten</option></select>
          <label for="kbGang" class="note" style="font-weight:600">Gang</label>
          <select id="kbGang"><option value="">Alle</option><option value="gang:hauptgericht">Hauptgericht</option><option value="gang:fruehstueck">Frühstück</option>
            <option value="gang:suppe">Suppe</option><option value="gang:salat">Salat</option><option value="gang:snack">Snack</option><option value="gang:dessert">Dessert</option></select>
          <label for="kbSort" class="note" style="font-weight:600">Sortieren</label>
          <select id="kbSort"><option value="passt">Passt am besten</option><option value="fehlt">Wenigste fehlende zuerst</option><option value="nutzt">Verbraucht am meisten</option></select>
        </div>
        <div class="row"><span class="note" style="font-weight:600" id="kbDietL">Ernährung</span><div class="chips" role="group" aria-labelledby="kbDietL" id="kbDiet"></div></div>
      </div>
      <div class="kb-res" id="kbRes"></div>
    </div>
  </div>`;
  wire();
}

const DIETS = [["ernaehrungsform:vegetarisch", "Vegetarisch"], ["ernaehrungsform:vegan", "Vegan"], ["ernaehrungsform:laktosefrei", "Laktosefrei"], ["ernaehrungsform:glutenfrei", "Glutenfrei"]];
function wire() {
  g("kbVorrat").checked = O.vorrat; g("kbMax").value = String(O.maxMiss); g("kbGang").value = O.gang; g("kbSort").value = O.sort;
  g("kbDiet").innerHTML = DIETS.map(([t, l]) => `<button type="button" class="chip" data-d="${t}" aria-pressed="${O.diet.includes(t)}">${l}</button>`).join("");
  const opt = () => { O.vorrat = g("kbVorrat").checked; O.maxMiss = +g("kbMax").value; O.gang = g("kbGang").value; O.sort = g("kbSort").value; store("kb-opts", O); shownN = 20; renderRes(); };
  ["kbVorrat", "kbMax", "kbGang", "kbSort"].forEach(id => g(id).onchange = opt);
  g("kbDiet").onclick = e => { const b = e.target.closest("[data-d]"); if (!b) return; const t = b.dataset.d;
    O.diet = O.diet.includes(t) ? O.diet.filter(x => x !== t) : O.diet.concat(t); b.setAttribute("aria-pressed", O.diet.includes(t)); opt(); };
  g("kbQ").oninput = renderHits;
  g("kbQ").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); const f = g("kbHits").querySelector("[data-n]"); if (f) { toggle(f.dataset.n, true); g("kbQ").value = ""; renderHits(); } } };
  const tileClick = e => { const b = e.target.closest("[data-n]"); if (!b) return; toggle(b.dataset.n); };
  g("kbHits").onclick = e => { const b = e.target.closest("[data-n]"); if (!b) return; toggle(b.dataset.n); renderHits(); };
  g("kbShelves").onclick = tileClick;
  g("kbHave").onclick = e => { const b = e.target.closest("[data-rm]"); if (!b) return; const i = items.indexOf(b.dataset.rm); toggle(b.dataset.rm, false);
    const next = g("kbHave").querySelectorAll("[data-rm]")[Math.min(i, items.length - 1)]; (next || g("kbQ")).focus(); };
  let arm = false;
  g("kbClear").onclick = () => { if (!arm) { arm = true; g("kbClear").textContent = "Wirklich alles entfernen?"; setTimeout(() => { arm = false; g("kbClear").textContent = "Alles entfernen"; }, 3000); return; }
    arm = false; g("kbClear").textContent = "Alles entfernen"; items = []; saveItems(); renderAll(); say("Kühlschrank geleert."); g("kbQ").focus(); };
  g("kbCam").onclick = () => g("kbCamIn").click();
  g("kbLib").onclick = () => g("kbLibIn").click();
  g("kbCamIn").onchange = e => addPhotos(e.target.files, e.target);
  g("kbLibIn").onchange = e => addPhotos(e.target.files, e.target);
  g("kbJump").onclick = () => { const h = g("kbResH"); h.scrollIntoView({block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); h.focus({preventScroll: true}); };
  g("kbRes").onclick = e => {
    const o = e.target.closest("[data-open]"), p = e.target.closest("[data-pick]"), m = e.target.closest("#kbMore");
    if (o) { const r = R.find(x => x.id === o.dataset.open); if (r) openR(r); }
    if (p) { togglePick(p.dataset.pick); const on = picks.includes(p.dataset.pick); p.textContent = on ? "In der Auswahl ✓" : "Zur Auswahl"; p.setAttribute("aria-pressed", on);
      say(on ? "Zur Auswahl hinzugefügt. Die Einkaufsliste steht unter „Auswahl & Einkauf“." : "Aus der Auswahl entfernt."); }
    if (m) { shownN += 20; renderRes(); const c = g("kbRes").querySelectorAll(".kb-card")[shownN - 20]; if (c) c.querySelector(".t").focus(); }
  };
  g("kbPhoto").onclick = photoClick;
  g("kbPhoto").onchange = e => { const c = e.target.closest("[data-ri]"); if (c && recog) recog.list[+c.dataset.ri].on = c.checked; updRecBtn(); };
  g("kbPhoto").oninput = e => { const t = e.target.closest("[data-rt]"); if (t && recog) recog.list[+t.dataset.rt].n = t.value; };
}
function toggle(n, on) {
  const has = items.includes(n), want = on === undefined ? !has : on;
  if (want && !has) items.push(n); if (!want && has) items = items.filter(x => x !== n);
  if (want !== has) { saveItems(); say(`${short(n)} ${want ? "hinzugefügt" : "entfernt"}. ${items.length} Zutaten.`); }
  doc.querySelectorAll("#v-kuehl [data-n]").forEach(b => { if (b.dataset.n === n) b.setAttribute("aria-pressed", items.includes(n)); });
  renderHave(); shownN = 20; renderRes();
}
// weiche Trennstellen für lange Kachelnamen (Wortfugen)
const shy = t => H(t).replace(/(zwiebel|sahne|käse|kartoffel|fleisch|brust|hackfleisch|schinken|bohnen|erbsen|nüsse|kerne|mehl|flocken|salat|sellerie|kohl|beere|pilze|gnons)$/i, "&shy;$1").replace(/^(Champi)(gnons)$/, "$1&shy;$2");
const tile = n => `<button type="button" class="kb-tile" data-n="${H(n)}" aria-pressed="${items.includes(n)}" aria-label="${H(short(n))}"><span class="e" aria-hidden="true">${iconOf(n)}</span><span aria-hidden="true">${shy(short(n))}</span></button>`;
function renderHits() {
  const q = g("kbQ").value.trim(); if (!q) { g("kbHits").innerHTML = ""; return; }
  const hs = eng().search(q, 12);
  const free = eng().resolve(q);
  g("kbHits").innerHTML = hs.map(tile).join("") + (free && !hs.includes(free) && !eng().V[free] ?
    `<button type="button" class="kb-tile" data-n="${H(free)}" aria-pressed="${items.includes(free)}"><span class="e" aria-hidden="true">＋</span>„${H(free)}“ hinzufügen</button>` : "");
}
function renderShelves() {
  const T = eng().tiles(), cnt = lab => (T.find(x => x[0] === lab) || [0, []])[1].filter(n => items.includes(n)).length;
  const openSet = load("kb-open", ["Gemüse", "Kühlregal"]);
  g("kbShelves").innerHTML = T.map(([lab, ns]) => `<details class="kb-shelf" data-sh="${H(lab)}" ${openSet.includes(lab) ? "open" : ""}><summary>${H(lab)} <span class="note" data-c="${H(lab)}">${cnt(lab) ? `(${cnt(lab)} gewählt)` : ""}</span></summary>
    <div class="kb-tiles">${ns.map(tile).join("")}</div></details>`).join("");
  g("kbShelves").querySelectorAll("details").forEach(d => d.ontoggle = () => {
    const s = [...g("kbShelves").querySelectorAll("details[open]")].map(x => x.dataset.sh); store("kb-open", s); });
}
function renderHave() {
  g("kbHave").innerHTML = items.length ? items.map(n => `<span role="listitem"><button type="button" class="chip" data-rm="${H(n)}" aria-label="${H(short(n))} entfernen"><span aria-hidden="true">${iconOf(n)}</span>${H(short(n))}<span class="x" aria-hidden="true">×</span></button></span>`).join("")
    : `<p class="note" style="margin:0">Noch leer. Tippe unten auf Zutaten, such oben oder fotografiere deinen Kühlschrank.</p>`;
  g("kbHaveN").textContent = items.length ? `(${items.length})` : "";
  g("kbClear").hidden = !items.length;
  const n = g("kbN"); if (n) n.textContent = items.length ? `(${items.length})` : "";
  if (g("kbShelves")) g("kbShelves").querySelectorAll("[data-c]").forEach(s => {
    const c = [...s.closest("details").querySelectorAll("[data-n]")].filter(b => items.includes(b.dataset.n)).length; s.textContent = c ? `(${c} gewählt)` : ""; });
}
const list = xs => xs.map(x => H(short(x))).join(", ");
function renderRes() {
  const box = g("kbRes"); if (!box) return;
  if (typeof R === "undefined" || !R.length) { box.innerHTML = `<p class="note">Rezepte werden geladen …</p>`; return; }
  if (!items.length) { if (g("kbJump")) g("kbJump").hidden = true; box.innerHTML = `<p class="note">Sobald du Zutaten angibst, erscheinen hier passende Rezepte. Ganz oben die, für die dir am wenigsten fehlt.</p>`; return; }
  const res = eng().suggest(items, O);
  const j = g("kbJump"); if (j) { j.hidden = !items.length; j.textContent = res.length ? `${res.length} passende Rezepte anzeigen` : "Keine passenden Rezepte, Filter ansehen"; }
  if (!res.length) { box.innerHTML = `<p class="note">Nichts gefunden. Lass mehr fehlende Zutaten zu, nimm Filter heraus oder gib mehr Zutaten an.</p>`; say("Keine passenden Rezepte."); return; }
  let html = `<p class="note" style="margin:0">${res.length} Rezepte passen${O.vorrat ? ", Grundvorrat mitgerechnet" : ""}.</p>`;
  const lab = k => k == 0 ? "Alles da" : k == 1 ? "Es fehlt 1 Zutat" : `Es fehlen ${k} Zutaten`;
  let last = -1;
  res.slice(0, shownN).forEach(a => {
    if (O.sort === "fehlt" && a.miss.length !== last) { last = a.miss.length; html += `<h3>${lab(last)} <span class="note">(${res.filter(x => x.miss.length === last).length})</span></h3>`; }
    html += cardHtml(a);
  });
  if (res.length > shownN) html += `<button class="btn" type="button" id="kbMore" style="min-height:44px">Mehr anzeigen (${res.length - shownN} weitere)</button>`;
  box.innerHTML = html;
  say(`${res.length} passende Rezepte.`);
}
function cardHtml(a) {
  const r = a.r, img = typeof imgOf === "function" ? imgOf(r) : null, pct = Math.round(a.cover * 100), on = typeof picks !== "undefined" && picks.includes(r.id);
  return `<article class="kb-card">
    ${img ? `<img src="${H(img)}" alt="" loading="lazy">` : `<div class="ph" aria-hidden="true">${H(r.t[0] || "?")}</div>`}
    <div><button type="button" class="t" data-open="${H(r.id)}">${H(r.t)}</button>
      <div class="meta">${typeof srcBadge === "function" ? srcBadge(r, 16) : ""} ${[r.tm ? r.tm + " Min." : "", r.n ? r.n[0] + " kcal" : "", a.stars ? "★".repeat(a.stars) : ""].filter(Boolean).join(" · ")}</div>
      <div class="kb-bar" role="img" aria-label="${a.have.length} von ${a.have.length + a.miss.length} Hauptzutaten da"><i style="width:${pct}%"></i></div>
      <p class="miss ok"><b>Hast du:</b> ${list(a.have)}</p>
      ${a.miss.length ? `<p class="miss"><b>Fehlt:</b> ${list(a.miss)}</p>` : ""}
      ${a.opt.length ? `<p class="meta">Optional auch da: ${list(a.opt)}</p>` : ""}
      <div class="acts"><button class="btn" type="button" data-pick="${H(r.id)}" aria-pressed="${on}">${on ? "In der Auswahl ✓" : "Zur Auswahl"}</button></div>
    </div></article>`;
}
function renderAll() { renderHave(); renderShelves(); renderHits(); renderRes(); }

/* ---------- Foto ---------- */
async function shrinkImg(file) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const c = doc.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", .85));
  } catch (e) { return file; }
}
const ERR = {not_granted: "Du hast Claude für diese Seite nicht erlaubt. Ohne Erlaubnis kann ich das Foto nicht auswerten.",
  sampling_disabled: "Claude ist für dein Konto hier nicht verfügbar.", rate_limited: "Gerade zu viele Anfragen. Bitte in ein paar Minuten nochmal.",
  session_expired: "Bitte bei Claude neu anmelden und nochmal versuchen.", image_rejected: "Das Foto war zu groß oder hat ein falsches Format. Bitte ein anderes nehmen.",
  refused: "Das Foto wurde abgelehnt. Bitte nur Kühlschrank oder Vorrat fotografieren.", invalid_json: "Die Antwort war unvollständig. Bitte nochmal versuchen.",
  empty_completion: "Keine Antwort erhalten. Bitte nochmal versuchen.", images_unavailable: "Fotos gehen hier leider nicht.",
  offline: "Keine Verbindung. Fotos auswerten geht nur mit Internet."};
const errTxt = e => ERR[e && e.code] || "Das hat nicht geklappt. Bitte nochmal versuchen.";
function backend() { return sample && (!sampleLim || sampleLim.images) ? "sample" : null; }
async function addPhotos(fl, input) {
  const files = [...(fl || [])].filter(f => /^image\//.test(f.type) || !f.type); input.value = "";
  if (!files.length) return;
  const max = sampleLim && sampleLim.images ? sampleLim.images.maxCount : 4;
  for (const f of files) { if (photos.length >= max) break; photos.push(await shrinkImg(f)); }
  runPhoto();
}
async function runPhoto() {
  const out = g("kbPhoto"), be = backend();
  const thumbs = `<div class="kb-thumbs">${photos.map((p, i) => `<img src="${URL.createObjectURL(p)}" alt="Foto ${i + 1}">`).join("")}</div>`;
  if (!be) {
    out.innerHTML = thumbs + `<p class="kb-err">Fotos auswerten geht hier nicht. Öffne die App in der Claude-App oder auf claude.ai, oder gib die Zutaten über die Kacheln an.</p>
      <div class="kb-actions"><button class="btn" type="button" data-act="cancel">Schließen</button></div>`; return;
  }
  ctl = new AbortController();
  out.innerHTML = thumbs + `<p class="note">Claude schaut sich ${photos.length > 1 ? "die Fotos" : "das Foto"} an. Das dauert meist 10 bis 40 Sekunden …</p>
    <div class="kb-actions"><button class="btn" type="button" data-act="stop">Abbrechen</button></div>`;
  const names = Object.values(eng().V).sort((a, b) => b.cnt - a.cnt).map(v => v.n);
  try {
    const prompt = photoPrompt(names);
    const j = await sample.json(prompt, {images: photos, signal: ctl.signal, cache: false});
    const zs = (j && Array.isArray(j.zutaten) ? j.zutaten : []).filter(z => z && z.name).slice(0, 80);
    const seen = new Set(), list = [];
    for (const z of zs) { const n = eng().resolve(String(z.name)); if (!n || seen.has(n)) continue; seen.add(n); list.push({n, on: true, unsure: z.sicher === false, known: !!eng().V[n]}); }
    recog = {list, hint: j && j.hinweis ? String(j.hinweis).slice(0, 300) : ""};
    showRecog(thumbs);
  } catch (e) {
    if (e && e.code === "cancelled") { out.innerHTML = `<p class="note">Abgebrochen.</p>`; photos = []; return; }
    out.innerHTML = thumbs + `<p class="kb-err">${H(errTxt(e))}</p><div class="kb-actions"><button class="btn primary" type="button" data-act="retry">Nochmal versuchen</button><button class="btn" type="button" data-act="cancel">Verwerfen</button></div>`;
  } finally { ctl = null; }
}
function showRecog(thumbs) {
  const out = g("kbPhoto"), L = recog.list;
  out.innerHTML = `<div class="kb-rec panel" style="margin-top:8px">${thumbs}
    <h3 style="font-size:1rem" id="kbRecH" tabindex="-1">${L.length ? `Erkannt: ${L.length} Zutaten` : "Nichts erkannt"}</h3>
    ${recog.hint ? `<p class="note" style="margin:0">${H(recog.hint)}</p>` : ""}
    ${L.length ? `<p class="note" style="margin:0">Häkchen weg, was nicht stimmt. Namen kannst du ändern.</p>
    <ul>${L.map((z, i) => `<li><input type="checkbox" data-ri="${i}" id="kbR${i}" ${z.on ? "checked" : ""} aria-label="${H(short(z.n))} übernehmen">
      <input type="text" data-rt="${i}" value="${H(z.n)}" aria-label="Name der Zutat ${i + 1}">${z.unsure ? `<span class="unsure">unsicher</span>` : `<span></span>`}</li>`).join("")}</ul>` : ""}
    <div class="kb-actions">${L.length ? `<button class="btn primary" type="button" data-act="take" id="kbTake"></button>` : ""}
      <button class="btn" type="button" data-act="more">Noch ein Foto</button><button class="btn" type="button" data-act="cancel">Verwerfen</button></div></div>`;
  updRecBtn(); g("kbRecH").focus();
}
function updRecBtn() { const b = g("kbTake"); if (b && recog) b.textContent = `${recog.list.filter(z => z.on).length} übernehmen`; }
function photoClick(e) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "stop" && ctl) ctl.abort();
  if (a === "cancel") { photos = []; recog = null; g("kbPhoto").innerHTML = ""; g("kbCam").focus(); }
  if (a === "retry") runPhoto();
  if (a === "more") { recog = null; g("kbCamIn").click(); }
  if (a === "take") {
    const add = recog.list.filter(z => z.on).map(z => eng().resolve(z.n)).filter(Boolean);
    add.forEach(n => { if (!items.includes(n)) items.push(n); }); saveItems();
    photos = []; recog = null; g("kbPhoto").innerHTML = `<p class="note">${add.length} Zutaten übernommen.</p>`;
    renderAll(); say(`${add.length} Zutaten übernommen. ${items.length} im Kühlschrank.`);
    const h = g("kbHaveH"); if (h) { h.tabIndex = -1; h.focus(); }
  }
}

/* Rezeptfenster: was davon schon da ist */
function hookOpen() {
  if (typeof openR !== "function" || openR.__kb) return;
  const prev = openR;
  const w = function (r) {
    prev.apply(this, arguments);
    if (!r || !items.length) return;
    const a = eng().assess(r, items, (() => { const H = new Set(); items.forEach(n => { H.add(n); (COVERS[n] || []).forEach(c => H.add(c)); }); return H; })(), O);
    if (!a.have.length) return;
    const box = `<div class="kb-dlbox"><b>Aus deinem Kühlschrank:</b> ${list(a.have)}${a.miss.length ? `<br><b class="m">Fehlt noch:</b> ${list(a.miss)}` : "<br>Alle Hauptzutaten sind da."}</div>`;
    const anchor = doc.querySelector("#dlgbody .role"); if (anchor) anchor.insertAdjacentHTML("beforebegin", box);
  };
  w.__kb = true; openR = w;   // globale Funktion aus index.html ersetzen (wie Saison und Import)
}

// iPhone-App: Fotos werden nur in der Claude-App ausgewertet
function photoAvail() {
  if (!isLocal()) return;
  ["kbCam", "kbLib"].forEach(id => { const b = g(id); if (b) b.hidden = true; });
  const p = doc.createElement("p"); p.className = "note"; p.style.margin = "0";
  p.textContent = "Kühlschrank fotografieren geht in der Claude-App (Rezeptkatalog öffnen, Tab „Kühlschrank“). Hier gibst du deine Zutaten über Kacheln und Suche an.";
  g("kbPhoto").before(p);
}

function init() {
  mount(); renderHave();
  (async () => { try { if (root.claude && !isLocal()) { sample = await root.claude.use("sample"); if (sample) sampleLim = await sample.limits().catch(() => null); } } catch (e) { sample = null } })();
  const show = () => { if (!g("v-kuehl").hidden) { hookOpen(); renderAll(); } };
  doc.addEventListener("tab-shown", e => { if (e.detail === "kuehl") show(); });
  doc.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) setTimeout(show, 0); });
  let tries = 0; const wait = setInterval(() => { if ((typeof R !== "undefined" && R.length) || ++tries > 120) { clearInterval(wait); E = null; hookOpen(); renderHave(); show(); } }, 250);
  photoAvail();
}
if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
