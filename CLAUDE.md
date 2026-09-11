# FindViaggio

Sito statico su GitHub Pages: da un unico modulo prepara le ricerche di alloggio sui
portali e confronta auto, treno, bus e aereo per distanza, durata e costo.
Autore: Rocco Totaro.

## Flusso di lavoro

**Ogni modifica richiesta va portata fino in `main`.** Non lasciare il lavoro sul branch
in attesa di approvazione: si sviluppa sul branch di lavoro, si committa, poi
fast-forward su `main` e push. È una richiesta esplicita del proprietario del repo.

- **Niente pull request** se non vengono chieste esplicitamente.
- Verificare che il deploy di Pages vada a buon fine dopo il push.
- Se una modifica tocca `scripts/aggiorna-prezzi.mjs` o il suo workflow, il push su
  `main` fa ripartire l'Action: controllare l'esito e i dati prodotti, non solo il
  colore del check.

## Struttura

```
index.html                            pagina unica
assets/styles.css  assets/app.js      stili e logica
scripts/aggiorna-prezzi.mjs           elabora gli open data MIMIT
.github/workflows/aggiorna-prezzi.yml aggiornamento giornaliero + su push
data/carburanti.json                  GENERATO, non modificare a mano
```

## Regole del progetto

- **Non inventare dati.** Il costo dell'auto usa i prezzi reali MIMIT del giorno. Se il
  listino manca o è vecchio la pagina lo dichiara («stima statica»): non mostrare mai un
  dato stimato come se fosse reale, né committare un `carburanti.json` di prova.
- Interfaccia e commenti nel codice **in italiano**.
- La pagina non ha backend, non usa cookie e non richiede chiavi API: qualunque servizio
  esterno deve funzionare dal browser senza credenziali, oppure passare dalla Action.
- Prima di pushare modifiche alla pagina, provarla davvero in Chromium (Playwright è
  disponibile): tema chiaro e scuro, larghezza 390 px, e il percorso di errore.
