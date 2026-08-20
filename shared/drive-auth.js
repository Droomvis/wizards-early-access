/* =========================================================================
   drive-auth.js — gedeelde login + Drive-sync module.

   Gedrag (bewust gekozen): het inloggen gedraagt zich zoals in de Arena-app
   deed — bij een geslaagde login wordt in ÉÉN GET-call de volledige dataset
   opgehaald (collectie, decks, council-leden, notulen, ... net wat er in de
   Drive-versie staat). Dit bestand rendert echter ZELF NIETS: het geeft de
   opgehaalde data door aan de host via een callback, en de host beslist wat
   en wanneer er iets op het scherm komt. Zo kan de shell tabs/iframes pas
   laden (en dus pas "renderen") op het moment dat de gebruiker ze effectief
   opent, terwijl de sync-data al klaarstaat.

   Vereiste HTML in de host-pagina (identiek aan wat cardbuilder.html en
   arena.html al hadden):

     <div id="login-overlay">
       <div class="login-card">
         <div class="login-sigil">⟡</div>
         <h2>Wizards</h2>
         <p class="login-sub">Log in om verder te gaan.</p>
         <div id="login-form-fields">
           <label for="login-username">Naam</label>
           <input type="text" id="login-username" placeholder="Je naam (vrij te kiezen)" autocomplete="off">
           <label for="login-password">Wachtwoord</label>
           <input type="password" id="login-password" placeholder="Wachtwoord voor de Drive-sync" autocomplete="off">
           <button class="btn primary" id="btn-login">Inloggen</button>
         </div>
         <div id="login-status"></div>
         <div id="login-lastedit" style="display:none;">
           <p id="login-lastedit-text"></p>
           <button class="btn primary" id="btn-login-continue">Verdergaan</button>
         </div>
       </div>
     </div>

   En ergens in de pagina (optioneel, voor de statusbalk):
     <div id="drive-bar">
       <span id="drive-user-label"></span>
       <span id="drive-status"></span>
     </div>

   Gebruik in een module die STANDALONE moet blijven werken (bv. cardbuilder.html):

     DriveAuth.initLoginOverlay({
       appTitle: "Wizards — Kaartbuilder",
       onSuccess: function(data, session){
         collection = Array.isArray(data.collection) ? data.collection.map(normalizeCard) : [];
         ...
         renderAll();
       }
     });

   Gebruik in de SHELL (index.html), die de tabs/iframes lazy laadt:

     DriveAuth.initLoginOverlay({
       appTitle: "Wizards",
       onSuccess: function(data, session){
         DriveAuth.wireLazyTabs({
           tabBarSelector: "#tab-bar",
           panes: {
             builder:   { view: "#view-builder",   iframe: "#frame-builder",   src: "cardbuilder.html" },
             collection:{ view: "#view-collection",iframe: "#frame-collection",src: "collectie.html" },
             decks:     { view: "#view-decks",     iframe: "#frame-decks",     src: "decks.html" },
             council:   { view: "#view-council",   iframe: "#frame-council",   src: "council.html" },
             arena:     { view: "#view-arena",     iframe: "#frame-arena",     src: "arena.html" }
           },
           defaultTab: "builder"
         });
       }
     });

   Elke module-iframe roept op zijn beurt zelf ook DriveAuth.initLoginOverlay()
   aan. Omdat er dan al een geldige sessie in sessionStorage staat, slaat die
   het eigen loginscherm automatisch over en krijgt hij de reeds opgehaalde
   data meteen via onSuccess — geen tweede login, geen tweede netwerk-call.
   Wordt een module toch rechtstreeks geopend (niet via de shell), dan is er
   geen sessie en toont hij gewoon zijn eigen, normale loginscherm — elke
   module blijft dus 100% standalone bruikbaar.
   ========================================================================= */

const DriveAuth = (function(){

  const DRIVE_BASE_URL = "https://script.google.com/macros/s/AKfycbz3_l8mNJq1swh5xhGFHs0JjyxEi7xb4G5MorAuICCKZmlZcKSWhSxPEgtt_YFhK3fC4A/exec";
  const DRIVE_USERNAME_KEY = "wizards_card_builder_drive_username_v1";
  // Onthouden wachtwoord, opt-in via de checkbox — bewust in localStorage
  // (niet sessionStorage) zodat het een browserherstart overleeft. Dit is
  // enkel bedoeld voor persoonlijke/test-apparaten: het wachtwoord staat in
  // leesbare vorm lokaal opgeslagen.
  const REMEMBER_KEY = "wizards_card_builder_drive_remember_v1";
  // Gedeelde sessie tussen shell en lazy-geladen module-iframes (zelfde
  // origin vereist — dus via een lokale server draaien, niet file://).
  const SESSION_KEY = "wizards_shared_drive_session_v1";

  function driveUrl(password){
    return DRIVE_BASE_URL + "?key=" + encodeURIComponent(password);
  }

  function formatLastEdit(by, at){
    if (!by && !at) return "Nog niemand heeft hier via deze koppeling iets opgeslagen.";
    const when = at ? new Date(at).toLocaleString("nl-BE") : "onbekend moment";
    return "Laatst weggeschreven door " + (by || "iemand zonder naam") + " op " + when + ".";
  }

  // Eén GET-call die de volledige dataset ophaalt en meteen als login dient
  // (zelfde gedrag als de bestaande Arena-app).
  async function fetchFullSync(password){
    const res = await fetch(driveUrl(password), { method: "GET" });
    const data = await res.json();
    if (data.error){
      const err = new Error(data.error);
      err.driveError = data.error;
      throw err;
    }
    return data;
  }

  function saveSession(username, password, data){
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username, password, data, savedAt: Date.now() }));
    } catch (e) { /* ignore */ }
    try {
      localStorage.setItem(DRIVE_USERNAME_KEY, username);
    } catch (e) { /* ignore */ }
  }

  function loadSession(){
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.password || !parsed.data) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearSession(){
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function saveRemembered(username, password){
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
    } catch (e) { /* ignore */ }
  }

  function loadRemembered(){
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.password) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearRemembered(){
    try { localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* ignore */ }
  }

  function setDriveStatus(text, kind){
    const el = document.getElementById("drive-status");
    if (!el) return;
    el.textContent = text;
    el.className = kind || "";
  }

  // username: weergavenaam. data: de (deels) opgehaalde syncdata — enkel
  // data.hats wordt hier gebruikt (indien aanwezig) om de hoed-cache te
  // vullen. password: nodig om de bubbel klikbaar te maken (opent de
  // hoed-customizer, die op zijn beurt naar Drive kan wegschrijven).
  function updateDriveUserLabel(username, data, password){
    const el = document.getElementById("drive-user-label");
    if (!el) return;
    if (window.HatAvatar){
      if (data && data.hats) HatAvatar.setHats(data.hats);
      HatAvatar.renderBubble(el, username, { password: password });
      return;
    }
    // Terugvalgedrag als hat-avatar.js (nog) niet geladen is.
    el.innerHTML = username ? "Ingelogd als <b>" + escapeHtmlLocal(username) + "</b>" : "";
  }

  function escapeHtmlLocal(str){
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ---------- Login ----------
  // options: { appTitle, subtitle, onSuccess(data, {username, password}), skipIfSessionExists }
  function initLoginOverlay(options){
    options = options || {};
    const onSuccess = options.onSuccess || function(){};
    const skipIfSessionExists = options.skipIfSessionExists !== false;

    if (options.appTitle){
      const h2 = document.querySelector("#login-overlay h2");
      if (h2) h2.textContent = options.appTitle;
    }
    if (options.subtitle){
      const sub = document.querySelector("#login-overlay .login-sub");
      if (sub) sub.textContent = options.subtitle;
    }

    // Al een geldige gedeelde sessie? Dan meteen doorgaan, geen login-UI tonen.
    if (skipIfSessionExists){
      const session = loadSession();
      if (session){
        const overlay = document.getElementById("login-overlay");
        if (overlay) overlay.classList.add("hidden");
        updateDriveUserLabel(session.username, session.data, session.password);
        setDriveStatus("✓ " + formatLastEdit(session.data.lastEditedBy, session.data.lastEditedAt), "ok");
        onSuccess(session.data, { username: session.username, password: session.password });
        return;
      }
    }

    try {
      const savedName = localStorage.getItem(DRIVE_USERNAME_KEY);
      const nameInput0 = document.getElementById("login-username");
      if (savedName && nameInput0) nameInput0.value = savedName;
    } catch (e) { /* ignore */ }

    const btnLogin = document.getElementById("btn-login");
    const passInput = document.getElementById("login-password");
    const nameInput = document.getElementById("login-username");
    const btnContinue = document.getElementById("btn-login-continue");
    const rememberBox = document.getElementById("login-remember");
    const btnForget = document.getElementById("btn-login-forget");

    function refreshForgetLink(){
      if (!btnForget) return;
      btnForget.style.display = loadRemembered() ? "inline" : "none";
    }

    if (btnForget){
      btnForget.addEventListener("click", function(e){
        e.preventDefault();
        clearRemembered();
        if (passInput) passInput.value = "";
        if (rememberBox) rememberBox.checked = false;
        refreshForgetLink();
        const statusEl = document.getElementById("login-status");
        if (statusEl){ statusEl.textContent = "Onthouden wachtwoord op dit apparaat vergeten."; statusEl.className = ""; }
      });
    }

    async function attemptLogin(silent){
      const statusEl = document.getElementById("login-status");
      const name = (nameInput && nameInput.value.trim()) || "";
      const pass = (passInput && passInput.value) || "";

      if (!pass){
        if (statusEl){ statusEl.textContent = "Vul een wachtwoord in."; statusEl.className = "err"; }
        return;
      }

      if (statusEl){ statusEl.textContent = silent ? "Automatisch inloggen met onthouden wachtwoord…" : "Bezig met inloggen…"; statusEl.className = ""; }
      if (btnLogin) btnLogin.disabled = true;

      try {
        const data = await fetchFullSync(pass);

        saveSession(name, pass, data);
        if (rememberBox && rememberBox.checked){
          saveRemembered(name, pass);
        } else {
          clearRemembered();
        }
        refreshForgetLink();
        updateDriveUserLabel(name, data, pass);
        setDriveStatus("✓ " + formatLastEdit(data.lastEditedBy, data.lastEditedAt), "ok");

        // Werd er op het login-scherm al een hoed ontworpen vóór het
        // inloggen ("pending" draft)? Dan nu, met de bevestigde naam +
        // wachtwoord, automatisch naar Drive synchroniseren — maar enkel
        // als er nog geen hoed voor deze naam bestaat, zodat een bestaande
        // hoed nooit ongevraagd overschreven wordt.
        if (window.HatAvatar){
          const pendingHat = HatAvatar.getPendingDraft();
          if (pendingHat && !(data.hats && data.hats[name])){
            HatAvatar.clearPendingDraft();
            HatAvatar.saveToDrive(pass, name, pendingHat)
              .then(function(hats){ updateDriveUserLabel(name, { hats: hats }, pass); })
              .catch(function(){ /* stil falen — de speler kan de hoed later alsnog via het bolletje instellen */ });
          }
        }

        if (statusEl) statusEl.textContent = "";
        const formFields = document.getElementById("login-form-fields");
        if (formFields) formFields.style.display = "none";

        const lastEditText = document.getElementById("login-lastedit-text");
        const lastEditBlock = document.getElementById("login-lastedit");
        if (lastEditText) lastEditText.textContent = formatLastEdit(data.lastEditedBy, data.lastEditedAt);
        if (lastEditBlock) lastEditBlock.style.display = "block";

        if (btnContinue){
          btnContinue.onclick = function(){
            const overlay = document.getElementById("login-overlay");
            if (overlay) overlay.classList.add("hidden");
            onSuccess(data, { username: name, password: pass });
          };
        } else {
          // Geen "verdergaan"-knop aanwezig: meteen doorgaan.
          const overlay = document.getElementById("login-overlay");
          if (overlay) overlay.classList.add("hidden");
          onSuccess(data, { username: name, password: pass });
        }
      } catch (err){
        const statusEl2 = document.getElementById("login-status");
        if (err && err.driveError){
          if (statusEl2){
            statusEl2.textContent = err.driveError === "unauthorized" ? "Wachtwoord onjuist. Probeer opnieuw." : "Inloggen mislukt: " + err.driveError;
            statusEl2.className = "err";
          }
          // Onthouden wachtwoord bleek niet (meer) geldig — niet blijven
          // proberen, gewoon terugvallen op het normale, lege formulier.
          if (silent){
            clearRemembered();
            if (passInput) passInput.value = "";
            if (rememberBox) rememberBox.checked = false;
            refreshForgetLink();
          }
        } else if (statusEl2){
          statusEl2.textContent = "Kon geen verbinding maken met Drive. Controleer je internetverbinding.";
          statusEl2.className = "err";
        }
        if (btnLogin) btnLogin.disabled = false;
      }
    }

    if (btnLogin) btnLogin.addEventListener("click", () => attemptLogin(false));
    if (passInput) passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(false); });
    if (nameInput) nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(false); });

    // Onthouden wachtwoord van dit apparaat? Vul in en meteen automatisch
    // inloggen — de gebruiker hoeft dan helemaal niets meer te doen.
    refreshForgetLink();
    const remembered = loadRemembered();
    if (remembered){
      if (nameInput && remembered.username) nameInput.value = remembered.username;
      if (passInput) passInput.value = remembered.password;
      if (rememberBox) rememberBox.checked = true;
      attemptLogin(true);
    }
  }

  // ---------- Lazy tabs (voor de shell) ----------
  // config: {
  //   tabBarSelector: "#tab-bar",
  //   panes: { tabKey: { view: "#view-x", iframe: "#frame-x", src: "module.html" }, ... },
  //   defaultTab: "builder"
  // }
  function wireLazyTabs(config){
    const bar = document.querySelector(config.tabBarSelector);
    if (!bar) return;

    function activate(tabKey){
      Object.keys(config.panes).forEach(key => {
        const pane = config.panes[key];
        const viewEl = document.querySelector(pane.view);
        const isActive = key === tabKey;
        if (viewEl) viewEl.classList.toggle("active", isActive);
        if (isActive){
          const iframeEl = document.querySelector(pane.iframe);
          // Lazy: pas nu, bij het eerste bezoek aan deze tab, de iframe laden.
          if (iframeEl && !iframeEl.getAttribute("src")){
            iframeEl.setAttribute("src", pane.src);
            // Zet dataset.loaded zodra de iframe echt klaar is — onafhankelijk
            // van kruis-module boodschappen (zie window.addEventListener("message")
            // in index.html). Zonder dit blijft dataset.loaded voor de standaard-
            // tab (die al bij het opstarten laadt, dus zijn load-event allang
            // voorbij is tegen de tijd dat iemand bv. het potlood-icoon in
            // Collectie aanklikt) voor altijd leeg, en komt zo'n boodschap nooit aan.
            iframeEl.addEventListener("load", () => { iframeEl.dataset.loaded = "1"; }, { once: true });
          }
        }
      });
      bar.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabKey);
      });
    }

    bar.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => activate(btn.dataset.tab));
    });

    activate(config.defaultTab);
  }

  // Andere modules/tabs kunnen na een hoedwijziging een
  // "wizards:hat-updated"-boodschap sturen (zie hat-avatar.js) — hier
  // luisteren we daarnaar zodat de eigen drive-bar-bubbel meteen mee-update
  // als de wijziging over de eigen ingelogde gebruiker gaat.
  window.addEventListener("message", function(e){
    if (!e.data || e.data.type !== "wizards:hat-updated" || !window.HatAvatar) return;
    HatAvatar.setHatInCache(e.data.username, e.data.config);
    const session = loadSession();
    const el = document.getElementById("drive-user-label");
    if (el && session && session.username === e.data.username){
      updateDriveUserLabel(session.username, session.data, session.password);
    }
  });

  return {
    DRIVE_BASE_URL,
    driveUrl,
    formatLastEdit,
    fetchFullSync,
    saveSession,
    loadSession,
    clearSession,
    saveRemembered,
    loadRemembered,
    clearRemembered,
    initLoginOverlay,
    wireLazyTabs
  };
})();
