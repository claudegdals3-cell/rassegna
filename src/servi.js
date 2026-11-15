#!/usr/bin/env node
// Server locale per provare il sito sul proprio computer: node src/servi.js [porta]
// Serve solo i file della cartella sito/ e ascolta solo sull'indirizzo locale.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = fileURLToPath(new URL('../sito/', import.meta.url));
const porta = Number(process.argv[2]) || 4173;
const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (richiesta, risposta) => {
  const percorso = decodeURIComponent(new URL(richiesta.url, 'http://localhost').pathname);
  const file = normalize(join(radice, percorso.endsWith('/') ? `${percorso}index.html` : percorso));
  if (!file.startsWith(radice.endsWith(sep) ? radice : radice + sep)) {
    risposta.writeHead(403).end();
    return;
  }
  try {
    const contenuto = await readFile(file);
    risposta.writeHead(200, { 'content-type': TIPI[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    risposta.end(contenuto);
  } catch {
    risposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Non trovato');
  }
}).listen(porta, '127.0.0.1', () => {
  console.log(`Rassegna in prova su http://127.0.0.1:${porta}/`);
});
