#!/usr/bin/env node
/* =========================================================
   FindViaggio — aggiornamento dei prezzi dei carburanti
   ---------------------------------------------------------
   Scarica gli open data MIMIT (Osservaprezzi carburanti),
   calcola la mediana self-service per provincia e a livello
   nazionale e scrive data/carburanti.json.

   Uso:
     node scripts/aggiorna-prezzi.mjs
     node scripts/aggiorna-prezzi.mjs --dry-run
     node scripts/aggiorna-prezzi.mjs --prezzi f1.csv --impianti f2.csv

   Nessuna dipendenza: richiede Node >= 20 (fetch nativo).
   Licenza dei dati: MIMIT, riuso libero con citazione della fonte.
   ========================================================= */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/carburanti.json');

const URL_PREZZI = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';
const URL_IMPIANTI = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';

/* I quattro carburanti "base": le varianti premium (Hi-Q, Blue Diesel,
   Benzina speciale…) sono escluse perché falserebbero la mediana. */
const CARBURANTI = { benzina: 'benzina', gasolio: 'gasolio', gpl: 'gpl', metano: 'metano' };

/* Fra self e servito ballano 15-20 centesimi su benzina e gasolio, quindi lì
   teniamo solo il self: è il prezzo che paga la maggioranza. GPL e metano
   invece si erogano quasi sempre con l'addetto — filtrarli sul self li
   azzererebbe (nel primo run copriva 1 provincia su 107 e zero per il
   metano), perciò per loro si prendono tutte le rilevazioni. */
const SOLO_SELF = new Set(['benzina', 'gasolio']);

/* Limiti di plausibilità in €/L (o €/kg per il metano): fuori da qui
   si tratta quasi sempre di errori di digitazione dei gestori. */
const LIMITI = {
  benzina: [0.9, 3.5],
  gasolio: [0.9, 3.5],
  gpl: [0.3, 2.0],
  metano: [0.5, 4.0],
};

const MIN_CAMPIONI_PROVINCIA = 8;

/* ---------- parsing CSV difensivo ---------- */

/* Il tracciato MIMIT è cambiato nel tempo (il separatore è passato da
   virgola a "|" a febbraio 2026) e la prima riga è un'intestazione di
   estrazione, non i nomi dei campi. Invece di fissare un formato,
   individuiamo la riga di header e il separatore osservando il file. */
function parseCsv(testo, colonneAttese) {
  const righe = testo.split(/\r?\n/);

  const idxHeader = righe.findIndex((r) => /idimpianto/i.test(r));
  if (idxHeader === -1) {
    throw new Error('header non trovato: nessuna riga contiene "idImpianto"');
  }

  const separatore = ['|', ';', ',', '\t']
    .map((s) => ({ s, n: righe[idxHeader].split(s).length }))
    .sort((a, b) => b.n - a.n)[0];

  if (separatore.n < 2) throw new Error('separatore di campo non riconosciuto');

  const norm = (s) =>
    s.trim().toLowerCase().replace(/["']/g, '').replace(/\s+/g, '').replace(/[àáâ]/g, 'a');

  const header = righe[idxHeader].split(separatore.s).map(norm);
  const indice = {};
  for (const [chiave, alias] of Object.entries(colonneAttese)) {
    const i = header.findIndex((h) => alias.some((a) => h === a || h.startsWith(a)));
    if (i === -1) {
      throw new Error(
        `colonna "${chiave}" assente. Header letto: ${header.join(separatore.s)}`
      );
    }
    indice[chiave] = i;
  }

  const dati = [];
  for (let i = idxHeader + 1; i < righe.length; i++) {
    const riga = righe[i];
    if (!riga.trim()) continue;
    const campi = riga.split(separatore.s);
    if (campi.length < header.length) continue;
    const record = {};
    for (const [chiave, pos] of Object.entries(indice)) record[chiave] = campi[pos].trim();
    dati.push(record);
  }

  if (!dati.length) throw new Error('nessuna riga di dati dopo l\'header');
  return dati;
}

/* ---------- scarico ---------- */

async function scarica(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FindViaggio/1.0 (+https://github.com/Roccotot/FindViaggio)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const testo = await res.text();
  if (testo.length < 1000) throw new Error(`${url} → risposta troppo corta (${testo.length} B)`);
  return testo;
}

/* ---------- statistica ---------- */

function mediana(valori) {
  const v = [...valori].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const arrotonda = (n) => Math.round(n * 1000) / 1000;

function riepiloga(gruppi) {
  const out = {};
  for (const [tipo, valori] of Object.entries(gruppi)) {
    if (valori.length) out[tipo] = arrotonda(mediana(valori));
  }
  return out;
}

/* ---------- elaborazione ---------- */

function elabora(csvPrezzi, csvImpianti) {
  const impianti = parseCsv(csvImpianti, {
    id: ['idimpianto'],
    provincia: ['provincia'],
  });

  const prezzi = parseCsv(csvPrezzi, {
    id: ['idimpianto'],
    carburante: ['desccarburante', 'carburante'],
    prezzo: ['prezzo'],
    self: ['isself'],
  });

  const provinciaDi = new Map();
  for (const r of impianti) {
    const p = r.provincia.toUpperCase();
    if (/^[A-Z]{2}$/.test(p)) provinciaDi.set(r.id, p);
  }

  const nazionale = { benzina: [], gasolio: [], gpl: [], metano: [] };
  const perProvincia = new Map();
  let considerati = 0;
  let scartati = 0;

  for (const r of prezzi) {
    const tipo = CARBURANTI[r.carburante.toLowerCase()];
    if (!tipo) continue; // varianti premium e carburanti minori

    if (SOLO_SELF.has(tipo) && r.self !== '1') continue;

    const valore = parseFloat(r.prezzo.replace(',', '.'));
    const [min, max] = LIMITI[tipo];
    if (!Number.isFinite(valore) || valore < min || valore > max) {
      scartati++;
      continue;
    }

    considerati++;
    nazionale[tipo].push(valore);

    const prov = provinciaDi.get(r.id);
    if (!prov) continue;
    if (!perProvincia.has(prov)) {
      perProvincia.set(prov, { benzina: [], gasolio: [], gpl: [], metano: [] });
    }
    perProvincia.get(prov)[tipo].push(valore);
  }

  if (considerati < 5000) {
    throw new Error(`solo ${considerati} rilevazioni valide: dato sospetto, aggiornamento annullato`);
  }

  const province = {};
  for (const [prov, gruppi] of [...perProvincia].sort()) {
    const filtrati = Object.fromEntries(
      Object.entries(gruppi).filter(([, v]) => v.length >= MIN_CAMPIONI_PROVINCIA)
    );
    const r = riepiloga(filtrati);
    if (Object.keys(r).length) province[prov] = r;
  }

  return {
    aggiornato: new Date().toISOString().slice(0, 10),
    fonte: 'MIMIT — Osservaprezzi carburanti (open data)',
    fonteUrl:
      'https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti',
    nota:
      'Mediana dei prezzi comunicati dai gestori: self-service per benzina e gasolio, ' +
      'tutte le modalità per GPL e metano, che si erogano quasi sempre con addetto. ' +
      'Metano in €/kg, gli altri in €/L.',
    rilevazioni: considerati,
    scartate: scartati,
    nazionale: riepiloga(nazionale),
    province,
  };
}

/* ---------- avvio ---------- */

const argv = process.argv.slice(2);
const opt = (nome) => {
  const i = argv.indexOf(nome);
  return i !== -1 ? argv[i + 1] : null;
};

try {
  const filePrezzi = opt('--prezzi');
  const fileImpianti = opt('--impianti');

  const [csvPrezzi, csvImpianti] = filePrezzi
    ? await Promise.all([readFile(filePrezzi, 'utf8'), readFile(fileImpianti, 'utf8')])
    : await Promise.all([scarica(URL_PREZZI), scarica(URL_IMPIANTI)]);

  const dati = elabora(csvPrezzi, csvImpianti);
  const json = JSON.stringify(dati, null, 1) + '\n';

  console.log(`Rilevazioni valide : ${dati.rilevazioni.toLocaleString('it-IT')}`);
  console.log(`Scartate           : ${dati.scartate.toLocaleString('it-IT')}`);
  console.log(`Province coperte   : ${Object.keys(dati.province).length}`);
  console.log('Mediane nazionali  :', dati.nazionale);

  if (argv.includes('--dry-run')) {
    console.log('\n--dry-run: nessun file scritto.');
  } else {
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, json);
    console.log(`\nScritto ${OUT}`);
  }
} catch (err) {
  console.error(`Aggiornamento fallito: ${err.message}`);
  process.exit(1);
}
