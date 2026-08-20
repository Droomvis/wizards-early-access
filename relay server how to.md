# Wizards test-arena — relay-server

Klein WebSocket-servertje dat spelers in dezelfde "room" verbindt. Twee
dingen lopen hierover:

1. **Arena-sync**: enkel de `arena`-state van de HTML-app doorsturen tussen
   de spelers in een room. Geen spellogica, geen database — alleen
   doorgeefluik + "wie zat er als laatste in deze room".
2. **Council voice-chat signalering**: WebRTC-onderhandeling (offer/answer/
   ICE) gericht doorsturen tussen twee specifieke peers, zodat de browsers
   zelf een rechtstreekse audioverbinding (mesh) kunnen opzetten. De server
   leest ook hier de inhoud niet — enkel het `to`-veld wordt bekeken om te
   weten waar een bericht naartoe moet.

Beide gebruiken dezelfde server en hetzelfde `room`-concept, maar met eigen
roomcodes (bv. de arena gebruikt `VUUR12`, de council-voicechat gebruikt
`COUNCIL-VUUR12`) — ze lopen dus volledig gescheiden van elkaar, ook al
draaien ze op dezelfde relay.

## Lokaal / over LAN

```
npm install
npm start
```

De server luistert op poort 8080. Voor spelers op hetzelfde wifi-netwerk:

1. Zoek het lokale IP-adres van de laptop die de server draait:
   - macOS/Linux: `ifconfig` of `ip a` → iets als `192.168.1.23`
   - Windows: `ipconfig` → "IPv4-adres"
2. In de Wizards-app vul je (in Test-arena én/of Wizard Council) in:
   - Server-adres: `ws://192.168.1.23:8080` (dit IP, niet `localhost`, op het
     apparaat dat níet de server draait)
   - Roomcode: iets identieks voor wie samen moet zijn, bv. `VUUR12` voor de
     arena of `COUNCIL-VUUR12` voor de voice-chat (gebruik het 🎲-knopje)
3. Beide op "Verbind" klikken. Voor de arena: zodra de status "tegenstander
   aanwezig" toont, kan één speler op "Start test-arena" klikken. Voor de
   council-voicechat: zodra er een tweede kaartje verschijnt, hoor je elkaar.

Draait de server op dezelfde laptop als waar je zelf op speelt? Dan mag dat
apparaat gewoon `ws://localhost:8080` gebruiken.

## Over internet (gratis hosting, bv. Render)

1. Zet deze map (`server.js`, `package.json`) in een eigen GitHub-repo.
2. Op [render.com](https://render.com): "New Web Service" → koppel die repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Free tier is ruim voldoende voor dit doel.
3. Render geeft een URL zoals `https://wizards-relay-xxxx.onrender.com`.
   Gebruik in de app **`wss://`** in plaats van `https://`:
   `wss://wizards-relay-xxxx.onrender.com`
4. Iedereen vult die URL + de juiste roomcode in en klikt "Verbind".

Let op: op het gratis Render-tier gaat de server na 15 minuten zonder
verkeer "slapen" — de eerste verbinding kan dan 30–60 seconden duren voor
hij reageert. Daarna gaat het vlot.

Let ook op bij de voice-chat: dit gebruikt enkel een publieke STUN-server
(Google's `stun.l.google.com:19302`), geen TURN-server. Op de meeste thuis-
en mobiele netwerken werkt dat gewoon, maar op sommige restrictieve
netwerken (bv. bedrijfs-wifi met symmetrische NAT) lukt een rechtstreekse
peer-to-peer verbinding soms niet — je ziet dan iemand blijven hangen op
"verbinden...". Een (gratis) TURN-server (bv. via metered.ca of Twilio) is
in dat geval de volgende stap, in te vullen in `ICE_SERVERS` in
`council.html`.

## Protocol (voor de volledigheid)

### Arena-sync

```
client -> server:  { "type": "join", "room": "VUUR12" }
client -> server:  { "type": "arena-state", "arena": { ... } }
server -> client:  { "type": "arena-state", "arena": { ... } }   // doorgestuurd, of laatst bekende stand bij join
server -> client:  { "type": "peer-count", "count": 2 }
```

De server leest de inhoud van `arena` niet — dat is en blijft puur een zaak
van de HTML-client.

### Peer-toekenning en aanwezigheid (gedeeld door arena én council)

```
client -> server:  { "type": "join", "room": "COUNCIL-VUUR12" }
server -> client:  { "type": "joined", "peerId": "p_ab12cd34ef", "peers": ["p_xyz...", ...] }
                                        // eigen peer-id + lijst van reeds
                                        // aanwezige peers in deze room
server -> bestaande peers:
                   { "type": "peer-joined", "peerId": "p_ab12cd34ef" }
                                        // er is iemand nieuw bijgekomen
server -> overige peers:
                   { "type": "peer-left", "peerId": "p_ab12cd34ef" }
                                        // bij vertrek (disconnect/close) —
                                        // ruim je WebRTC-verbinding met die
                                        // peer op
```

`peerId` wordt toegekend bij het opzetten van de WebSocket-connectie en
blijft geldig zolang die connectie openstaat, over eventuele rooms heen.

### WebRTC-signalering (council voice-chat)

```
client -> server:  { "type": "webrtc-offer",  "to": "p_xyz...", "sdp": { ... } }
client -> server:  { "type": "webrtc-answer", "to": "p_xyz...", "sdp": { ... } }
client -> server:  { "type": "webrtc-ice",    "to": "p_xyz...", "candidate": { ... } }

server -> client:  { "type": "webrtc-offer"/"webrtc-answer"/"webrtc-ice",
                      "from": "p_ab12cd34ef", ... }
```

De server routeert deze berichten enkel op basis van het `to`-veld naar de
bijhorende peer-id (los van welke room die peer in zit) en zet zelf het
`from`-veld — de inhoud (`sdp`/`candidate`) wordt niet gelezen of aangepast.
Zo initieert bij het joinen steeds de nieuw binnenkomende peer de offer naar
elke reeds aanwezige peer (via de `peers`-lijst uit de `joined`-bevestiging),
en antwoorden de anderen zodra hun offer binnenkomt.

### Tekstchat binnen een room (council-zalen)

```
client -> server:  { "type": "room-chat", "text": "<bericht>" }
server -> client:  { "type": "room-chat-history", "messages": [{peerId, name, text, time}, ...] }
                                        // meteen na "joined", enkel als de
                                        // room al eerdere berichten heeft
server -> client:  { "type": "room-chat", "peerId": "...", "name": "...", "text": "...", "time": 172... }
                                        // naar IEDEREEN in de room, ook de
                                        // afzender zelf — de client toont enkel
                                        // wat effectief terugkomt, geen eigen
                                        // optimistische update
```

De server bewaart per room een kleine buffer (laatste 200 berichten, puur
in-memory, cfr. `lastState` voor arena-state) om laat-binnenkomers het lopende
gesprek te tonen — verdwijnt zodra de room leegloopt. Dit is bewust los van
de Drive-json (die wordt enkel bij inloggen opgehaald, veel te traag voor een
levendig gesprek).
