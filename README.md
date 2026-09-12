# Quantoviene

**Trova dove dormire e scopri quanto costa arrivarci.**

Quantoviene è una pagina web statica che parte da un unico modulo — destinazione, date,
ospiti e città di partenza — e restituisce due cose insieme:

1. **Dove dormire**: un menu a tendina con Booking, Airbnb, Google Hotels, Agoda, Trivago e
   Hostelworld; il portale scelto si apre con date, ospiti ed eventuale budget già impostati,
   e viene ricordato per la volta successiva.
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
| Auto | percorso stradale OSRM | tempi OSRM | **prezzo carburante di oggi** × consumo + pedaggi delle autostrade effettivamente percorse |
| Treno | tratta stradale × 0,95 | 60 / 95 / 130 km/h per fascia | 0,16 → 0,09 €/km a scaglioni, minimo 9 € |
| Bus | percorso stradale | 65 km/h | 0,05 €/km, minimo 9 € |
| Aereo | linea d'aria | 700 km/h + 3 h di trasferimenti | 0,08 €/km, minimo 35 € |

Tranne il carburante, sono **stime indicative** utili a confrontare le alternative, non prezzi
reali: orari, disponibilità e tariffe vanno sempre verificati sui siti dei vettori.

## Prezzi carburante in tempo reale

Il costo dell'auto non usa un coefficiente fisso: parte dal **prezzo effettivo di oggi**.

Ogni mattina una GitHub Action scarica gli open data
[MIMIT — Osservaprezzi carburanti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti)
(circa 40.000 rilevazioni valide comunicate dai gestori, 107 province coperte), calcola la
**mediana per provincia e a livello nazionale** e committa `data/carburanti.json`.
Benzina e gasolio usano il prezzo self-service; GPL e metano, che si erogano quasi sempre con
l'addetto, usano tutte le rilevazioni. La pagina lo legge dalla propria origine:
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

## Pedaggi

Non esistono in tempo reale: le tariffe le fissa un decreto e cambiano il **1° gennaio**
(+1,5% per il 2026). Nessun concessionario espone un'API pubblica, solo calcolatori web.

Quello che si può fare, e che il sito fa, è **non applicare una media a tutto il percorso**.
OSRM viene interrogato con `steps=true` e restituisce il riferimento della strada di ogni
tappa; da lì si sommano i chilometri per autostrada e si applica la tariffa giusta:

| Rete | €/km (IVA inclusa, classe A) |
|---|---|
| Rete ordinaria a pedaggio (A1, A4, A14, …) | 0,093 |
| A18 e A20, Consorzio Autostrade Siciliane | 0,048 |
| A2 Salerno–Reggio Calabria, A19, A29 | **0** |
| Raccordi, statali, provinciali, strade urbane | **0** |

La tariffa standard viene dalla media di Autostrade per l'Italia per la classe A
(0,075 €/km in pianura al netto dell'IVA), più IVA al 22% e l'aumento 2026.

Contava più di quanto sembri: circa **900 km della rete italiana sono gratuiti**. Su
Napoli → Reggio Calabria il modello vecchio inventava circa 79 € di pedaggi andata e
ritorno, quando la A2 è interamente gratuita e il costo reale è di 9 €.

Limiti dichiarati: le tariffe variano da tratta a tratta e il sito ne usa una media per
rete, quindi su percorsi lunghi lo scarto dal casello può essere del 10-20%. La A18 è
gratuita fra Siracusa e Rosolini ma a pedaggio fra Messina e Catania, e con la sola sigla
non è distinguibile: viene trattata tutta come a pedaggio. Se OSRM non restituisce i
riferimenti delle strade, il sito torna alla vecchia stima sulla distanza **e lo dichiara**.

### Perché solo il carburante è in tempo reale

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
