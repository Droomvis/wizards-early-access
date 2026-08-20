/* =========================================================================
   card-render.js — gedeelde logica voor het tekenen van een "kaart".
   Gebruikt door: cardbuilder.html en arena.html (en later council.html indien
   nodig). Laad dit bestand samen met card-render.css.

   Bevat:
     - PHASE_COLOR, TYPE_COLOR_VAR, TYPE_CONFIG  (kaarttype-configuratie)
     - escapeHtml(str)
     - buildCardFrameHtml(card)  → geeft de HTML-string van een kaart terug

   Deze module bewaart GEEN state en doet GEEN DOM-mounting zelf — dat blijft
   per app anders (renderPreview, collectie-grid, arena-bord, ...) en hoort
   dus in de app-specifieke bestanden thuis.

   Herkomst: dit was tot nog toe letterlijk gedupliceerde code in zowel
   cardbuilder.html als arena.html. Bij het samenvoegen bleek TYPE_CONFIG
   voor Destiny/Burden uiteen te zijn gegroeid (stats: true vs. false) —
   opgelost door hier bewust te kiezen voor stats: true (zoals Cardbuilder). */

const PHASE_COLOR = { Starter: "#9a9a9a", Apprentice: "#b08d57", Journeyman: "#c3c7d1", Master: "#d4af37" };

const TYPE_COLOR_VAR = {
  Wizard: "--c-wizard",
  Manifestation: "--c-manifestation",
  Incantation: "--c-incantation",
  Hex: "--c-hex",
  Destiny: "--c-destiny",
  Burden: "--c-burden"
};

// Welke veldgroepen relevant zijn per kaarttype (stuurt enkel show/hide aan —
// er wordt niets afgedwongen en onderliggende data gaat nooit verloren bij verbergen).
const TYPE_CONFIG = {
  Wizard:        { theme:false, location:false, cost:false, stats:true  },
  Manifestation: { theme:true,  location:false, cost:true,  stats:true  },
  Incantation:   { theme:true,  location:false, cost:true,  stats:false },
  Hex:           { theme:true,  location:false, cost:true,  stats:false },
  Destiny:       { theme:false, location:true,  cost:false, stats:true  },
  Burden:        { theme:false, location:false, cost:true,  stats:true  }
};

function escapeHtml(str){
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function buildCardFrameHtml(card){
  const cfg = TYPE_CONFIG[card.type] || TYPE_CONFIG.Manifestation;
  const typeColorVar = TYPE_COLOR_VAR[card.type] || "--gold";

  let pipsHtml = "";
  if (cfg.cost && (card.actionCost > 0 || card.spiteCost > 0)){
    const actionPip = `<div class="pip action${card.actionCost > 0 ? "" : " pip-hidden"}" title="Action-kost">${card.actionCost}A</div>`;
    const spitePip = `<div class="pip spite${card.spiteCost > 0 ? "" : " pip-hidden"}" title="Spite-kost">${card.spiteCost}S</div>`;
    pipsHtml = `<div class="card-pips">${actionPip}${spitePip}</div>`;
  }

  let subLabel = "";
  if (cfg.theme && card.theme){
    subLabel = `<span>${escapeHtml(card.theme)}</span>`;
  } else if (cfg.location && card.location){
    subLabel = `<span>${escapeHtml(card.location)}</span>`;
  }

  // Subtype(s) tonen naast het hoofdtype, bv. "Manifestation - Minion" of
  // "Burden - Manifestation" (cfr. TO DO). Enkel het spelmechanische type +
  // subtype hoort hier; rarity/draftLegal/effects zijn bewust NOOIT op de
  // kaart zelf te zien — dat zijn interne/engine-velden.
  const subtypeLabel = (Array.isArray(card.subtypes) && card.subtypes.length)
    ? ` - ${card.subtypes.map(escapeHtml).join(", ")}`
    : "";

  let artHtml = card.image
    ? `<div class="card-art" style="background-image:url(${card.image})"></div>`
    : `<div class="card-art">${escapeHtml(card.type)}</div>`;

  let statsHtml = "";
  if (cfg.stats){
    const parts = [];
    if (card.body !== "") parts.push(`<div class="stat"><span class="n">${escapeHtml(card.body)}</span><span class="l">BODY</span></div>`);
    if (card.mind !== "") parts.push(`<div class="stat"><span class="n">${escapeHtml(card.mind)}</span><span class="l">MIND</span></div>`);
    if (card.soul !== "") parts.push(`<div class="stat"><span class="n">${escapeHtml(card.soul)}</span><span class="l">SOUL</span></div>`);
    if (parts.length) statsHtml = `<div class="card-stats">${parts.join("")}</div>`;
  }

  let flavorHtml = card.flavorText
    ? `<div class="card-flavor">${escapeHtml(card.flavorText)}</div>`
    : "";

  const phaseHtml = card.phase
    ? `<div class="card-phase-strip" style="background:${PHASE_COLOR[card.phase] || "#9a9a9a"};">${escapeHtml(card.phase)}</div>`
    : "";

  return `
    <div class="card-frame">
      <div class="card-inner" style="--type-color: var(${typeColorVar});">
        ${pipsHtml}
        <div class="card-name-banner">${escapeHtml(card.name) || "&nbsp;"}</div>
        <div style="text-align:center;">
          <div class="card-type-ribbon">
            <span>${escapeHtml(card.type)}${subtypeLabel}</span>
            ${subLabel ? `<span class="sep">·</span>${subLabel}` : ""}
          </div>
        </div>
        ${artHtml}
        <div class="card-text">${escapeHtml(card.gameText)}</div>
        ${flavorHtml}
        ${statsHtml}
        ${phaseHtml}
      </div>
    </div>
  `;
}

/* ---------- Zwevende hover-preview ----------
   Generieke helper (o.a. gebruikt in de deck-tabel en de arena) om op hover
   een volledige kaart te tonen naast de aanwijzer. Eenmalig aan <body>
   gehangen. */
let cardPreviewEl = null;
function ensureCardPreviewEl(){
  if (!cardPreviewEl){
    cardPreviewEl = document.createElement("div");
    cardPreviewEl.id = "card-hover-preview";
    document.body.appendChild(cardPreviewEl);
  }
  return cardPreviewEl;
}

function showCardPreview(triggerEl, card){
  if (!card) return;
  const el = ensureCardPreviewEl();
  el.innerHTML = buildCardFrameHtml(card);
  el.style.display = "block";
  const tr = triggerEl.getBoundingClientRect();
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    let x = tr.right + 14;
    let y = tr.top;
    if (x + r.width > window.innerWidth - 8) x = tr.left - r.width - 14;
    if (x < 8) x = 8;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
    if (y < 8) y = 8;
    el.style.left = x + "px";
    el.style.top = y + "px";
  });
}

function hideCardPreview(){
  if (cardPreviewEl) cardPreviewEl.style.display = "none";
}
