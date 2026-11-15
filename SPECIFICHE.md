# Rassegna: specifiche della prima versione

Documento di incarico per Claude Code. Il nome "Rassegna" è provvisorio.
Data: 15 novembre 2026.

## 1. Scopo

App personale, per un solo utente, che aggrega notizie e letture di approfondimento da fonti scelte, con un'interfaccia pulita e non affollata. L'app mostra titolo, testata, ora e un breve estratto, e rimanda sempre all'articolo originale.

## 2. Che cosa resta fuori dalla prima versione

- Intelligenza artificiale (sintesi, ordinamento per rilevanza, raggruppamento dei doppioni per argomento): è la tappa successiva, da affrontare solo quando il feed di base funziona.
- Account, accesso con password, uso da parte di più persone.
- Notifiche.
- Lettura dell'articolo completo dentro l'app.
- App nativa per gli store.

## 3. Struttura dei contenuti

Sette sezioni, in quest'ordine:

1. Attualità
2. Politica
3. Geopolitica
4. Mercati
5. Tecnologia
6. Farmaceutico
7. Orologeria

Mercati e Geopolitica sono le sezioni più importanti per l'utente.

Due livelli, distinti per fonte (campo `livello` in `fonti.json`):

- **Notizie**: fatti e aggiornamenti, feed rapido.
- **Letture**: analisi, opinioni e saggi. L'utente vuole letture che aiutino a formarsi un giudizio critico, quindi con fonti di orientamento diverso.

## 4. Schermate

Quattro voci nella barra in basso:

- **Notizie**: schede orizzontali in alto ("Tutte" più le sezioni attive). Elenco in ordine cronologico inverso. Solo la prima voce mostra l'immagine, se la fonte la fornisce.
- **Letture**: elenco unico di tutte le sezioni attive. Ogni voce mostra tipo e sezione (per esempio "Analisi · Geopolitica"), testata e tempo di lettura stimato.
- **Salvati**: voci segnate con il segnalibro, da entrambi i livelli.
- **Sezioni**: un interruttore per ogni sezione. Una sezione spenta sparisce da schede, Notizie e Letture.

Ogni voce: etichetta di sezione, testata, tempo trascorso, titolo, una riga di estratto, segnalibro. Il tocco sul titolo apre l'articolo originale in una nuova scheda.

Stati vuoti da prevedere: nessun articolo salvato, nessuna sezione attiva, aggiornamento non riuscito (mostrare l'ora dell'ultimo aggiornamento valido).

## 5. Grafica

Riprodurre la demo approvata dall'utente (un'unica schermata da telefono, 390 px di larghezza di riferimento). Valori:

| Elemento | Valore |
| --- | --- |
| Fondo | `#F7F2E9` |
| Testo principale | `#2B2622` |
| Testo secondario | `#6B6157` |
| Linee di separazione | `#E6DECF` |
| Riquadro immagine vuoto | `#ECE4D5` |
| Accento (etichette, scheda attiva, segnalibro, interruttori) | `#A04A2E` |
| Interruttore spento | `#9A9084` |

- Caratteri: Newsreader (peso 500 e 600) per nome dell'app e titoli; Inter (400, 500, 600) per tutto il resto.
- Dimensioni: nome dell'app 30 px; titolo di apertura 26 px; titoli 20 px; estratto 14 px; riga di testata e ora 12 px; etichetta di sezione 11 px, maiuscola, spaziatura 0,06 em.
- Voci separate da una linea sottile, senza riquadri né ombre. Margine laterale 24 px.
- Aree toccabili di almeno 44 px. Contrasto del testo almeno 4,5:1.
- Nessuna immagine oltre a quella di apertura. Nessun elemento decorativo.
- Deve funzionare bene anche su schermo largo: colonna centrale di larghezza massima intorno a 680 px.

## 6. Architettura proposta

Da confermare con l'utente prima di scrivere codice, con costi e alternative:

- **Web app installabile sulla schermata home** (PWA), unica per telefono e computer.
- **Lettura dei feed lato server**: una funzione pianificata legge i feed ogni 15 o 30 minuti e produce un file JSON unico. Il browser non legge i feed direttamente.
- **Hosting**: un servizio con sito statico e funzioni pianificate, a costo nullo o minimo per un uso personale. Proporre due opzioni all'utente.
- **Dati dell'utente** (salvati, sezioni attive): solo nel browser, senza server.

## 7. Regole di lettura dei feed

- Fonti in `fonti.json`. Leggere solo quelle con `stato` uguale a `verificato`. Le fonti `da_provare` vanno riprovate dall'hosting; quelle con stato `escluso` non si leggono.
- Formati: RSS 2.0 e Atom. Alcuni feed non hanno descrizione o immagine: la voce si mostra comunque.
- Estratto: testo semplice, senza HTML, al massimo 200 caratteri, anche quando il feed contiene il testo completo. Il testo completo non va né mostrato né conservato.
- Immagine: da `enclosure`, `media:content` o dal primo `img` della descrizione, se presente.
- Doppioni: eliminare le voci con lo stesso indirizzo (il feed generale di AboutPharma ripete le voci delle sue sezioni; alcuni feed ripetono la stessa voce).
- Età massima: 72 ore per Notizie (così il venerdì resta visibile fino al lunedì mattina), 30 giorni per Letture.
- Tetto per fonte: di ogni fonte entrano al massimo le 20 Letture più recenti.
- Tempo di lettura delle Letture: stimato dal numero di parole quando il feed dà il testo completo, altrimenti omesso.
- Un feed che non risponde non deve bloccare gli altri: tempo massimo di attesa per feed, registro degli errori, ultimo risultato valido conservato.
- Rispettare i siti: una sola richiesta per feed a ogni ciclo, intestazione di identificazione chiara, nessun aggiramento di blocchi o di accessi a pagamento.

## 8. Modello di una voce

```json
{
  "id": "hash dell'indirizzo",
  "titolo": "",
  "estratto": "",
  "url": "",
  "testata": "",
  "sezione": "mercati",
  "livello": "notizie",
  "tipo": "analisi",
  "lingua": "it",
  "pubblicato": "2026-11-15T10:00:00Z",
  "immagine": null,
  "minuti_lettura": null
}
```

Il campo `tipo` vale solo per le Letture (analisi, opinione, saggio) e deriva dalla fonte.

## 9. Tappe di sviluppo

Ogni tappa si chiude con una prova dell'utente prima di passare alla successiva.

1. **Verifica delle fonti da provare.** Per ogni voce `da_provare` in `fonti.json`: trovare l'indirizzo del feed, aprirlo, annotare esito, numero di voci, data dell'ultima, presenza di estratto e immagine. Priorità assoluta alle fonti di Mercati (Il Sole 24 Ore per primo) e di Geopolitica. Per AboutPharma e Quotidiano Sanità servono i feed delle singole sezioni. Consegnare all'utente una tabella con gli esiti e aggiornare `fonti.json`.
2. **Lettura dei feed.** Programma che produce il JSON unico secondo le regole del punto 7. Criterio: tutte le fonti verificate lette, errori registrati, nessun doppione.
3. **Interfaccia.** Le quattro schermate con dati veri, secondo i punti 4 e 5. Criterio: confronto visivo con la demo.
4. **Pubblicazione.** Messa online, aggiornamento pianificato, installazione sulla schermata home. Criterio: l'app si apre dal telefono e si aggiorna da sola.
5. **Una settimana d'uso**, poi correzione di fonti e impaginazione.

## 10. Avvertenze

- Uso strettamente personale. Se l'app venisse aperta ad altri, prima va verificato il tema dei diritti degli editori su titoli ed estratti.
- Molte testate di analisi sono a pagamento: l'app mostra titolo ed estratto e apre l'originale, dove l'utente accede con il proprio abbonamento.
- Le fonti `da_provare` non sono state lette da chi ha preparato questo documento per limiti dello strumento usato: non è un'indicazione che il feed non esista.
