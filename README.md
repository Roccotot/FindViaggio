# FindViaggio

**Trova dove dormire e scopri quanto costa arrivarci.**

FindViaggio è una pagina web statica che parte da un unico modulo — destinazione, date,
ospiti e città di partenza — e restituisce due cose insieme:

1. **Dove dormire**: le ricerche già pronte su Booking, Airbnb, Google Hotels, Agoda,
   Trivago e Hostelworld, con date, ospiti ed eventuale budget massimo già impostati.
2. **Come arrivarci**: il confronto fianco a fianco fra **auto, treno, bus e aereo**, con
   distanza, durata e costo stimato di andata e ritorno, per il gruppo e a persona.

Niente account, niente cookie, niente backend: tutto gira nel browser.

## Funzionalità

- **Prezzo del carburante di oggi**, mediana della provincia di partenza dagli open data MIMIT
- Confronto dei quattro mezzi con badge automatici *più economico* e *più veloce*
- Costo dell'auto diviso fra i passeggeri, biglietti moltiplicati per il numero di ospiti
- Totale indicativo del viaggio (alloggio + trasporto) quando indichi un budget per notte
- Ricerche condivisibili: ogni ricerca ha il proprio link, copiabile con un click
- L'ultima ricerca viene ricordata in locale
- Tema chiaro/scuro, layout responsive, navigazione da tastiera

## Come sono calcolate le stime

| Mezzo | Distanza | Durata | Costo |
|---|---|---|---|
| Auto | percorso stradale OSRM | tempi OSRM | **prezzo carburante di oggi** × consumo + 0,08 €/km di pedaggi oltre i 100 km |
| Treno | tratta stradale × 0,95 | 60 / 95 / 130 km/h per fascia | 0,16 → 0,09 €/km a scaglioni, minimo 9 € |
| Bus | percorso stradale | 65 km/h | 0,05 €/km, minimo 9 € |
| Aereo | linea d'aria | 700 km/h + 3 h di trasferimenti | 0,08 €/km, minimo 35 € |

Tranne il carburante, sono **stime indicative** utili a confrontare le alternative, non prezzi
reali: orari, disponibilità e tariffe vanno sempre verificati sui siti dei vettori.

## Prezzi carburante in tempo reale

Il costo dell'auto non usa un coefficiente fisso: parte dal **prezzo effettivo di oggi**.

Ogni mattina una GitHub Action scarica gli open data
[MIMIT — Osservaprezzi carburanti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti)
(circa 60.000 rilevazioni comunicate dai gestori), calcola la **mediana self-service per provincia
e a livello nazionale** e committa `data/carburanti.json`. La pagina lo legge dalla propria origine:
nessuna chiamata a terzi dal browser, nessun problema di CORS, nessuna chiave API.

La provincia di partenza viene ricavata dal campo `ISO3166-2-lvl6` restituito da Nominatim
(`IT-PO`, `IT-BA`, …): se disponibile si usa la mediana provinciale, altrimenti quella nazionale.

L'utente sceglie **alimentazione** (benzina, gasolio, GPL, metano) e **consumo** in L/100 km
(kg/100 km per il metano), quindi il costo è quello della sua auto, non di un'auto media.

Se il file manca o ha più di 21 giorni, la pagina ripiega su prezzi di riserva **dichiarandolo
esplicitamente** nell'interfaccia («stima statica»): non mostra mai un dato vecchio spacciandolo
per aggiornato.

```bash
node scripts/aggiorna-prezzi.mjs --dry-run   # stampa le mediane senza scrivere nulla
node scripts/aggiorna-prezzi.mjs             # scrive data/carburanti.json
```

Lo script non ha dipendenze (richiede Node ≥ 20), rileva da solo il separatore del CSV — che MIMIT
ha già cambiato in passato — scarta i prezzi implausibili e le varianti premium, e **fallisce senza
scrivere nulla** se il tracciato cambia o se le rilevazioni valide sono troppo poche: meglio un dato
vecchio e dichiarato che uno nuovo e sbagliato.

> Nota: GitHub esegue gli scheduled workflow solo sul branch di default. Finché il branch non è
> unito in `main` l'aggiornamento va lanciato a mano da **Actions → Aggiorna prezzi carburanti →
> Run workflow**. Il workflow ha bisogno del permesso di scrittura sui contenuti
> (*Settings → Actions → General → Workflow permissions → Read and write*).

### Perché solo il carburante

Treni e voli non hanno un equivalente utilizzabile:

- **Trenitalia e Italo non espongono API pubbliche.** Esistono scraper non ufficiali, ma sono lenti,
  si rompono a ogni restyling del sito e stanno in una zona grigia rispetto ai termini d'uso.
- **Amadeus Self-Service**, l'unica fonte voli con un piano gratuito sensato, **ha chiuso il free
  tier a luglio 2026**. Le alternative (Skyscanner, Kiwi, Rome2Rio) sono riservate ai partner
  commerciali.
- Qualunque API con chiave, inoltre, non può stare in una pagina statica senza esporre la chiave:
  servirebbe un proxy serverless.

Per questo treno, bus e aereo restano stime dichiarate come tali, con i link alle ricerche reali.

## Struttura

```
index.html                            pagina unica
assets/styles.css                     temi, layout, componenti
assets/app.js                         geocodifica, percorso, stime e rendering
assets/favicon.svg                    icona
scripts/aggiorna-prezzi.mjs           elaborazione degli open data MIMIT
.github/workflows/aggiorna-prezzi.yml aggiornamento giornaliero automatico
data/carburanti.json                  prezzi del giorno (generato, non modificare a mano)
```

## Come si usa in locale

Basta aprire `index.html` nel browser. Per evitare limiti dovuti al protocollo `file://`
si può servire la cartella con un server statico qualsiasi:

```bash
python3 -m http.server 8000
```

e aprire <http://localhost:8000>.

## Dati e servizi

- Geocodifica: [Nominatim / OpenStreetMap](https://www.openstreetmap.org/copyright)
- Percorsi stradali: [OSRM](https://project-osrm.org/)
- Prezzi carburante: [MIMIT — Osservaprezzi carburanti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti)

Entrambi sono servizi pubblici gratuiti soggetti a limiti d'uso: per un traffico elevato
conviene passare a un'istanza propria o a un servizio con chiave API.

## Autore

Ideato e realizzato da **Rocco Totaro**.
