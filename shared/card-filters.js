/* =========================================================================
   card-filters.js — gedeelde filter/sorteer/stats-helpers voor kaartenlijsten.
   Gebruikt door: collectie.html en decks.html (beide hadden exact dezelfde
   set filters: type/theme/location/tag/fase/status/ontwerper, en dezelfde
   opmaak voor de stat-pillen).

   Vereist card-data.js (TYPE_LIST, THEME_LIST, ...) en card-render.js
   (escapeHtml, TYPE_COLOR_VAR) — laad dit bestand NA die twee.

   In tegenstelling tot het origineel (waar deze functies via een JS-closure
   stilzwijgend de module-brede `collection`-variabele gebruikten) krijgen
   allKnownTags/allKnownCreators de collectie hier expliciet als parameter
   mee — nodig omdat elke module nu zijn eigen, losse `collection` heeft. */

function allKnownTags(collection){
  const set = new Set();
  collection.forEach(c => (c.tags || []).forEach(t => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function allKnownCreators(collection){
  const set = new Set();
  collection.forEach(c => { if (c.createdBy) set.add(c.createdBy); });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function populateFilterSelects(prefix, collection){
  const typeSel = document.getElementById(`${prefix}-filter-type`);
  const themeSel = document.getElementById(`${prefix}-filter-theme`);
  const locSel = document.getElementById(`${prefix}-filter-location`);
  const tagSel = document.getElementById(`${prefix}-filter-tag`);
  const phaseSel = document.getElementById(`${prefix}-filter-phase`);
  const statusSel = document.getElementById(`${prefix}-filter-status`);
  const createdBySel = document.getElementById(`${prefix}-filter-createdBy`);
  const prevType = typeSel.value, prevTheme = themeSel.value, prevLoc = locSel.value, prevTag = tagSel.value, prevPhase = phaseSel.value, prevStatus = statusSel.value, prevCreatedBy = createdBySel.value;

  typeSel.innerHTML = '<option value="">Alle</option>' +
    TYPE_LIST.map(t => `<option value="${t}">${t}</option>`).join("");
  themeSel.innerHTML = '<option value="">Alle</option>' +
    THEME_LIST.map(t => `<option value="${t}">${t}</option>`).join("");
  locSel.innerHTML = '<option value="">Alle</option>' +
    LOCATION_LIST.map(l => `<option value="${l}">${l}</option>`).join("");
  tagSel.innerHTML = '<option value="">Alle</option>' +
    allKnownTags(collection).map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  phaseSel.innerHTML = '<option value="">Alle</option>' +
    PHASE_LIST.map(p => `<option value="${p}">${p}</option>`).join("");
  statusSel.innerHTML = '<option value="">Alle</option>' +
    STATUS_LIST.map(s => `<option value="${s}">${s}</option>`).join("");
  createdBySel.innerHTML = '<option value="">Alle</option>' +
    allKnownCreators(collection).map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");

  typeSel.value = prevType; themeSel.value = prevTheme; locSel.value = prevLoc; tagSel.value = prevTag; phaseSel.value = prevPhase; statusSel.value = prevStatus; createdBySel.value = prevCreatedBy;
}

function readFilterValues(prefix){
  const searchId = prefix === "col" ? "col-search" : "deck-edit-search";
  return {
    query: (document.getElementById(searchId).value || "").trim().toLowerCase(),
    type: document.getElementById(`${prefix}-filter-type`).value,
    theme: document.getElementById(`${prefix}-filter-theme`).value,
    location: document.getElementById(`${prefix}-filter-location`).value,
    tag: document.getElementById(`${prefix}-filter-tag`).value,
    phase: document.getElementById(`${prefix}-filter-phase`).value,
    status: document.getElementById(`${prefix}-filter-status`).value,
    createdBy: document.getElementById(`${prefix}-filter-createdBy`).value,
    sortKey: document.getElementById(`${prefix}-sort`).value
  };
}

function matchesFilters(c, f){
  if (f.type && c.type !== f.type) return false;
  if (f.theme && c.theme !== f.theme) return false;
  if (f.location && c.location !== f.location) return false;
  if (f.tag && !(c.tags || []).includes(f.tag)) return false;
  if (f.phase && c.phase !== f.phase) return false;
  if (f.status && c.status !== f.status) return false;
  if (f.createdBy && c.createdBy !== f.createdBy) return false;
  if (f.query){
    const hay = [c.name, c.type, c.theme, c.location, c.phase, c.status, c.gameText, c.flavorText, c.notes, c.createdBy, c.rarity, c.lastUpdatedBy, (c.tags || []).join(" "), (c.subtypes || []).join(" ")].join(" ").toLowerCase();
    if (!hay.includes(f.query)) return false;
  }
  return true;
}

function sortCards(list, sortKey){
  const sorted = list.slice();
  const numKey = (c, key) => { const v = c[key]; return v === "" || v === undefined ? -Infinity : Number(v); };
  switch (sortKey){
    case "name-desc":
      sorted.sort((a, b) => (b.name || "").localeCompare(a.name || "")); break;
    case "type":
      sorted.sort((a, b) => TYPE_LIST.indexOf(a.type) - TYPE_LIST.indexOf(b.type) || (a.name||"").localeCompare(b.name||"")); break;
    case "theme":
      sorted.sort((a, b) => THEME_LIST.indexOf(a.theme) - THEME_LIST.indexOf(b.theme) || (a.name||"").localeCompare(b.name||"")); break;
    case "location":
      sorted.sort((a, b) => LOCATION_LIST.indexOf(a.location) - LOCATION_LIST.indexOf(b.location) || (a.name||"").localeCompare(b.name||"")); break;
    case "phase":
      sorted.sort((a, b) => PHASE_LIST.indexOf(a.phase) - PHASE_LIST.indexOf(b.phase) || (a.name||"").localeCompare(b.name||"")); break;
    case "status":
      sorted.sort((a, b) => STATUS_LIST.indexOf(a.status) - STATUS_LIST.indexOf(b.status) || (a.name||"").localeCompare(b.name||"")); break;
    case "createdBy":
      sorted.sort((a, b) => (a.createdBy||"").localeCompare(b.createdBy||"") || (a.name||"").localeCompare(b.name||"")); break;
    case "lastUpdated-desc":
      sorted.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0)); break;
    case "firstCreated-desc":
      sorted.sort((a, b) => (b.firstCreated || 0) - (a.firstCreated || 0)); break;
    case "actionCost":
      sorted.sort((a, b) => numKey(b,"actionCost") - numKey(a,"actionCost")); break;
    case "spiteCost":
      sorted.sort((a, b) => numKey(b,"spiteCost") - numKey(a,"spiteCost")); break;
    case "body":
      sorted.sort((a, b) => numKey(b,"body") - numKey(a,"body")); break;
    case "mind":
      sorted.sort((a, b) => numKey(b,"mind") - numKey(a,"mind")); break;
    case "soul":
      sorted.sort((a, b) => numKey(b,"soul") - numKey(a,"soul")); break;
    case "name-asc":
    default:
      sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  return sorted;
}

// Bouwt de rij "stat-pillen" (totaal, per type, gem. kosten) — gebruikt door
// zowel de Collectie-stats als de Deck-stats.
function buildStatPillsHtml(total, typeCounts, avgCost, avgSpite){
  let html = `<div class="stat-pill total">${total} kaart${total === 1 ? "" : "en"}</div>`;
  html += `<div class="stat-sep"></div>`;
  TYPE_LIST.forEach(t => {
    if (!typeCounts[t]) return;
    html += `<div class="stat-pill"><span class="swatch" style="background:var(${TYPE_COLOR_VAR[t]})"></span>${t} <b>${typeCounts[t]}</b></div>`;
  });
  html += `<div class="stat-sep"></div>`;
  html += `<div class="stat-pill">Gem. Action-kost <b>${avgCost}</b></div>`;
  html += `<div class="stat-pill">Gem. Spite-kost <b>${avgSpite}</b></div>`;
  return html;
}
