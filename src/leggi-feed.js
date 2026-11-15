#!/usr/bin/env node
// Legge le fonti verificate di fonti.json e produce il file unico dati/feed.json.
//
// Uso: node src/leggi-feed.js [--fonti fonti.json] [--uscita dati]
//
// File prodotti nella cartella di uscita:
//   feed.json    voci pubblicate ed esito di ogni fonte nell'ultimo ciclo
//   cache.json   ultimo risultato valido di ogni fonte (solo titoli ed estratti)
//   errori.log   una riga per ogni lettura non riuscita

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { analizzaFeed, testataDi } from './analizza.js';
import { componi, entroEta } from './componi.js';

const IDENTIFICAZIONE = 'Rassegna/0.1 (aggregatore personale di feed RSS e Atom; uso privato, una richiesta per feed a ciclo)';
const ATTESA_MASSIMA = 15_000; // millisecondi, per ogni feed
const LETTURE_IN_PARALLELO = 6;
const DIMENSIONE_MASSIMA = 8 * 1024 * 1024; // byte
// Da aumentare quando cambia il modo di leggere le voci: la cache scritta da una
// versione precedente viene ignorata, così un 304 non ripropone voci lette male.
const VERSIONE_CACHE = 1;

async function leggiJson(percorso, predefinito) {
  try {
    return JSON.parse(await readFile(percorso, 'utf8'));
  } catch (errore) {
    if (errore.code === 'ENOENT' && predefinito !== undefined) return predefinito;
    throw errore;
  }
}

// Scrive su un file provvisorio e poi lo rinomina: chi legge non trova mai un file a metà.
async function scriviJson(percorso, dati) {
  const provvisorio = `${percorso}.tmp`;
  await writeFile(provvisorio, JSON.stringify(dati, null, 1) + '\n', 'utf8');
  await rename(provvisorio, percorso);
}

function decodifica(byte, tipoContenuto) {
  const daIntestazione = /charset=["']?([\w-]+)/i.exec(tipoContenuto || '')?.[1];
  const inizio = new TextDecoder('latin1').decode(byte.subarray(0, 200));
  const daDichiarazione = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(inizio)?.[1];
  for (const codifica of [daDichiarazione, daIntestazione, 'utf-8']) {
    if (!codifica) continue;
    try {
      return new TextDecoder(codifica).decode(byte);
    } catch {
      // codifica sconosciuta: si prova la successiva
    }
  }
  return new TextDecoder().decode(byte);
}

// Una sola richiesta per feed. Con ETag o Last-Modified dell'ultima lettura
// il sito può rispondere 304 senza rimandare il contenuto.
async function leggiFonte(fonte, precedente) {
  const intestazioni = {
    'User-Agent': IDENTIFICAZIONE,
    Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
  };
  if (precedente?.etag) intestazioni['If-None-Match'] = precedente.etag;
  if (precedente?.modificato) intestazioni['If-Modified-Since'] = precedente.modificato;

  const risposta = await fetch(fonte.url, {
    headers: intestazioni,
    redirect: 'follow',
    signal: AbortSignal.timeout(ATTESA_MASSIMA),
  });
  if (risposta.status === 304 && precedente) return { invariato: true };
  if (!risposta.ok) throw new Error(`risposta ${risposta.status}`);

  const byte = new Uint8Array(await risposta.arrayBuffer());
  if (byte.length > DIMENSIONE_MASSIMA) throw new Error('risposta troppo grande');
  const voci = analizzaFeed(decodifica(byte, risposta.headers.get('content-type')), fonte);
  return {
    voci,
    etag: risposta.headers.get('etag'),
    modificato: risposta.headers.get('last-modified'),
  };
}

function descriviErrore(errore) {
  if (errore.name === 'TimeoutError') return `nessuna risposta entro ${ATTESA_MASSIMA / 1000} secondi`;
  const causa = errore.cause?.code || errore.cause?.message;
  return causa ? `${errore.message} (${causa})` : errore.message;
}

async function inParallelo(elementi, limite, lavoro) {
  const esiti = new Array(elementi.length);
  let prossimo = 0;
  async function operaio() {
    while (prossimo < elementi.length) {
      const indice = prossimo++;
      esiti[indice] = await lavoro(elementi[indice], indice);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, elementi.length) }, operaio));
  return esiti;
}

async function principale() {
  const { values: opzioni } = parseArgs({
    options: {
      fonti: { type: 'string', default: 'fonti.json' },
      uscita: { type: 'string', default: 'dati' },
    },
  });
  const adesso = new Date();
  const fileFeed = join(opzioni.uscita, 'feed.json');
  const fileCache = join(opzioni.uscita, 'cache.json');
  const fileErrori = join(opzioni.uscita, 'errori.log');

  const fonti = (await leggiJson(opzioni.fonti)).fonti.filter((f) => f.stato === 'verificato' && f.url);
  await mkdir(opzioni.uscita, { recursive: true });
  const cacheSuDisco = await leggiJson(fileCache, {});
  const cache = cacheSuDisco.versione === VERSIONE_CACHE ? cacheSuDisco.fonti : {};

  const esiti = await inParallelo(fonti, LETTURE_IN_PARALLELO, async (fonte) => {
    const precedente = cache[fonte.url];
    try {
      const letta = await leggiFonte(fonte, precedente);
      if (letta.invariato) return { esito: 'invariato', voci: precedente.voci, ultimo_ok: adesso.toISOString() };
      return { esito: 'ok', ...letta, ultimo_ok: adesso.toISOString() };
    } catch (errore) {
      // Il feed non risponde o non è leggibile: resta l'ultimo risultato valido.
      return {
        esito: 'errore',
        errore: descriviErrore(errore),
        voci: precedente?.voci ?? [],
        etag: precedente?.etag,
        modificato: precedente?.modificato,
        ultimo_ok: precedente?.ultimo_ok ?? null,
      };
    }
  });

  // Le voci riprendono sezione, livello e testata dalla fonte attuale, anche
  // quando arrivano dalla cache, e la cache conserva solo quelle entro l'età massima.
  const nuovaCache = {};
  const gruppi = fonti.map((fonte, ordine) => {
    const esito = esiti[ordine];
    const voci = esito.voci.map((voce) => ({
      ...voce,
      testata: testataDi(fonte),
      sezione: fonte.sezione,
      livello: fonte.livello,
      tipo: fonte.livello === 'letture' ? fonte.tipo ?? null : null,
      lingua: fonte.lingua,
    }));
    const precedente = cache[fonte.url];
    nuovaCache[fonte.url] = {
      ultimo_ok: esito.ultimo_ok,
      etag: (esito.esito === 'invariato' ? precedente.etag : esito.etag) ?? null,
      modificato: (esito.esito === 'invariato' ? precedente.modificato : esito.modificato) ?? null,
      voci: voci.filter((voce) => entroEta(voce, adesso.getTime())),
    };
    return { ordine, voci };
  });

  const { voci, doppioni, fuoriEta, oltreTetto } = componi(gruppi, adesso.getTime());

  const registro = fonti.map((fonte, i) => ({
    nome: fonte.nome,
    url: fonte.url,
    esito: esiti[i].esito,
    voci_entro_eta: nuovaCache[fonte.url].voci.length,
    ultimo_ok: esiti[i].ultimo_ok,
    ...(esiti[i].errore ? { errore: esiti[i].errore } : {}),
  }));
  const errori = registro.filter((r) => r.esito === 'errore');

  if (errori.length) {
    const righe = errori.map((r) => `${adesso.toISOString()}\t${r.nome}\t${r.url}\t${r.errore}\n`).join('');
    await appendFile(fileErrori, righe, 'utf8');
  }

  // Se nessuna fonte ha risposto il ciclo non è valido: il file pubblicato
  // resta quello dell'ultimo aggiornamento riuscito.
  if (errori.length === fonti.length) {
    console.error(`Nessuna delle ${fonti.length} fonti ha risposto: feed.json non è stato modificato.`);
    process.exitCode = 1;
    return;
  }

  await scriviJson(fileCache, { versione: VERSIONE_CACHE, fonti: nuovaCache });
  await scriviJson(fileFeed, {
    aggiornato: adesso.toISOString(),
    riepilogo: {
      fonti: fonti.length,
      fonti_in_errore: errori.length,
      voci: voci.length,
      notizie: voci.filter((v) => v.livello === 'notizie').length,
      letture: voci.filter((v) => v.livello === 'letture').length,
      doppioni_eliminati: doppioni,
      letture_oltre_il_tetto: oltreTetto,
    },
    voci,
    fonti: registro,
  });

  console.log(
    `${voci.length} voci da ${fonti.length - errori.length} fonti su ${fonti.length} ` +
      `(${doppioni} doppioni eliminati, ${fuoriEta} voci scartate perché fuori età o senza data).`,
  );
  for (const r of errori) console.log(`  errore: ${r.nome}: ${r.errore}`);
}

principale().catch((errore) => {
  console.error(errore);
  process.exitCode = 1;
});
