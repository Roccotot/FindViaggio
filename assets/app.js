/* =========================================================
   FindViaggio — logica dell'applicazione
   Rocco Totaro
   ---------------------------------------------------------
   Geocodifica: Nominatim (OpenStreetMap)
   Percorso stradale: OSRM
   Nessuna chiave API, nessun dato inviato a terze parti
   oltre alle due richieste di calcolo.
   ========================================================= */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /* ---------- parametri delle stime ---------- */

  const CAR = {
    consumoLitri100: 7,          // L / 100 km
    prezzoCarburante: 1.85,      // € / L
    pedaggioKm: 0.08,            // € / km oltre la soglia
    sogliaPedaggio: 100,         // km
  };
  const CAR_EUR_KM = (CAR.consumoLitri100 / 100) * CAR.prezzoCarburante; // ≈ 0.13

  const TRAIN = {
    fattoreTratta: 0.95,         // la ferrovia è mediamente più diretta della strada
    minimo: 9,
    scaglioni: [                 // [km massimi, € / km, km/h medi]
      [100, 0.16, 60],
      [300, 0.12, 95],
      [Infinity, 0.09, 130],
    ],
  };

  const BUS = { eurKm: 0.05, minimo: 9, kmh: 65 };

  const PLANE = {
    eurKm: 0.08,
    minimo: 35,
    kmh: 700,
    overheadMin: 180,            // check-in, controlli, trasferimenti da/per aeroporto
    kmMinimiSensati: 300,
  };

  /* ---------- utilità ---------- */

  const toRad = (x) => (x * Math.PI) / 180;

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const fmtKm = (v) => (v >= 100 ? Math.round(v).toLocaleString('it-IT') : v.toFixed(1));

  const fmtMin = (v) => {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  const fmtEur = (v) => `€ ${Math.round(v).toLocaleString('it-IT')}`;

  const fmtDate = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

  const isoDay = (d) => {
    const c = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return c.toISOString().slice(0, 10);
  };

  const nightsBetween = (a, b) =>
    Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- tema ---------- */

  function initTheme() {
    const btn = $('theme-toggle');
    const stored = localStorage.getItem('fv-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.dataset.theme = stored;
    }
    const label = () => {
      const dark =
        document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme &&
          matchMedia('(prefers-color-scheme: dark)').matches);
      btn.setAttribute('aria-label', dark ? 'Passa al tema chiaro' : 'Passa al tema scuro');
      btn.querySelector('.theme-label').textContent = dark ? 'Chiaro' : 'Scuro';
    };
    label();
    btn.addEventListener('click', () => {
      const dark =
        document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme &&
          matchMedia('(prefers-color-scheme: dark)').matches);
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('fv-theme', next);
      label();
    });
  }

  /* ---------- servizi esterni ---------- */

  const geoCache = new Map();

  async function geocode(query) {
    const key = query.trim().toLowerCase();
    if (geoCache.has(key)) return geoCache.get(key);

    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=it&q=' +
      encodeURIComponent(query);

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('il servizio di geolocalizzazione non risponde');

    const data = await res.json();
    if (!data.length) throw new Error(`nessun risultato per "${query}"`);

    const place = {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      name: data[0].display_name,
      short: data[0].name || query,
    };
    geoCache.set(key, place);
    return place;
  }

  async function osrmRoute(a, b) {
    const url =
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}` +
      '?overview=false&alternatives=false';
    const res = await fetch(url);
    if (!res.ok) throw new Error('routing non disponibile');
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error('nessuna rotta stradale trovata');
    return { km: data.routes[0].distance / 1000, minutes: data.routes[0].duration / 60 };
  }

  /* ---------- link agli alloggi ---------- */

  function stayLinks({ zona, checkin, checkout, ospiti, budget }) {
    const notti = Math.max(1, nightsBetween(checkin, checkout));
    const q = encodeURIComponent(zona);

    const booking = new URL('https://www.booking.com/searchresults.it.html');
    booking.searchParams.set('ss', zona);
    booking.searchParams.set('checkin', checkin);
    booking.searchParams.set('checkout', checkout);
    booking.searchParams.set('group_adults', ospiti);
    booking.searchParams.set('no_rooms', '1');
    booking.searchParams.set('group_children', '0');
    if (budget) booking.searchParams.set('nflt', `price=EUR-min-${budget}-1`);

    const airbnb = new URL(`https://www.airbnb.it/s/${q}/homes`);
    airbnb.searchParams.set('checkin', checkin);
    airbnb.searchParams.set('checkout', checkout);
    airbnb.searchParams.set('adults', ospiti);
    if (budget) airbnb.searchParams.set('price_max', budget);

    const agoda = new URL('https://www.agoda.com/search');
    agoda.searchParams.set('textToSearch', zona);
    agoda.searchParams.set('checkIn', checkin);
    agoda.searchParams.set('los', notti);
    agoda.searchParams.set('adults', ospiti);
    agoda.searchParams.set('rooms', '1');

    const hostel = new URL('https://www.hostelworld.com/search');
    hostel.searchParams.set('search_keywords', zona);
    hostel.searchParams.set('date_from', checkin);
    hostel.searchParams.set('date_to', checkout);
    hostel.searchParams.set('number_of_guests', ospiti);

    return [
      { name: 'Booking', meta: 'Hotel · B&B · Appartamenti', url: booking.toString() },
      { name: 'Airbnb', meta: 'Case · Stanze · Soggiorni lunghi', url: airbnb.toString() },
      { name: 'Google Hotels', meta: 'Confronto prezzi e mappa', url: `https://www.google.com/travel/search?q=${q}` },
      { name: 'Agoda', meta: 'Offerte last minute', url: agoda.toString() },
      { name: 'Trivago', meta: 'Metamotore multi-portale', url: `https://www.trivago.it/it/srl?search=${q}` },
      { name: 'Hostelworld', meta: 'Ostelli e camerate', url: hostel.toString() },
    ];
  }

  /* ---------- calcolo dei mezzi ---------- */

  function scaglioneTreno(km) {
    return TRAIN.scaglioni.find(([max]) => km <= max);
  }

  function buildModes({ roadKm, roadMin, airKm, ospiti, personeAuto, origine, zona, dateGo }) {
    const modes = [];

    /* --- auto --- */
    const carburante = roadKm * CAR_EUR_KM;
    const pedaggi = roadKm > CAR.sogliaPedaggio ? roadKm * CAR.pedaggioKm : 0;
    const trattaAuto = carburante + pedaggi;
    modes.push({
      id: 'car',
      emoji: '🚗',
      name: 'Auto',
      km: roadKm,
      minutes: roadMin,
      gruppoAR: trattaAuto * 2,
      personaAR: (trattaAuto * 2) / personeAuto,
      personeLabel: `in ${personeAuto} ${personeAuto === 1 ? 'persona' : 'persone'}`,
      note:
        `Carburante ${fmtEur(carburante * 2)} A/R` +
        (pedaggi ? ` + pedaggi stimati ${fmtEur(pedaggi * 2)}` : ' (nessun pedaggio stimato)') +
        `. Consumo ${CAR.consumoLitri100} L/100 km a ${CAR.prezzoCarburante.toFixed(2)} €/L.`,
      links: [
        {
          label: 'Itinerario su Google Maps',
          url:
            'https://www.google.com/maps/dir/?api=1&origin=' +
            encodeURIComponent(origine) +
            '&destination=' +
            encodeURIComponent(zona) +
            '&travelmode=driving',
        },
      ],
    });

    /* --- treno --- */
    const kmTreno = roadKm * TRAIN.fattoreTratta;
    const [, eurKmTreno, kmhTreno] = scaglioneTreno(kmTreno);
    const trattaTreno = Math.max(TRAIN.minimo, kmTreno * eurKmTreno);
    modes.push({
      id: 'train',
      emoji: '🚆',
      name: 'Treno',
      km: kmTreno,
      minutes: (kmTreno / kmhTreno) * 60,
      gruppoAR: trattaTreno * 2 * ospiti,
      personaAR: trattaTreno * 2,
      personeLabel: `${ospiti} ${ospiti === 1 ? 'biglietto' : 'biglietti'}`,
      note: `Tariffa media ${eurKmTreno.toFixed(2)} €/km su ${Math.round(kmTreno)} km, velocità media ${kmhTreno} km/h. Prenotando in anticipo si scende parecchio.`,
      links: [
        { label: 'Trenitalia', url: 'https://www.trenitalia.com/' },
        { label: 'Italo', url: 'https://www.italotreno.com/it' },
        { label: 'Omio', url: 'https://www.omio.it/' },
      ],
    });

    /* --- bus --- */
    const trattaBus = Math.max(BUS.minimo, roadKm * BUS.eurKm);
    modes.push({
      id: 'bus',
      emoji: '🚌',
      name: 'Bus',
      km: roadKm,
      minutes: (roadKm / BUS.kmh) * 60,
      gruppoAR: trattaBus * 2 * ospiti,
      personaAR: trattaBus * 2,
      personeLabel: `${ospiti} ${ospiti === 1 ? 'biglietto' : 'biglietti'}`,
      note: `Tariffa media ${BUS.eurKm.toFixed(2)} €/km, velocità media ${BUS.kmh} km/h soste incluse.`,
      links: [
        { label: 'FlixBus', url: 'https://www.flixbus.it/' },
        { label: 'BlaBlaCar', url: 'https://www.blablacar.it/' },
      ],
    });

    /* --- aereo --- */
    const trattaAereo = Math.max(PLANE.minimo, airKm * PLANE.eurKm);
    const shortHop = airKm < PLANE.kmMinimiSensati;
    modes.push({
      id: 'plane',
      emoji: '✈️',
      name: 'Aereo',
      km: airKm,
      minutes: (airKm / PLANE.kmh) * 60 + PLANE.overheadMin,
      gruppoAR: trattaAereo * 2 * ospiti,
      personaAR: trattaAereo * 2,
      personeLabel: `${ospiti} ${ospiti === 1 ? 'biglietto' : 'biglietti'}`,
      disattivato: shortHop,
      note: shortHop
        ? `Sotto i ${PLANE.kmMinimiSensati} km in linea d'aria l'aereo raramente conviene: fra check-in e trasferimenti si perde più tempo di quanto se ne guadagni.`
        : `Tariffa low-cost ${PLANE.eurKm.toFixed(2)} €/km più ${PLANE.overheadMin / 60} h fra check-in, controlli e trasferimenti da e per l'aeroporto.`,
      links: [
        {
          label: 'Google Flights',
          url:
            'https://www.google.com/travel/flights?q=' +
            encodeURIComponent(`Voli da ${origine} a ${zona} il ${dateGo}`),
        },
        { label: 'Skyscanner', url: 'https://www.skyscanner.it/trasporti/voli/' },
      ],
    });

    /* --- badge: più economico / più veloce fra le opzioni sensate --- */
    const validi = modes.filter((m) => !m.disattivato);
    const cheap = validi.reduce((a, b) => (b.gruppoAR < a.gruppoAR ? b : a), validi[0]);
    const fast = validi.reduce((a, b) => (b.minutes < a.minutes ? b : a), validi[0]);
    cheap.piuEconomico = true;
    fast.piuVeloce = true;

    return { modes, cheap, fast };
  }

  /* ---------- rendering ---------- */

  function renderStay(links) {
    $('stay-links').innerHTML = links
      .map(
        (l) => `
      <a class="stay-link" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="stay-arrow" aria-hidden="true">↗</span>
        <div class="stay-name">${esc(l.name)}</div>
        <div class="stay-meta">${l.meta}</div>
      </a>`
      )
      .join('');
  }

  function renderModes(modes) {
    $('modes').innerHTML = modes
      .map((m) => {
        const badges = [
          m.piuEconomico ? '<span class="badge badge-cheap">Più economico</span>' : '',
          m.piuVeloce ? '<span class="badge badge-fast">Più veloce</span>' : '',
          m.disattivato ? '<span class="badge badge-warn">Tratta breve</span>' : '',
        ].join('');

        const links = m.links
          .map(
            (l) =>
              `<a class="mode-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(
                l.label
              )} ↗</a>`
          )
          .join('');

        return `
      <article class="mode-card${m.piuEconomico ? ' is-best' : ''}${m.disattivato ? ' is-off' : ''}">
        <div class="mode-head">
          <span class="mode-emoji" aria-hidden="true">${m.emoji}</span>
          <h3 class="mode-name">${m.name}</h3>
        </div>
        <div class="badges">${badges}</div>
        <div class="mode-price">${fmtEur(m.gruppoAR)} <small>A/R</small></div>
        <div class="mode-price-sub">${fmtEur(m.personaAR)} a persona · ${esc(m.personeLabel)}</div>
        <div class="mode-stats">
          <div><span class="k">Distanza</span><span class="v">${fmtKm(m.km)} km</span></div>
          <div><span class="k">Durata</span><span class="v">${fmtMin(m.minutes)}</span></div>
        </div>
        <p class="mode-note">${esc(m.note)}</p>
        <div class="mode-links">${links}</div>
      </article>`;
      })
      .join('');
  }

  function renderSummary({ checkin, checkout, ospiti, budget, cheap }) {
    const notti = nightsBetween(checkin, checkout);
    const alloggio = budget ? budget * notti : null;
    const totale = alloggio !== null ? alloggio + cheap.gruppoAR : null;

    const items = [
      ['Soggiorno', `${notti} ${notti === 1 ? 'notte' : 'notti'}`],
      ['Date', `${fmtDate(checkin)} → ${fmtDate(checkout)}`, 'wide'],
      ['Ospiti', `${ospiti}`],
      ['Viaggio A/R', `${fmtEur(cheap.gruppoAR)}`],
    ];
    if (alloggio !== null) items.push(['Alloggio stimato', fmtEur(alloggio)]);

    let html = items
      .map(
        ([k, v, cls]) =>
          `<div class="summary-item${cls ? ' ' + cls : ''}"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join('');

    if (totale !== null) {
      html += `<div class="summary-item accent"><span class="k">Totale indicativo</span><span class="v">${fmtEur(
        totale
      )}</span></div>`;
    }

    $('summary').innerHTML = html;
  }

  /* ---------- stato del modulo ---------- */

  function readForm() {
    return {
      zona: $('zona').value.trim(),
      checkin: $('checkin').value,
      checkout: $('checkout').value,
      ospiti: Math.max(1, parseInt($('ospiti').value, 10) || 1),
      budget: $('budget').value ? Math.max(0, parseInt($('budget').value, 10)) : null,
      origine: $('origine').value.trim(),
      personeAuto: parseInt($('persone-auto').value, 10) || 1,
    };
  }

  function showError(msg) {
    const box = $('form-error');
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = msg;
  }

  function initDates() {
    const oggi = new Date();
    const dom = new Date(oggi); dom.setDate(dom.getDate() + 1);
    const dopo = new Date(oggi); dopo.setDate(dopo.getDate() + 3);
    $('checkin').min = isoDay(oggi);
    $('checkout').min = isoDay(dom);
    if (!$('checkin').value) $('checkin').value = isoDay(dom);
    if (!$('checkout').value) $('checkout').value = isoDay(dopo);
    $('checkin').addEventListener('change', () => {
      const ci = $('checkin').value;
      if (!ci) return;
      const min = new Date(`${ci}T12:00:00`);
      min.setDate(min.getDate() + 1);
      $('checkout').min = isoDay(min);
      if ($('checkout').value && $('checkout').value <= ci) $('checkout').value = isoDay(min);
    });
  }

  function restoreState() {
    const params = new URLSearchParams(location.search);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('fv-last') || '{}'); } catch { /* ignora */ }

    const pick = (k) => params.get(k) ?? saved[k] ?? '';
    const map = {
      zona: 'zona', origine: 'origine', checkin: 'checkin',
      checkout: 'checkout', ospiti: 'ospiti', budget: 'budget',
    };
    for (const [key, id] of Object.entries(map)) {
      const v = pick(key);
      if (v) $(id).value = v;
    }
    const auto = params.get('auto') || saved.personeAuto || '';
    if (auto) $('persone-auto').value = auto;

    return params.has('zona') && params.has('origine');
  }

  function saveState(s) {
    try { localStorage.setItem('fv-last', JSON.stringify(s)); } catch { /* ignora */ }
  }

  function searchQuery(s) {
    const p = new URLSearchParams({
      zona: s.zona,
      origine: s.origine,
      checkin: s.checkin,
      checkout: s.checkout,
      ospiti: String(s.ospiti),
      auto: String(s.personeAuto),
    });
    if (s.budget) p.set('budget', String(s.budget));
    return p.toString();
  }

  /* ---------- ricerca ---------- */

  async function runSearch() {
    const s = readForm();
    showError('');

    if (!s.zona || !s.origine) {
      showError('Compila destinazione e partenza per continuare.');
      (!s.zona ? $('zona') : $('origine')).focus();
      return;
    }
    if (!s.checkin || !s.checkout || s.checkout <= s.checkin) {
      showError('Il check-out deve essere successivo al check-in.');
      $('checkout').focus();
      return;
    }

    saveState(s);
    history.replaceState(null, '', `?${searchQuery(s)}`);

    const results = $('risultati');
    const btn = document.querySelector('#search-form .btn-primary');
    results.hidden = false;
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Calcolo in corso…';

    renderStay(stayLinks(s));
    $('summary').innerHTML = '';
    $('modes').innerHTML = '<div class="skeleton-card"></div>'.repeat(4);
    $('route-note').textContent = 'Sto localizzando le due città e calcolando il percorso…';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const partenza = await geocode(s.origine);
      const arrivo = await geocode(s.zona);

      const airKm = haversineKm(partenza, arrivo);
      let roadKm, roadMin, stimato = false;

      try {
        const r = await osrmRoute(partenza, arrivo);
        roadKm = r.km;
        roadMin = r.minutes;
      } catch {
        roadKm = airKm * 1.3;          // fattore di tortuosità tipico della rete stradale
        roadMin = (roadKm / 85) * 60;
        stimato = true;
      }

      const { modes, cheap } = buildModes({
        roadKm, roadMin, airKm,
        ospiti: s.ospiti,
        personeAuto: s.personeAuto,
        origine: s.origine,
        zona: s.zona,
        dateGo: s.checkin,
      });

      renderModes(modes);
      renderSummary({ ...s, cheap });

      $('route-note').textContent =
        `Da ${partenza.short} a ${arrivo.short} · ${fmtKm(roadKm)} km su strada, ` +
        `${fmtKm(airKm)} km in linea d'aria` +
        (stimato ? ' · percorso stradale stimato, servizio di routing non raggiungibile.' : '.');
    } catch (err) {
      $('modes').innerHTML =
        `<p class="state-msg is-error">Non è stato possibile calcolare il viaggio: ${esc(
          err.message
        )}. Prova a scrivere le località in modo più preciso, per esempio “Bari, Italia”.</p>`;
      $('route-note').textContent = 'Confronto tra i mezzi non disponibile.';
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Cerca viaggio';
    }
  }

  /* ---------- avvio ---------- */

  function init() {
    initTheme();
    initDates();
    $('foot-year').textContent = new Date().getFullYear();

    const fromUrl = restoreState();

    $('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      runSearch();
    });

    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $('zona').value = chip.dataset.dest;
        $('zona').focus();
      });
    });

    $('reset-btn').addEventListener('click', () => {
      setTimeout(() => {
        $('risultati').hidden = true;
        showError('');
        initDates();
        history.replaceState(null, '', location.pathname);
      }, 0);
    });

    $('share-btn').addEventListener('click', async () => {
      const s = readForm();
      const url = `${location.origin}${location.pathname}?${searchQuery(s)}`;
      const btn = $('share-btn');
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = 'Link copiato ✓';
      } catch {
        history.replaceState(null, '', `?${searchQuery(s)}`);
        btn.textContent = 'Link nella barra ✓';
      }
      setTimeout(() => { btn.textContent = 'Copia link ricerca'; }, 2200);
    });

    if (fromUrl) runSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
