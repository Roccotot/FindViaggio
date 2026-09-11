# data/

Cartella dei dati aggiornati automaticamente. **Non modificare a mano.**

## `carburanti.json`

Generato ogni mattina dal workflow [`aggiorna-prezzi.yml`](../.github/workflows/aggiorna-prezzi.yml),
che esegue [`scripts/aggiorna-prezzi.mjs`](../scripts/aggiorna-prezzi.mjs) sugli open data
[MIMIT — Osservaprezzi carburanti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti).

Il file non è presente finché il workflow non gira per la prima volta: fino a quel momento
la pagina usa i prezzi di riserva definiti in `assets/app.js` e lo dichiara apertamente
nell'interfaccia («stima statica»).

Struttura:

```json
{
  "aggiornato": "2026-09-11",
  "fonte": "MIMIT — Osservaprezzi carburanti (open data)",
  "fonteUrl": "https://www.mimit.gov.it/...",
  "nota": "Mediana dei prezzi self-service comunicati dai gestori...",
  "rilevazioni": 61234,
  "scartate": 87,
  "nazionale": { "benzina": 1.812, "gasolio": 1.723, "gpl": 0.718, "metano": 1.401 },
  "province": {
    "AG": { "benzina": 1.829, "gasolio": 1.741, "gpl": 0.729 },
    "…":  { "…": 0 }
  }
}
```

- I prezzi sono **mediane** (non medie): un errore di digitazione di un gestore non sposta il risultato.
- Solo rilevazioni **self-service**, che sono il prezzo pagato dalla maggioranza.
- Solo i quattro carburanti base: le varianti premium (Hi-Q, Blue Diesel, Benzina speciale…) sono escluse.
- Metano in €/kg, gli altri in €/L.
- Una provincia compare solo se ha almeno 8 rilevazioni valide per quel carburante.

## Come lanciarlo a mano

```bash
node scripts/aggiorna-prezzi.mjs --dry-run   # stampa le mediane senza scrivere nulla
node scripts/aggiorna-prezzi.mjs             # scrive data/carburanti.json
```
