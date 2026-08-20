/* =========================================================================
   hat-avatar.js — gedeelde module voor de procedurale wizard-hoed-avatar.

   Verantwoordelijk voor:
   - De procedurale hoed-tekening zelf (poort van Unsorted/wizard_hat_generator.html)
   - Het bepalen van een hoed-config per gebruiker (Drive-cache -> lokale
     draft -> deterministisch-uit-naam gegenereerd -> default)
   - Het bolvormige avatar-"bubbel"-element (hoed + naam eronder) dat overal
     waar vroeger "Ingelogd als X" stond getoond wordt
   - De customizer-overlay (sliders + live preview) om de hoed aan te passen
   - Synchroniseren van de hoed-config via de bestaande Drive-JSON. Dit
     gebeurt via hetzelfde "onbekende velden blijven bewaard"-mechanisme dat
     cardbuilder.html al gebruikt (zie driveUnknownFields aldaar) — er is
     dus GEEN wijziging aan de Google Apps Script-backend nodig, een nieuw
     top-level veld "hats" wordt gewoon mee opgeslagen en teruggegeven.

   Gebruik (kort):
     <script src="shared/hat-avatar.js"></script>
     HatAvatar.setHats(data.hats);                    // na een fetch/sync
     HatAvatar.renderBubble(el, username, {password}); // in plaats van tekst
     HatAvatar.openCustomizer({ username, password, onSave });
   ========================================================================= */

const HatAvatar = (function () {
  "use strict";

  const LOCAL_DRAFT_PREFIX = "wizards_hat_draft_v1_";
  const HATS_CACHE_KEY = "wizards_hats_cache_v1"; // fallback cache, beste-poging tussen modules/tabs

  const DEFAULT_CONFIG = {
    seed: 42069,
    hue: 280,
    hatHeight: 380,
    brimWidth: 350,
    bend: 100,
    folds: 4,
    raggedness: 30
  };

  const RANGES = {
    seed: [1, 99999],
    hue: [0, 360],
    hatHeight: [200, 500],
    brimWidth: [250, 500],
    bend: [-250, 250],
    folds: [0, 8],
    raggedness: [0, 80]
  };

  // ---------- Config helpers ----------

  function clampConfig(cfg) {
    const out = Object.assign({}, DEFAULT_CONFIG, cfg || {});
    Object.keys(RANGES).forEach((k) => {
      const [min, max] = RANGES[k];
      let v = Number(out[k]);
      if (!isFinite(v)) v = DEFAULT_CONFIG[k];
      out[k] = Math.min(max, Math.max(min, v));
    });
    return out;
  }

  function randomConfig() {
    return clampConfig({
      seed: Math.floor(Math.random() * 99999) + 1,
      hue: Math.floor(Math.random() * 360),
      hatHeight: Math.floor(Math.random() * 300) + 200,
      brimWidth: Math.floor(Math.random() * 250) + 250,
      bend: Math.floor(Math.random() * 500) - 250,
      folds: Math.floor(Math.random() * 9),
      raggedness: Math.floor(Math.random() * 80)
    });
  }

  // Deterministische "default hoed" op basis van de gebruikersnaam, zodat
  // spelers die nog nooit iets customised hebben toch elk een herkenbaar
  // eigen hoedje krijgen i.p.v. allemaal exact dezelfde default.
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function configFromUsername(username) {
    const name = (username || "wizard").trim().toLowerCase() || "wizard";
    const h = hashString(name);
    // Verdeel de hash-bits over de verschillende parameters.
    const seed = 1 + (h % 99999);
    const hue = (h >>> 8) % 360;
    const hatHeight = 200 + ((h >>> 4) % 301);
    const brimWidth = 250 + ((h >>> 12) % 251);
    const bend = -250 + ((h >>> 16) % 501);
    const folds = (h >>> 20) % 9;
    const raggedness = (h >>> 24) % 81;
    return clampConfig({ seed, hue, hatHeight, brimWidth, bend, folds, raggedness });
  }

  // ---------- Lokale opslag ----------

  function getLocalDraft(username) {
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_PREFIX + (username || "").trim().toLowerCase());
      if (!raw) return null;
      return clampConfig(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function setLocalDraft(username, config) {
    try {
      localStorage.setItem(
        LOCAL_DRAFT_PREFIX + (username || "").trim().toLowerCase(),
        JSON.stringify(clampConfig(config))
      );
    } catch (e) {
      /* opslag onbeschikbaar — negeren */
    }
  }

  // Speciale "pending" draft voor het login-scherm: nog geen (bevestigde)
  // gebruikersnaam bekend op het moment dat er gecustomised wordt.
  const PENDING_KEY = "wizards_hat_draft_pending_v1";

  function getPendingDraft() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? clampConfig(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function setPendingDraft(config) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(clampConfig(config)));
    } catch (e) {
      /* ignore */
    }
  }

  function clearPendingDraft() {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Hats-cache (van de laatst opgehaalde volledige Drive-sync) ----------

  let hatsCache = {};
  try {
    const raw = localStorage.getItem(HATS_CACHE_KEY);
    if (raw) hatsCache = JSON.parse(raw) || {};
  } catch (e) {
    hatsCache = {};
  }

  function persistHatsCache() {
    try {
      localStorage.setItem(HATS_CACHE_KEY, JSON.stringify(hatsCache));
    } catch (e) {
      /* ignore */
    }
  }

  function setHats(hatsObj) {
    hatsCache = Object.assign({}, hatsCache, hatsObj || {});
    persistHatsCache();
  }

  function getHats() {
    return hatsCache;
  }

  function setHatInCache(username, config) {
    const key = (username || "").trim();
    if (!key) return;
    hatsCache = Object.assign({}, hatsCache, { [key]: clampConfig(config) });
    persistHatsCache();
  }

  // Bepaalt de te tonen hoed voor een gebruiker: Drive-cache > lokale draft
  // > deterministische default uit de naam.
  function getConfig(username) {
    const key = (username || "").trim();
    if (key && hatsCache && hatsCache[key]) return clampConfig(hatsCache[key]);
    const draft = getLocalDraft(key);
    if (draft) return draft;
    return configFromUsername(key);
  }

  // ---------- Procedurale tekening (poort van wizard_hat_generator.html) ----------
  // Werkt intern altijd op een virtueel 800x800 canvas, ongeacht de
  // uiteindelijke weergavegrootte (die wordt later geschaald) — zo blijven
  // lijndiktes, sparkle-groottes etc. verhoudingsgewijs identiek aan het
  // origineel, ongeacht of dit voor een klein bolletje of het grote
  // customizer-canvas gebruikt wordt.

  function drawHatScene(ctx, cfg) {
    const W = 800, H = 800;
    let currentSeed = cfg.seed | 0;

    function seededRandom() {
      let t = (currentSeed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function randomRange(min, max) {
      return min + seededRandom() * (max - min);
    }
    function drawSparkle(x, y, size) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.quadraticCurveTo(x, y, x + size, y);
      ctx.quadraticCurveTo(x, y, x, y + size);
      ctx.quadraticCurveTo(x, y, x - size, y);
      ctx.quadraticCurveTo(x, y, x, y - size);
      ctx.fill();
    }

    const hue = cfg.hue;
    const height = cfg.hatHeight;
    const brim = cfg.brimWidth;
    const bend = cfg.bend;
    const numFolds = cfg.folds;
    const raggedness = cfg.raggedness;

    const cx = W / 2;
    const cy = H - 150;

    const mainColor = `hsl(${hue}, 40%, 35%)`;
    const highlightColor = `hsl(${hue}, 45%, 45%)`;
    const shadowColor = `hsl(${hue}, 50%, 15%)`;
    const darkOutline = `hsl(${hue}, 60%, 8%)`;
    const bandColor = `hsl(${(hue + 160) % 360}, 50%, 25%)`;

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // 1. Achterste rand
    ctx.fillStyle = shadowColor;
    ctx.strokeStyle = darkOutline;
    ctx.lineWidth = 4;
    ctx.beginPath();
    let backPoints = 12;
    ctx.moveTo(cx - brim / 2, cy);
    for (let i = 1; i <= backPoints; i++) {
      let t = i / backPoints;
      let angle = Math.PI + t * Math.PI;
      let r = brim / 2 + (seededRandom() - 0.5) * raggedness;
      let x = cx + Math.cos(angle) * r;
      let y = cy + Math.sin(angle) * (r * 0.25) + (seededRandom() - 0.5) * (raggedness * 0.5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx + brim / 2, cy);
    ctx.fill();
    ctx.stroke();

    // 2. Kegel-lichaam
    const tipX = cx + bend;
    const tipY = cy - height;

    let leftCp1X = cx - brim / 3.5 - randomRange(0, raggedness);
    let leftCp1Y = cy - height * 0.3;
    let leftCp2X = tipX - bend * 0.3 - randomRange(0, raggedness * 1.5);
    let leftCp2Y = tipY + height * 0.3;

    let rightCp1X = tipX + bend * 0.3 + randomRange(0, raggedness * 1.5);
    let rightCp1Y = tipY + height * 0.3;
    let rightCp2X = cx + brim / 3.5 + randomRange(0, raggedness);
    let rightCp2Y = cy - height * 0.3;

    ctx.beginPath();
    ctx.moveTo(cx - brim / 3, cy);
    ctx.bezierCurveTo(leftCp1X, leftCp1Y, leftCp2X, leftCp2Y, tipX, tipY);
    ctx.bezierCurveTo(rightCp1X, rightCp1Y, rightCp2X, rightCp2Y, cx + brim / 3, cy);
    ctx.quadraticCurveTo(cx, cy + 25 + randomRange(-raggedness / 3, raggedness / 3), cx - brim / 3, cy);

    let coneGrad = ctx.createLinearGradient(cx - brim / 2, 0, cx + brim / 2, 0);
    coneGrad.addColorStop(0, mainColor);
    coneGrad.addColorStop(0.3, highlightColor);
    coneGrad.addColorStop(0.8, mainColor);
    coneGrad.addColorStop(1, shadowColor);

    ctx.fillStyle = coneGrad;
    ctx.fill();
    ctx.stroke();

    // 3. Plooien
    ctx.strokeStyle = shadowColor;
    for (let i = 0; i < numFolds; i++) {
      let t = 0.15 + seededRandom() * 0.7;
      let foldY = cy - height * t;
      let foldX = cx + bend * (t * t);
      let fWidth = (brim / 2.5) * (1 - t);

      ctx.lineWidth = 3 + seededRandom() * 5;
      ctx.beginPath();

      let startX = foldX - fWidth + randomRange(-raggedness / 2, raggedness / 2);
      let startY = foldY + randomRange(-raggedness, raggedness);
      let endX = foldX + fWidth + randomRange(-raggedness / 2, raggedness / 2);
      let endY = foldY + randomRange(-raggedness, raggedness);

      let cpX = foldX + randomRange(-20, 20);
      let cpY = foldY + 20 + randomRange(0, raggedness);

      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.stroke();

      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY - 4);
      ctx.quadraticCurveTo(cpX, cpY - 4, endX, endY - 4);
      ctx.stroke();
      ctx.strokeStyle = shadowColor;
    }

    // 4. Hoedenband
    let bandWidth = brim / 3;
    ctx.fillStyle = bandColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - bandWidth, cy - 5);
    ctx.quadraticCurveTo(cx, cy + 20 + randomRange(-5, 5), cx + bandWidth, cy - 5);
    ctx.lineTo(cx + bandWidth * 0.9, cy - 35 + randomRange(-10, 10));
    ctx.quadraticCurveTo(cx, cy - 10 + randomRange(-5, 5), cx - bandWidth * 0.9, cy - 35 + randomRange(-10, 10));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Gesp
    let bWidth = 35 + randomRange(-5, 10);
    let bHeight = 30 + randomRange(-5, 5);
    let bX = cx - bWidth / 2 + randomRange(-15, 15);
    let bY = cy - 25;

    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 6;
    ctx.strokeRect(bX, bY, bWidth, bHeight);
    ctx.fillStyle = darkOutline;
    ctx.fillRect(bX + bWidth / 2 - 2, bY, 4, bHeight);

    // 6. Voorste rand
    let brimGrad = ctx.createRadialGradient(cx, cy, brim / 4, cx, cy, brim / 2);
    brimGrad.addColorStop(0, mainColor);
    brimGrad.addColorStop(1, shadowColor);

    ctx.fillStyle = brimGrad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - brim / 2, cy);

    let frontSegments = 16;
    for (let i = 1; i <= frontSegments; i++) {
      let t = i / frontSegments;
      let angle = t * Math.PI;
      let r = brim / 2 + randomRange(-raggedness, raggedness);
      let x = cx - Math.cos(angle) * r;
      let y = cy + Math.sin(angle) * (r * 0.3) + randomRange(-raggedness / 2, raggedness / 2);
      ctx.lineTo(x, y);
    }
    ctx.quadraticCurveTo(cx, cy + 15, cx - brim / 2, cy);
    ctx.fill();
    ctx.stroke();

    // Sprankels
    let numSparkles = Math.floor(randomRange(2, 8));
    for (let i = 0; i < numSparkles; i++) {
      drawSparkle(cx + randomRange(-brim / 1.5, brim / 1.5), cy - randomRange(0, height * 1.1), randomRange(2, 6));
    }
  }

  // Render de hoed op een vierkant canvas-element, geschaald vanuit de
  // interne 800x800 werkruimte. Vult een gradient-achtergrond zodat het er
  // ook als klein bolletje meteen "af" uitziet (zelfde stijl als de
  // bestaande council-avatars).
  function renderCircle(canvasEl, config, opts) {
    opts = opts || {};
    const cfg = clampConfig(config);
    const size = canvasEl.width; // canvas moet vierkant zijn, width==height
    const ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    if (opts.circleBg !== false) {
      const bgGrad = ctx.createLinearGradient(0, 0, size, size);
      bgGrad.addColorStop(0, "#3d2c10");
      bgGrad.addColorStop(1, "#221808");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);
    }

    const off = document.createElement("canvas");
    off.width = 800;
    off.height = 800;
    const octx = off.getContext("2d");
    drawHatScene(octx, cfg);

    ctx.drawImage(off, 0, 0, 800, 800, 0, 0, size, size);
    ctx.restore();
  }

  // Groot, niet-cirkelvormig canvas zoals in de originele generator —
  // gebruikt in de customizer voor een duidelijke live-preview.
  function renderFull(canvasEl, config) {
    const cfg = clampConfig(config);
    const w = canvasEl.width, h = canvasEl.height;
    const ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    bg.addColorStop(0, "#3a3a4a");
    bg.addColorStop(1, "#111");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const off = document.createElement("canvas");
    off.width = 800;
    off.height = 800;
    drawHatScene(off.getContext("2d"), cfg);
    ctx.drawImage(off, 0, 0, 800, 800, 0, 0, w, h);
    ctx.restore();
  }

  // ---------- Drive-sync ----------
  // Haalt de volledige, actuele dataset op, past enkel het "hats"-veld aan
  // en schrijft alles terug — zo blijft de rest (collectie, decks, ...)
  // ongemoeid, ook als die intussen door iemand anders gewijzigd werd.
  async function saveToDrive(password, username, config) {
    if (!window.DriveAuth) throw new Error("DriveAuth niet beschikbaar");
    const cfg = clampConfig(config);
    const fresh = await DriveAuth.fetchFullSync(password);
    const hats = Object.assign({}, fresh.hats || {}, { [username]: cfg });
    const payload = Object.assign({}, fresh, { hats });
    const res = await fetch(DriveAuth.driveUrl(password), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error((data && data.error) || "Wegschrijven mislukt");
    }
    setHats(hats);
    return hats;
  }

  // ---------- Bubbel (hoed + naam), vervangt "Ingelogd als X" ----------

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderBubble(containerEl, username, opts) {
    if (!containerEl) return;
    opts = opts || {};
    const size = opts.size || 34;
    containerEl.innerHTML = "";
    if (!username) return;

    const wrap = document.createElement(opts.clickable === false ? "div" : "button");
    wrap.className = "hat-avatar-wrap";
    if (opts.clickable === false) {
      wrap.style.cursor = "default";
    } else {
      wrap.type = "button";
      wrap.title = "Klik om je hoed aan te passen";
    }

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.className = "hat-avatar-circle";
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";

    const nameEl = document.createElement("span");
    nameEl.className = "hat-avatar-name";
    nameEl.innerHTML = escapeHtml(username);

    wrap.appendChild(canvas);
    wrap.appendChild(nameEl);
    containerEl.appendChild(wrap);

    try {
      renderCircle(canvas, getConfig(username));
    } catch (e) {
      /* canvas-fout mag de rest van de UI niet blokkeren */
    }

    if (opts.clickable !== false && opts.password) {
      wrap.addEventListener("click", function () {
        openCustomizer({
          username: username,
          password: opts.password,
          config: getConfig(username),
          onSave: function (newConfig) {
            setHatInCache(username, newConfig);
            renderBubble(containerEl, username, opts);
            if (opts.onSaved) opts.onSaved(newConfig);
          }
        });
      });
    }

    return wrap;
  }

  // ---------- Customizer overlay ----------

  let customizerEl = null;

  function closeCustomizer() {
    if (customizerEl && customizerEl.parentNode) customizerEl.parentNode.removeChild(customizerEl);
    customizerEl = null;
  }

  const SLIDER_DEFS = [
    { key: "seed", label: "Zaadgetal" },
    { key: "hue", label: "Kleur (Hue)" },
    { key: "hatHeight", label: "Hoogte kegel" },
    { key: "brimWidth", label: "Breedte rand" },
    { key: "bend", label: "Buiging" },
    { key: "folds", label: "Kreukels" },
    { key: "raggedness", label: "Organische misvorming" }
  ];

  function openCustomizer(options) {
    options = options || {};
    closeCustomizer();

    let working = clampConfig(options.config || getPendingDraft() || configFromUsername(options.username));

    const overlay = document.createElement("div");
    overlay.className = "hat-modal-overlay";

    const card = document.createElement("div");
    card.className = "hat-modal-card";

    card.innerHTML =
      '<div class="hat-modal-header">' +
      '<h2>🧙 Pas je hoed aan</h2>' +
      '<button type="button" class="hat-modal-close" title="Sluiten">✕</button>' +
      "</div>" +
      '<div class="hat-modal-body">' +
      '<div class="hat-modal-preview"><canvas class="hat-modal-canvas" width="260" height="260"></canvas></div>' +
      '<div class="hat-modal-controls"></div>' +
      "</div>" +
      '<div class="hat-modal-footer">' +
      '<button type="button" class="btn hat-modal-random">🎲 Willekeurig</button>' +
      '<div class="hat-modal-spacer"></div>' +
      '<button type="button" class="btn hat-modal-cancel">Annuleren</button>' +
      '<button type="button" class="btn primary hat-modal-save">Opslaan</button>' +
      "</div>";

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    customizerEl = overlay;

    const previewCanvas = card.querySelector(".hat-modal-canvas");
    const controlsWrap = card.querySelector(".hat-modal-controls");

    function redraw() {
      renderFull(previewCanvas, working);
    }

    SLIDER_DEFS.forEach((def) => {
      const [min, max] = RANGES[def.key];
      const group = document.createElement("div");
      group.className = "hat-control-group";
      group.innerHTML =
        '<label>' + escapeHtml(def.label) + ' <span class="hat-val-display"></span></label>' +
        '<input type="range" min="' + min + '" max="' + max + '" step="1">';
      const input = group.querySelector("input");
      const valSpan = group.querySelector(".hat-val-display");
      input.value = working[def.key];
      valSpan.textContent = working[def.key];
      input.addEventListener("input", () => {
        working = Object.assign({}, working, { [def.key]: Number(input.value) });
        valSpan.textContent = input.value;
        redraw();
      });
      controlsWrap.appendChild(group);
    });

    redraw();

    card.querySelector(".hat-modal-random").addEventListener("click", () => {
      working = randomConfig();
      // Herteken sliders + preview
      const inputs = controlsWrap.querySelectorAll("input[type=range]");
      const spans = controlsWrap.querySelectorAll(".hat-val-display");
      SLIDER_DEFS.forEach((def, i) => {
        inputs[i].value = working[def.key];
        spans[i].textContent = working[def.key];
      });
      redraw();
    });

    function close() {
      closeCustomizer();
      if (options.onClose) options.onClose();
    }

    card.querySelector(".hat-modal-close").addEventListener("click", close);
    card.querySelector(".hat-modal-cancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    card.querySelector(".hat-modal-save").addEventListener("click", async () => {
      const saveBtn = card.querySelector(".hat-modal-save");
      const original = saveBtn.textContent;

      // Nog geen bevestigde gebruikersnaam (login-scherm): enkel lokaal
      // bewaren als "pending" draft, wordt na inloggen automatisch
      // gesynchroniseerd (zie index.html).
      if (!options.username) {
        setPendingDraft(working);
        closeCustomizer();
        if (options.onSave) options.onSave(working);
        return;
      }

      setLocalDraft(options.username, working);

      if (options.password) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Opslaan…";
        try {
          await saveToDrive(options.password, options.username, working);
        } catch (e) {
          alert("Kon de hoed niet naar Drive wegschrijven: " + (e && e.message ? e.message : e));
        }
        saveBtn.disabled = false;
        saveBtn.textContent = original;
      }

      closeCustomizer();
      if (options.onSave) options.onSave(working);

      // Andere modules (iframes) op de hoogte brengen zodat hun eigen
      // bubbel/avatars meteen mee-updaten.
      try {
        const msg = { type: "wizards:hat-updated", username: options.username, config: working };
        window.postMessage(msg, "*");
        if (window.top && window.top !== window) window.top.postMessage(msg, "*");
        if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
      } catch (e) {
        /* cross-origin of geen iframe-context — negeren */
      }
    });
  }

  return {
    DEFAULT_CONFIG,
    RANGES,
    clampConfig,
    randomConfig,
    configFromUsername,
    getLocalDraft,
    setLocalDraft,
    getPendingDraft,
    setPendingDraft,
    clearPendingDraft,
    setHats,
    getHats,
    setHatInCache,
    getConfig,
    renderCircle,
    renderFull,
    saveToDrive,
    renderBubble,
    openCustomizer,
    closeCustomizer
  };
})();

window.HatAvatar = HatAvatar;
