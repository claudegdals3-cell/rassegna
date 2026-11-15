// Trasforma il testo XML di un feed (RSS 2.0 o Atom) in voci secondo il modello
// del punto 8 delle specifiche. Il testo completo degli articoli serve solo a
// stimare il tempo di lettura e non esce mai da questo modulo.

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { decodeHTML } from 'entities';

export const ESTRATTO_MAX = 200;
const PAROLE_AL_MINUTO = 220;
// Sotto questa soglia il contenuto del feed è considerato un'anteprima, non il testo completo.
const PAROLE_TESTO_COMPLETO = 250;

const SEMPRE_ELENCO = new Set([
  'item', 'entry', 'link', 'enclosure', 'media:content', 'media:thumbnail',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: true,
  isArray: (nome) => SEMPRE_ELENCO.has(nome),
  // I feed con HTML codificato contengono migliaia di entità: i limiti predefiniti
  // della libreria, pensati per i documenti con entità dichiarate, sarebbero troppo bassi.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 5_000_000,
    maxExpandedLength: 50_000_000,
  },
});

function elenco(valore) {
  if (valore === undefined || valore === null) return [];
  return Array.isArray(valore) ? valore : [valore];
}

// Cerca gli elementi con un certo nome a qualunque profondità. Serve per i feed
// malformati, in cui un tag non chiuso (per esempio un <link> di HTML finito nel
// canale) fa scivolare le voci dentro un altro elemento.
function cercaOvunque(nodo, nome, trovati = []) {
  if (!nodo || typeof nodo !== 'object') return trovati;
  for (const figlio of Array.isArray(nodo) ? nodo : [nodo]) {
    if (!figlio || typeof figlio !== 'object') continue;
    for (const [chiave, valore] of Object.entries(figlio)) {
      if (chiave === nome) trovati.push(...elenco(valore));
      else if (!chiave.startsWith('@_')) cercaOvunque(valore, nome, trovati);
    }
  }
  return trovati;
}

function voceValida(nodo) {
  return nodo && typeof nodo === 'object';
}

// Un nodo può essere una stringa oppure un oggetto con attributi e testo.
function testoDi(nodo) {
  const primo = Array.isArray(nodo) ? nodo[0] : nodo;
  if (primo === undefined || primo === null) return '';
  if (typeof primo === 'string') return primo;
  if (typeof primo === 'object' && typeof primo['#text'] === 'string') return primo['#text'];
  return '';
}

const TAG = /<\/?[a-zA-Z][^>]*>|<!--[\s\S]*?-->/g;

export function testoSemplice(html) {
  if (!html) return '';
  let t = String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(TAG, ' ');
  t = decodeHTML(t);
  // Alcuni feed codificano l'HTML due volte: dopo la decodifica restano dei tag.
  t = t.replace(TAG, ' ');
  return t.replace(/[ ​﻿]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Formule aggiunte in coda dai sistemi editoriali, prive di contenuto.
const CODE_DI_SERVIZIO = [
  /\s*The post .+ appeared first on .+$/i,
  /\s*L['’]articolo .+ (proviene da|sembra essere il primo su) .+$/i,
];

export function estrattoDa(html, max = ESTRATTO_MAX) {
  let t = testoSemplice(html);
  for (const formula of CODE_DI_SERVIZIO) t = t.replace(formula, '');
  t = t.replace(/\s*\[(…|\.\.\.)\]\s*$/, '…').trim();
  if (t.length <= max) return t;
  let taglio = t.slice(0, max - 1);
  const spazio = taglio.lastIndexOf(' ');
  if (spazio > max * 0.6) taglio = taglio.slice(0, spazio);
  return taglio.replace(/[\s.,;:…\-–—]+$/, '') + '…';
}

export function contaParole(testo) {
  return testo ? testo.split(/\s+/).filter(Boolean).length : 0;
}

const PARAMETRI_DI_TRACCIAMENTO = /^(utm_.+|at_medium|at_campaign|fbclid|gclid)$/i;

// Indirizzo assoluto, senza frammento e senza parametri di tracciamento:
// è la chiave con cui si riconoscono i doppioni.
export function normalizzaUrl(indirizzo, base) {
  if (!indirizzo || typeof indirizzo !== 'string') return null;
  let url;
  try {
    url = new URL(indirizzo.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  for (const chiave of [...url.searchParams.keys()]) {
    if (PARAMETRI_DI_TRACCIAMENTO.test(chiave)) url.searchParams.delete(chiave);
  }
  return url.href;
}

export function idDa(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

export function dataIso(valore) {
  const testo = testoDi(valore).trim();
  if (!testo) return null;
  const adattato = testo.replace(/\bCEST\b/, '+0200').replace(/\bCET\b/, '+0100');
  const data = new Date(adattato);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function sembraImmagine(url, tipo) {
  if (tipo) return /^image\//i.test(tipo);
  return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url || '');
}

function primaImmagineHtml(html) {
  if (!html) return null;
  for (const [tag] of String(html).matchAll(/<img\b[^>]*>/gi)) {
    // I segnaposto di un pixel servono al tracciamento, non sono immagini.
    if (/\b(width|height)\s*=\s*["']?[01]["'\s>]/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) return decodeHTML(src[1]);
  }
  return null;
}

function immagineDi(nodo, descrizione, contenuto, base) {
  const candidati = [];
  for (const e of elenco(nodo.enclosure)) {
    if (sembraImmagine(e['@_url'], e['@_type'])) candidati.push(e['@_url']);
  }
  const gruppo = nodo['media:group'] || {};
  for (const m of [...elenco(nodo['media:content']), ...elenco(gruppo['media:content'])]) {
    const medium = m['@_medium'];
    if (medium === 'image' || (!medium && sembraImmagine(m['@_url'], m['@_type']))) {
      candidati.push(m['@_url']);
    }
  }
  // media:thumbnail non è citato nelle specifiche, ma è il modo in cui alcune
  // testate (per esempio la BBC) indicano l'immagine della voce.
  for (const m of [...elenco(nodo['media:thumbnail']), ...elenco(gruppo['media:thumbnail'])]) {
    candidati.push(m['@_url']);
  }
  for (const l of elenco(nodo.link)) {
    if (typeof l === 'object' && l['@_rel'] === 'enclosure' && sembraImmagine(l['@_href'], l['@_type'])) {
      candidati.push(l['@_href']);
    }
  }
  candidati.push(primaImmagineHtml(descrizione), primaImmagineHtml(contenuto));
  for (const c of candidati) {
    const url = normalizzaUrl(c, base);
    if (url) return url;
  }
  return null;
}

function indirizzoRss(item) {
  for (const l of elenco(item.link)) {
    const testo = testoDi(l) || (typeof l === 'object' ? l['@_href'] : '');
    if (testo) return testo;
  }
  const guid = item.guid;
  if (guid && !(typeof guid === 'object' && guid['@_isPermaLink'] === 'false')) {
    const testo = testoDi(guid);
    if (/^https?:\/\//i.test(testo)) return testo;
  }
  return null;
}

function indirizzoAtom(entry) {
  const collegamenti = elenco(entry.link).filter((l) => typeof l === 'object' && l['@_href']);
  const articolo =
    collegamenti.find((l) => (l['@_rel'] || 'alternate') === 'alternate' && (l['@_type'] || 'text/html') === 'text/html') ||
    collegamenti.find((l) => (l['@_rel'] || 'alternate') === 'alternate');
  return articolo ? articolo['@_href'] : null;
}

export function testataDi(fonte) {
  return fonte.testata || fonte.nome.split(',')[0].trim();
}

function componiVoce(fonte, grezza) {
  const url = normalizzaUrl(grezza.indirizzo, fonte.url);
  const titolo = testoSemplice(grezza.titolo);
  if (!url || !titolo) return null;

  const letture = fonte.livello === 'letture';
  let minuti = null;
  if (letture) {
    const parole = contaParole(testoSemplice(grezza.contenuto));
    if (parole >= PAROLE_TESTO_COMPLETO) minuti = Math.max(1, Math.round(parole / PAROLE_AL_MINUTO));
  }

  return {
    id: idDa(url),
    titolo,
    estratto: estrattoDa(grezza.descrizione || grezza.contenuto),
    url,
    testata: testataDi(fonte),
    sezione: fonte.sezione,
    livello: fonte.livello,
    tipo: letture ? fonte.tipo ?? null : null,
    lingua: fonte.lingua,
    pubblicato: grezza.data,
    immagine: immagineDi(grezza.nodo, grezza.descrizione, grezza.contenuto, url),
    minuti_lettura: minuti,
  };
}

// Restituisce le voci del feed. Solleva un errore se il testo non è un feed
// RSS 2.0 o Atom. Le voci senza titolo o senza indirizzo sono scartate.
export function analizzaFeed(xml, fonte) {
  // Alcuni feed iniziano con righe vuote o con il segno d'ordine dei byte.
  const pulito = String(xml).replace(/^[﻿\s]+/, '');
  if (!pulito.startsWith('<')) throw new Error('la risposta non è XML');

  let albero;
  try {
    albero = parser.parse(pulito);
  } catch (errore) {
    throw new Error(`XML non valido: ${errore.message}`);
  }

  let grezze;
  if (albero.rss) {
    let item = elenco(albero.rss.channel?.item);
    if (!item.length) item = cercaOvunque(albero.rss, 'item');
    grezze = item.filter(voceValida).map((item) => ({
      nodo: item,
      titolo: testoDi(item.title),
      indirizzo: indirizzoRss(item),
      descrizione: testoDi(item.description),
      contenuto: testoDi(item['content:encoded']),
      data: dataIso(item.pubDate) || dataIso(item['dc:date']),
    }));
  } else if (albero.feed) {
    let entry = elenco(albero.feed.entry);
    if (!entry.length) entry = cercaOvunque(albero.feed, 'entry');
    grezze = entry.filter(voceValida).map((entry) => ({
      nodo: entry,
      titolo: testoDi(entry.title),
      indirizzo: indirizzoAtom(entry),
      descrizione: testoDi(entry.summary),
      contenuto: testoDi(entry.content),
      data: dataIso(entry.published) || dataIso(entry.updated),
    }));
  } else if (albero['rdf:RDF']) {
    throw new Error('formato RSS 1.0 (RDF) non previsto');
  } else {
    throw new Error('la risposta non è un feed RSS 2.0 o Atom');
  }

  return grezze.map((grezza) => componiVoce(fonte, grezza)).filter(Boolean);
}
