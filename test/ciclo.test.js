// Prova l'intero ciclo di lettura contro un server locale: prima lettura,
// risposta 304, feed in errore con ultimo risultato valido conservato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const esegui = promisify(execFile);
const script = new URL('../src/leggi-feed.js', import.meta.url).pathname;

function feed(titoli) {
  const data = new Date(Date.now() - 3600_000).toUTCString();
  const voci = titoli.map((t) => `<item><title>${t}</title><link>https://esempio.test/${t}</link><description>Testo di ${t}</description><pubDate>${data}</pubDate></item>`);
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>p</title>${voci.join('')}</channel></rss>`;
}

test('ciclo completo: lettura, 304, errore con ultimo risultato valido', async () => {
  const richieste = [];
  let guasto = false;
  const server = createServer((req, res) => {
    richieste.push({ url: req.url, agente: req.headers['user-agent'], etag: req.headers['if-none-match'] });
    if (req.url === '/b' && guasto) return res.writeHead(500).end('errore');
    if (req.url === '/c') return res.writeHead(403, { 'content-type': 'text/html' }).end('<html>Just a moment...</html>');
    if (req.headers['if-none-match'] === '"v1"') return res.writeHead(304).end();
    res.writeHead(200, { 'content-type': 'application/rss+xml', etag: '"v1"' });
    res.end(feed(req.url === '/a' ? ['uno', 'comune'] : ['due', 'comune']));
  });
  await new Promise((pronto) => server.listen(0, '127.0.0.1', pronto));
  const base = `http://127.0.0.1:${server.address().port}`;

  const cartella = await mkdtemp(join(tmpdir(), 'rassegna-'));
  const fileFonti = join(cartella, 'fonti.json');
  const fonte = (nome, percorso, stato = 'verificato') => ({ nome, url: base + percorso, sezione: 'mercati', livello: 'notizie', lingua: 'it', stato });
  await writeFile(fileFonti, JSON.stringify({ fonti: [fonte('A', '/a'), fonte('B', '/b'), fonte('C', '/c'), fonte('Esclusa', '/x', 'escluso'), fonte('Da provare', '/y', 'da_provare')] }));
  const ciclo = async () => {
    await esegui(process.execPath, [script, '--fonti', fileFonti, '--uscita', cartella]);
    return JSON.parse(await readFile(join(cartella, 'feed.json'), 'utf8'));
  };
  const esitoDi = (dati, nome) => dati.fonti.find((f) => f.nome === nome);

  try {
    const primo = await ciclo();
    assert.deepEqual(richieste.map((r) => r.url).sort(), ['/a', '/b', '/c'], 'solo le fonti verificate, una richiesta ciascuna');
    assert.match(richieste[0].agente, /^Rassegna\//);
    assert.deepEqual(primo.voci.map((v) => v.titolo).sort(), ['comune', 'due', 'uno'], 'il doppione compare una volta');
    assert.equal(primo.riepilogo.doppioni_eliminati, 1);
    assert.equal(esitoDi(primo, 'C').esito, 'errore');
    assert.match(esitoDi(primo, 'C').errore, /403/);

    richieste.length = 0;
    const secondo = await ciclo();
    assert.equal(richieste.find((r) => r.url === '/a').etag, '"v1"');
    assert.equal(esitoDi(secondo, 'A').esito, 'invariato');
    assert.equal(secondo.voci.length, 3);

    guasto = true;
    const terzo = await ciclo();
    assert.equal(esitoDi(terzo, 'B').esito, 'errore');
    assert.equal(esitoDi(terzo, 'B').ultimo_ok, secondo.aggiornato);
    assert.ok(terzo.voci.some((v) => v.titolo === 'due'), "resta l'ultimo risultato valido di B");
    const registro = await readFile(join(cartella, 'errori.log'), 'utf8');
    assert.match(registro, /\tB\t.*risposta 500/);
  } finally {
    server.close();
  }
});
