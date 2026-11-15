# rassegna

Aggregatore personale di notizie e letture. Le specifiche sono in `SPECIFICHE.md`, le fonti in `fonti.json`.

## Lettura dei feed (tappa 2)

```bash
npm install
```

```bash
npm run feed
```

```bash
npm test
```

`npm run feed` legge le fonti con stato `verificato` e scrive (cartelle non versionate):

- `sito/dati/feed.json`: voci pubblicate, riepilogo ed esito di ogni fonte nell'ultimo ciclo;
- `dati/cache.json`: ultimo risultato valido di ogni fonte, usato quando un feed non risponde;
- `dati/errori.log`: una riga per ogni lettura non riuscita.

## Interfaccia (tappa 3)

La cartella `sito/` contiene l'app: pagina, foglio di stile e programma, senza passaggi di compilazione. Per provarla sul proprio computer, dopo `npm run feed`:

```bash
npm run sito
```

L'app si apre all'indirizzo `http://127.0.0.1:4173/`.

## Pubblicazione (tappa 4)

Il workflow `.github/workflows/aggiorna.yml` legge i feed e pubblica la cartella `sito/` su GitHub Pages ogni 30 minuti, a ogni modifica di `main` e a richiesta dalla scheda Actions. Richiede:

- repository pubblico (con il piano gratuito Pages è disponibile solo così);
- Settings, Pages, Source: GitHub Actions.

Il workflow `prova-fonti.yml`, da avviare a mano, prova dall'ambiente di GitHub le fonti ancora `da_provare` e ne stampa l'esito.

L'app è installabile sulla schermata home (manifest e service worker in `sito/`) e si apre anche senza rete con gli ultimi dati scaricati.
