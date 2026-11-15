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

`npm run feed` legge le fonti con stato `verificato` e scrive nella cartella `dati/` (non versionata):

- `feed.json`: voci pubblicate, riepilogo ed esito di ogni fonte nell'ultimo ciclo;
- `cache.json`: ultimo risultato valido di ogni fonte, usato quando un feed non risponde;
- `errori.log`: una riga per ogni lettura non riuscita.
