// Conserva una copia dei file dell'app, così si apre anche senza rete.
// Si usa sempre la rete quando c'è; la copia serve solo se la rete manca.
// Il file dei dati non passa di qui: l'app ne tiene da sé l'ultima versione
// valida e segnala quando l'aggiornamento non riesce.

const COPIA = 'rassegna-app-1';
const FILE_APP = ['./', 'stile.css', 'app.js', 'manifest.webmanifest', 'icone/icona-192.png', 'icone/icona-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(COPIA).then((copia) => copia.addAll(FILE_APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomi) => Promise.all(nomi.filter((nome) => nome !== COPIA).map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  const url = new URL(richiesta.url);
  if (richiesta.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/dati/')) return;
  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        if (risposta.ok) {
          const duplicato = risposta.clone();
          caches.open(COPIA).then((copia) => copia.put(richiesta, duplicato));
        }
        return risposta;
      })
      .catch(() => caches.match(richiesta, { ignoreSearch: true }).then((trovata) => trovata ?? Response.error())),
  );
});
