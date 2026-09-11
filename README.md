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

- Confronto dei quattro mezzi con badge automatici *più economico* e *più veloce*
- Costo dell'auto diviso fra i passeggeri, biglietti moltiplicati per il numero di ospiti
- Totale indicativo del viaggio (alloggio + trasporto) quando indichi un budget per notte
- Ricerche condivisibili: ogni ricerca ha il proprio link, copiabile con un click
- L'ultima ricerca viene ricordata in locale
- Tema chiaro/scuro, layout responsive, navigazione da tastiera

## Come sono calcolate le stime

| Mezzo | Distanza | Durata | Costo |
|---|---|---|---|
| Auto | percorso stradale OSRM | tempi OSRM | 7 L/100 km a 1,85 €/L (≈ 0,13 €/km) + 0,08 €/km di pedaggi oltre i 100 km |
| Treno | tratta stradale × 0,95 | 60 / 95 / 130 km/h per fascia | 0,16 → 0,09 €/km a scaglioni, minimo 9 € |
| Bus | percorso stradale | 65 km/h | 0,05 €/km, minimo 9 € |
| Aereo | linea d'aria | 700 km/h + 3 h di trasferimenti | 0,08 €/km, minimo 35 € |

Sono **stime indicative** utili a confrontare le alternative, non prezzi reali: orari,
disponibilità e tariffe vanno sempre verificati sui siti dei vettori.

## Struttura

```
index.html          pagina unica
assets/styles.css   temi, layout, componenti
assets/app.js       geocodifica, calcolo percorso, stime e rendering
assets/favicon.svg  icona
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

Entrambi sono servizi pubblici gratuiti soggetti a limiti d'uso: per un traffico elevato
conviene passare a un'istanza propria o a un servizio con chiave API.

## Autore

Ideato e realizzato da **Rocco Totaro**.
