// Interfaccia di Rassegna: quattro viste (Notizie, Letture, Salvati, Sezioni)
// sopra il file unico dati/feed.json. Salvati e sezioni attive restano nel browser.
// I testi che arrivano dai feed entrano nella pagina solo come testo, mai come HTML.

const SEZIONI = [
  ['attualita', 'Attualità'],
  ['politica', 'Politica'],
  ['geopolitica', 'Geopolitica'],
  ['mercati', 'Mercati'],
  ['tecnologia', 'Tecnologia'],
  ['farmaceutico', 'Farmaceutico'],
  ['orologeria', 'Orologeria'],
];
const NOME_SEZIONE = Object.fromEntries(SEZIONI);
const NOME_TIPO = { analisi: 'Analisi', opinione: 'Opinione', saggio: 'Saggio' };
const INDIRIZZO_FEED = 'dati/feed.json';
const VOCI_PER_BLOCCO = 40;
const RICARICA_DOPO = 5 * 60 * 1000;

const CHIAVE = { feed: 'rassegna.feed', salvati: 'rassegna.salvati', spente: 'rassegna.spente' };

// La memoria del browser può mancare o essere piena: l'app deve funzionare comunque.
function leggiMemoria(chiave, predefinito) {
  try {
    const testo = localStorage.getItem(chiave);
    return testo ? JSON.parse(testo) : predefinito;
  } catch {
    return predefinito;
  }
}

function scriviMemoria(chiave, valore) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    // memoria non disponibile: si prosegue senza
  }
}

const stato = {
  vista: 'notizie',
  scheda: 'tutte',
  dati: leggiMemoria(CHIAVE.feed, null),
  salvati: leggiMemoria(CHIAVE.salvati, {}),
  spente: leggiMemoria(CHIAVE.spente, {}),
  inCaricamento: true,
  nonRiuscito: false,
  ultimaRichiesta: 0,
};

const nodoStato = document.getElementById('stato');
const nodoSchede = document.getElementById('schede');
const nodoContenuto = document.getElementById('contenuto');
const pulsantiBarra = [...document.querySelectorAll('.barra button')];
let osservatore = null;

function crea(tag, attributi = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [nome, valore] of Object.entries(attributi)) {
    if (valore === null || valore === undefined || valore === false) continue;
    if (nome === 'class') nodo.className = valore;
    else if (nome === 'text') nodo.textContent = valore;
    else nodo.setAttribute(nome, valore);
  }
  nodo.append(...figli);
  return nodo;
}

function indirizzoSicuro(indirizzo) {
  try {
    const url = new URL(indirizzo);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function attiva(sezione) {
  return stato.spente[sezione] !== true;
}

// ---- Tempo -----------------------------------------------------------------

function tempoTrascorso(iso) {
  const minuti = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minuti < 1) return 'adesso';
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `${ore} h`;
  return `${Math.round(ore / 24)} g`;
}

const formatoGiorno = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const formatoOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const formatoGiornoBreve = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });

function maiuscolaIniziale(testo) {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

function oraDi(iso) {
  const data = new Date(iso);
  const oggi = new Date().toDateString() === data.toDateString();
  return oggi ? `alle ${formatoOra.format(data)}` : `il ${formatoGiornoBreve.format(data)} alle ${formatoOra.format(data)}`;
}

function disegnaStato() {
  const oggi = maiuscolaIniziale(formatoGiorno.format(new Date()));
  const aggiornato = stato.dati?.aggiornato;
  let seguito;
  if (stato.nonRiuscito) {
    seguito = aggiornato
      ? `aggiornamento non riuscito, ultimo valido ${oraDi(aggiornato)}`
      : 'aggiornamento non riuscito';
  } else if (aggiornato) {
    const da = tempoTrascorso(aggiornato);
    seguito = da === 'adesso' ? 'aggiornato adesso' : `aggiornato ${da} fa`;
  } else {
    seguito = 'caricamento';
  }
  nodoStato.textContent = `${oggi} · ${seguito}`;
}

// ---- Voci ------------------------------------------------------------------

const DISEGNO_SEGNALIBRO =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path d="M6 4h12v17l-6-4-6 4V4z"></path></svg>';

function pulsanteSegnalibro(voce) {
  const pulsante = crea('button', { type: 'button', class: 'segnalibro' });
  pulsante.innerHTML = DISEGNO_SEGNALIBRO;
  const aggiorna = () => {
    const salvata = Boolean(stato.salvati[voce.id]);
    pulsante.setAttribute('aria-pressed', String(salvata));
    pulsante.setAttribute('aria-label', salvata ? 'Rimuovi dai salvati' : 'Salva articolo');
  };
  aggiorna();
  pulsante.addEventListener('click', () => {
    if (stato.salvati[voce.id]) delete stato.salvati[voce.id];
    else stato.salvati[voce.id] = { voce, quando: Date.now() };
    scriviMemoria(CHIAVE.salvati, stato.salvati);
    if (stato.vista === 'salvati') disegnaContenuto();
    else aggiorna();
  });
  return pulsante;
}

function elementoVoce(voce, prima) {
  const articolo = crea('article', { class: prima ? 'voce prima' : 'voce', lang: voce.lingua });

  // Solo la voce di apertura mostra l'immagine, se la fonte la fornisce.
  const immagine = prima ? indirizzoSicuro(voce.immagine) : null;
  if (immagine) {
    const riquadro = crea('div', { class: 'apertura' });
    const img = crea('img', { src: immagine, alt: '', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => riquadro.remove());
    riquadro.append(img);
    articolo.append(riquadro);
  }

  const sezione = NOME_SEZIONE[voce.sezione] ?? voce.sezione;
  const lettura = voce.livello === 'letture';
  const etichetta = lettura && NOME_TIPO[voce.tipo] ? `${NOME_TIPO[voce.tipo]} · ${sezione}` : sezione;
  const tempo =
    lettura && voce.minuti_lettura
      ? crea('span', { text: `${voce.minuti_lettura} min di lettura` })
      : crea('time', { datetime: voce.pubblicato, text: tempoTrascorso(voce.pubblicato) });
  const punto = () => crea('span', { 'aria-hidden': 'true', text: '·' });
  const meta = crea(
    'div',
    { class: 'meta', lang: 'it' },
    crea('span', { class: 'etichetta', text: etichetta }),
    punto(),
    crea('span', { text: voce.testata }),
    punto(),
    tempo,
  );

  const indirizzo = indirizzoSicuro(voce.url);
  const titolo = crea(
    'h2',
    { class: 'titolo' },
    indirizzo
      ? crea('a', { href: indirizzo, target: '_blank', rel: 'noopener noreferrer', text: voce.titolo })
      : voce.titolo,
  );

  const corpo = crea('div', { class: 'corpo' }, meta, titolo);
  if (voce.estratto) corpo.append(crea('p', { class: 'estratto', text: voce.estratto }));

  articolo.append(crea('div', { class: 'riga' }, corpo, pulsanteSegnalibro(voce)));
  return articolo;
}

// Le voci entrano nella pagina a blocchi, man mano che si scorre.
function disegnaElenco(voci, conApertura) {
  let mostrate = 0;
  const sentinella = crea('div', { 'aria-hidden': 'true' });
  const aggiungi = () => {
    const blocco = voci.slice(mostrate, mostrate + VOCI_PER_BLOCCO);
    sentinella.before(...blocco.map((voce, i) => elementoVoce(voce, conApertura && mostrate + i === 0)));
    mostrate += blocco.length;
    if (mostrate >= voci.length) {
      osservatore?.disconnect();
      sentinella.remove();
    }
  };
  nodoContenuto.append(sentinella);
  aggiungi();
  if (mostrate < voci.length) {
    osservatore = new IntersectionObserver(
      (voci_) => {
        if (voci_.some((v) => v.isIntersecting)) aggiungi();
      },
      { root: nodoContenuto, rootMargin: '600px' },
    );
    osservatore.observe(sentinella);
  }
}

// ---- Viste -----------------------------------------------------------------

function disegnaSchede() {
  nodoSchede.hidden = stato.vista !== 'notizie';
  if (nodoSchede.hidden) return;
  const schede = [['tutte', 'Tutte'], ...SEZIONI.filter(([chiave]) => attiva(chiave))];
  nodoSchede.replaceChildren(
    ...schede.map(([chiave, nome]) => {
      const pulsante = crea('button', { type: 'button', 'aria-pressed': String(stato.scheda === chiave), text: nome });
      pulsante.addEventListener('click', () => {
        stato.scheda = chiave;
        disegna({ inCima: true });
      });
      return pulsante;
    }),
  );
}

function messaggioVuoto(testo) {
  nodoContenuto.append(crea('p', { class: 'vuoto', text: testo }));
}

function disegnaSezioni() {
  nodoContenuto.className = 'sezioni';
  nodoContenuto.append(
    crea('h2', { class: 'titolo-vista', text: 'Sezioni' }),
    crea('p', { class: 'sottotitolo', text: 'Scegli che cosa compare nel feed.' }),
  );
  const fonti = stato.dati?.fonti ?? [];
  for (const [chiave, nome] of SEZIONI) {
    const testate = [...new Set(fonti.filter((f) => f.sezione === chiave).map((f) => f.testata))];
    const interruttore = crea(
      'button',
      { type: 'button', class: 'interruttore', 'aria-pressed': String(attiva(chiave)), 'aria-label': `${attiva(chiave) ? 'Nascondi' : 'Mostra'} ${nome}` },
      crea('span', { class: 'binario' }, crea('span', { class: 'pomello' })),
    );
    interruttore.addEventListener('click', () => {
      const accesa = attiva(chiave);
      if (accesa) stato.spente[chiave] = true;
      else delete stato.spente[chiave];
      if (accesa && stato.scheda === chiave) stato.scheda = 'tutte';
      scriviMemoria(CHIAVE.spente, stato.spente);
      interruttore.setAttribute('aria-pressed', String(!accesa));
      interruttore.setAttribute('aria-label', `${!accesa ? 'Nascondi' : 'Mostra'} ${nome}`);
    });
    const testi = crea('div', { class: 'testi' }, crea('span', { class: 'nome', text: nome }));
    if (testate.length) testi.append(crea('span', { class: 'fonti', text: testate.join(', ') }));
    nodoContenuto.append(crea('div', { class: 'sezione' }, testi, interruttore));
  }
}

function disegnaContenuto() {
  osservatore?.disconnect();
  osservatore = null;
  nodoContenuto.className = '';
  nodoContenuto.replaceChildren();

  if (stato.vista === 'sezioni') {
    disegnaSezioni();
    return;
  }

  if (stato.vista === 'salvati') {
    nodoContenuto.append(crea('h2', { class: 'titolo-vista', text: 'Articoli salvati' }));
    const salvate = Object.values(stato.salvati)
      .sort((a, b) => b.quando - a.quando)
      .map((s) => s.voce);
    if (!salvate.length) {
      messaggioVuoto('Nessun articolo salvato. Tocca il segnalibro accanto a un titolo per ritrovarlo qui.');
      return;
    }
    disegnaElenco(salvate, false);
    return;
  }

  const letture = stato.vista === 'letture';
  if (letture) nodoContenuto.append(crea('h2', { class: 'titolo-vista', text: 'Analisi, opinioni e saggi' }));

  if (!stato.dati) {
    messaggioVuoto(
      stato.inCaricamento
        ? 'Caricamento delle notizie.'
        : 'Aggiornamento non riuscito e nessun dato già scaricato. Riprova tra qualche minuto.',
    );
    return;
  }
  if (!SEZIONI.some(([chiave]) => attiva(chiave))) {
    messaggioVuoto('Nessuna sezione attiva. Riattivane una da Sezioni.');
    return;
  }

  const livello = letture ? 'letture' : 'notizie';
  const voci = stato.dati.voci.filter(
    (voce) =>
      voce.livello === livello &&
      attiva(voce.sezione) &&
      (letture || stato.scheda === 'tutte' || voce.sezione === stato.scheda),
  );
  if (!voci.length) {
    messaggioVuoto(
      letture
        ? 'Nessuna lettura recente nelle sezioni attive.'
        : stato.scheda === 'tutte'
          ? 'Nessuna notizia recente nelle sezioni attive.'
          : `Nessuna notizia recente in ${NOME_SEZIONE[stato.scheda]}.`,
    );
    return;
  }
  disegnaElenco(voci, !letture);
}

function disegna({ inCima = false } = {}) {
  for (const pulsante of pulsantiBarra) {
    pulsante.setAttribute('aria-pressed', String(pulsante.dataset.vista === stato.vista));
  }
  disegnaStato();
  disegnaSchede();
  disegnaContenuto();
  if (inCima) nodoContenuto.scrollTop = 0;
}

// ---- Dati ------------------------------------------------------------------

async function aggiorna() {
  stato.ultimaRichiesta = Date.now();
  try {
    const risposta = await fetch(INDIRIZZO_FEED, { cache: 'no-cache' });
    if (!risposta.ok) throw new Error(`risposta ${risposta.status}`);
    const dati = await risposta.json();
    if (!Array.isArray(dati.voci)) throw new Error('file non valido');
    const cambiato = dati.aggiornato !== stato.dati?.aggiornato;
    stato.dati = dati;
    stato.nonRiuscito = false;
    stato.inCaricamento = false;
    scriviMemoria(CHIAVE.feed, dati);
    // Se i dati non sono cambiati la pagina resta com'è, senza perdere il punto di lettura.
    if (cambiato) disegna();
    else disegnaStato();
  } catch {
    stato.nonRiuscito = true;
    stato.inCaricamento = false;
    if (stato.dati) disegnaStato();
    else disegna();
  }
}

for (const pulsante of pulsantiBarra) {
  pulsante.addEventListener('click', () => {
    stato.vista = pulsante.dataset.vista;
    disegna({ inCima: true });
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - stato.ultimaRichiesta > RICARICA_DOPO) aggiorna();
});
setInterval(disegnaStato, 60_000);

disegna();
aggiorna();

// Rende l'app installabile e apribile anche senza rete (i dati restano gli ultimi scaricati).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
