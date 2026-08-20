/* =========================================================================
   card-data.js — gedeeld datamodel voor een "kaart".
   Gebruikt door: cardbuilder.html, collectie.html, decks.html, arena.html.
   Laad dit bestand VOOR card-render.js (die enkel het tekenen doet, geen
   datamodel) en voor het eigen script van de module.

   Herkomst: TYPE_LIST/THEME_LIST/LOCATION_LIST/PHASE_LIST/STATUS_LIST en
   normalizeCard() waren tot nog toe letterlijk gedupliceerd in cardbuilder
   en arena. De arena-kopie miste het "createdBy"-veld in normalizeCard —
   hier bewust de volledige (cardbuilder-)versie aangehouden zodat createdBy
   overal beschikbaar blijft. */

const TYPE_LIST = ["Wizard","Manifestation","Incantation","Hex","Destiny","Burden"];
const THEME_LIST = ["Fire","Earth","Water","Sky","Shadow","Light"];
const LOCATION_LIST = ["The Citadel","The Harbour","The Barrow","The Maw","The Wildwood","The Observatory"];
const PHASE_LIST = ["Starter","Apprentice","Journeyman","Master"];
const STATUS_LIST = ["In Design","Playtesting","Balancing","Afgewerkt","Archived"];

/* -------------------------------------------------------------------------
   Uitbreiding t.b.v. arena-automatisatie en toekomstige draft-functionaliteit
   (besproken 2026-08-15). Additief: bestaande kaarten zonder deze velden
   blijven geldig, normalizeCard() vult overal veilige defaults in. ---------- */

// Subtypes zijn afhankelijk van het hoofd-type (cfr. TO DO: "Manifestation -
// Minion", "Burden - Manifestation" zijn te centraal om louter een vrije tag
// te zijn). Lege lijst = dat type heeft (nog) geen subtypes.
const SUBTYPE_LIST_BY_TYPE = {
  Wizard: [],
  Manifestation: ["Minion", "Structure"],
  Incantation: [],
  Hex: [],
  Destiny: [],
  Burden: ["Manifestation"]
};

// Triggers: het moment waarop een effect afgaat. Sluit aan bij wat al in de
// arena-code als voorbeeld genoemd wordt (OnPlayed, OnExhausted).
const TRIGGER_LIST = [
  "OnPlayed", "OnEnterPlay", "OnLeavePlay",
  "OnExhausted", "OnReady", "OnRest",
  "StartOfTurn", "EndOfTurn",
  "OnDiscard", "OnBanish", "OnDamaged"
];

// Acties: wat het effect concreet doet. Kan later 1-op-1 gekoppeld worden aan
// bestaande arena-functies (adjustCounter, addCounterToInstance, drawCard,
// performCardMove, ...) zodra de engine gebouwd wordt.
const ACTION_LIST = [
  "Damage", "Heal",
  "AddCounter", "RemoveCounter",
  "ModifyShield", "ModifyStat",
  "Draw", "Discard", "Banish", "ReturnToHand",
  "GainAction", "GainSpite",
  "Exhaust", "Ready",
  "Search"
];

// Target: wie/wat het effect raakt. "chosen" laat de speler kiezen (koppelt
// aan de bestaande openArenaChoice()-overlay in arena.html).
const TARGET_LIST = [
  "self", "controller", "opponent",
  "opponentActiveWizard", "ownActiveWizard",
  "allInPlay", "allOpponentInPlay", "allOwnInPlay",
  "chosen"
];

const RARITY_LIST = ["Common", "Uncommon", "Rare", "Signature"];

function normalizeEffect(raw){
  raw = raw || {};
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    trigger: TRIGGER_LIST.includes(raw.trigger) ? raw.trigger : "",
    action: ACTION_LIST.includes(raw.action) ? raw.action : "",
    target: TARGET_LIST.includes(raw.target) ? raw.target : "self",
    value: toNum(raw.value, 0),
    // Vrije, niet-gevalideerde condition-string (bv. "bodyShield == 0") —
    // bewust niet dichtgetimmerd zolang er geen condition-parser bestaat.
    condition: typeof raw.condition === "string" ? raw.condition : "",
    // Extra kost voor geactiveerde vermogens (los van actionCost/spiteCost
    // om de kaart te spelen). exhaustSelf dekt de "tap deze kaart"-kost.
    cost: {
      spite: toNum(raw.cost && raw.cost.spite, 0),
      exhaustSelf: !!(raw.cost && raw.cost.exhaustSelf)
    }
  };
}

const THEME_COLOR_VAR = {
  Fire:"--t-fire", Earth:"--t-earth", Water:"--t-water",
  Sky:"--t-sky", Shadow:"--t-shadow", Light:"--t-light"
};

function uid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,9);
}

function toNum(v, fallback){
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCard(raw){
  raw = raw || {};
  return {
    // Onbekende/toekomstige velden (bv. aangemaakt door een later bijgewerkte
    // sessie) blijven behouden, ook als DEZE sessie ze nog niet kent —
    // voorkomt dataverlies wanneer een verouderde tab nog even meeschrijft
    // naar Drive terwijl een teamgenoot al met een nieuwer schema werkt.
    // De expliciete velden hieronder overschrijven/valideren wat er ook in
    // raw stond.
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    name: typeof raw.name === "string" ? raw.name : "",
    type: TYPE_LIST.includes(raw.type) ? raw.type : "Manifestation",
    theme: THEME_LIST.includes(raw.theme) ? raw.theme : "",
    location: LOCATION_LIST.includes(raw.location) ? raw.location : "",
    phase: PHASE_LIST.includes(raw.phase) ? raw.phase : "",
    status: STATUS_LIST.includes(raw.status) ? raw.status : "In Design",
    actionCost: toNum(raw.actionCost, 0),
    spiteCost: toNum(raw.spiteCost, 0),
    body: raw.body === "" || raw.body === null || raw.body === undefined ? "" : toNum(raw.body, ""),
    mind: raw.mind === "" || raw.mind === null || raw.mind === undefined ? "" : toNum(raw.mind, ""),
    soul: raw.soul === "" || raw.soul === null || raw.soul === undefined ? "" : toNum(raw.soul, ""),
    gameText: typeof raw.gameText === "string" ? raw.gameText : "",
    flavorText: typeof raw.flavorText === "string" ? raw.flavorText : "",
    image: typeof raw.image === "string" ? raw.image : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === "string" && t.trim()).map(t => t.trim()) : [],
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",

    // --- nieuw: aanmaak-/wijzigingsmetadata. firstCreated wordt éénmalig
    // gezet (bij newCard()/duplicateCard()) en daarna nooit overschreven
    // door normalizeCard zelf. lastUpdated/lastUpdatedBy worden bijgewerkt
    // telkens een kaart effectief wijzigt (zie syncFromForm in cardbuilder).
    // Bestaande kaarten van vóór deze uitbreiding hebben firstCreated/
    // lastUpdated op null — geen historische data beschikbaar, dus bewust
    // niet gegokt op een datum.
    firstCreated: (typeof raw.firstCreated === "number") ? raw.firstCreated : (raw.firstCreated || null),
    lastUpdated: (typeof raw.lastUpdated === "number") ? raw.lastUpdated : (raw.lastUpdated || null),
    lastUpdatedBy: typeof raw.lastUpdatedBy === "string" ? raw.lastUpdatedBy : "",

    // --- nieuw: subtypes (een kaart mag er meerdere hebben), afhankelijk
    // van (het genormaliseerde) type. Getoond op de kaart als "Type - Sub1, Sub2".
    subtypes: (() => {
      const allowed = SUBTYPE_LIST_BY_TYPE[TYPE_LIST.includes(raw.type) ? raw.type : "Manifestation"] || [];
      const incoming = Array.isArray(raw.subtypes) ? raw.subtypes : (typeof raw.subtype === "string" && raw.subtype ? [raw.subtype] : []);
      return incoming.filter(s => allowed.includes(s));
    })(),

    // --- nieuw: machine-leesbare effecten naast gameText ---
    effects: Array.isArray(raw.effects) ? raw.effects.map(normalizeEffect) : [],

    // --- nieuw: draft-metadata ---
    rarity: RARITY_LIST.includes(raw.rarity) ? raw.rarity : "",
    // Bewust default false: een kaart moet EXPLICIET vrijgegeven worden
    // voor draft, i.p.v. dat alles er per ongeluk instaat zodra het veld
    // bestaat. "Afgewerkt"-status is een voorwaarde, geen garantie.
    draftLegal: !!raw.draftLegal
  };
}
