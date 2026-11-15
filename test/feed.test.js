import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizzaFeed, estrattoDa, normalizzaUrl, ESTRATTO_MAX } from '../src/analizza.js';
import { componi, LETTURE_PER_FONTE } from '../src/componi.js';

const notizie = { nome: 'Testata di prova, Economia', url: 'https://esempio.test/feed/', sezione: 'mercati', livello: 'notizie', lingua: 'it' };
const letture = { nome: 'Rivista di prova', url: 'https://rivista.test/feed/', sezione: 'geopolitica', livello: 'letture', tipo: 'analisi', lingua: 'it' };
const lungo = Array.from({ length: 660 }, (_, i) => `parola${i}`).join(' ');

const rss = `
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Prova</title><link>https://esempio.test/</link>
<item>
  <title><![CDATA[Borsa: l&rsquo;indice chiude in rialzo]]></title>
  <link>https://esempio.test/articolo-1?utm_source=rss&amp;id=7#commenti</link>
  <description><![CDATA[<p><img src="/img/uno.jpg" width="140">Il listino <b>sale</b> dell&#8217;1%. [&#8230;]</p><p>L'articolo Borsa proviene da Prova.</p>]]></description>
  <pubDate>Sun, 15 Nov 2026 16:24:02 +0100</pubDate>
</item>
<item>
  <title>Voce senza descrizione</title>
  <link>https://esempio.test/articolo-2</link>
  <enclosure url="https://esempio.test/img/due.png" type="image/png" length="1"/>
  <pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate>
</item>
<item><title>Voce senza indirizzo</title><pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Rivista</title>
<entry>
  <title type="html">Un saggio &amp;amp; una tesi</title>
  <link rel="alternate" type="text/html" href="https://rivista.test/saggio"/>
  <link rel="enclosure" type="image/jpeg" href="https://rivista.test/copertina.jpg"/>
  <summary>Sintesi del saggio.</summary>
  <content type="html">&lt;p&gt;${lungo}&lt;/p&gt;</content>
  <published>2026-11-10T08:00:00Z</published>
</entry>
</feed>`;

test('RSS: testo semplice, estratto pulito, immagine e indirizzo normalizzato', () => {
  const voci = analizzaFeed(rss, notizie);
  assert.equal(voci.length, 2, 'la voce senza indirizzo è scartata');
  const [prima, seconda] = voci;
  assert.equal(prima.titolo, 'Borsa: l’indice chiude in rialzo');
  assert.equal(prima.estratto, 'Il listino sale dell’1%.…');
  assert.equal(prima.url, 'https://esempio.test/articolo-1?id=7');
  assert.equal(prima.immagine, 'https://esempio.test/img/uno.jpg');
  assert.equal(prima.pubblicato, '2026-11-15T15:24:02.000Z');
  assert.equal(prima.testata, 'Testata di prova');
  assert.equal(prima.tipo, null);
  assert.equal(prima.minuti_lettura, null);
  assert.equal(seconda.estratto, '');
  assert.equal(seconda.immagine, 'https://esempio.test/img/due.png');
});

test('Atom: collegamento, tipo e tempo di lettura dal testo completo', () => {
  const [voce] = analizzaFeed(atom, letture);
  assert.equal(voce.titolo, 'Un saggio & una tesi');
  assert.equal(voce.url, 'https://rivista.test/saggio');
  assert.equal(voce.estratto, 'Sintesi del saggio.');
  assert.equal(voce.immagine, 'https://rivista.test/copertina.jpg');
  assert.equal(voce.tipo, 'analisi');
  assert.equal(voce.minuti_lettura, 3);
  assert.ok(!JSON.stringify(voce).includes('parola100'), 'il testo completo non è conservato');
});

test('estratto: al massimo 200 caratteri, anche dal testo completo', () => {
  const estratto = estrattoDa(`<p>${lungo}</p>`);
  assert.ok(estratto.length <= ESTRATTO_MAX);
  assert.ok(estratto.endsWith('…'));
  assert.ok(!estratto.includes('<'));
});

test('feed malformato: voci dentro un tag non chiuso', () => {
  const rotto = rss.replace('<link>https://esempio.test/</link>', '<link rel="preload" href="https://esempio.test/a.woff2" crossorigin>');
  assert.equal(analizzaFeed(rotto, notizie).length, 2);
});

test('formati non previsti e risposte non XML sono errori', () => {
  assert.throws(() => analizzaFeed('<rdf:RDF xmlns:rdf="x"><item><title>a</title></item></rdf:RDF>', notizie), /RSS 1\.0/);
  assert.throws(() => analizzaFeed('<!DOCTYPE html><html><body>Just a moment...</body></html>', notizie), /non è un feed/);
  assert.throws(() => analizzaFeed('Access Denied', notizie), /non è XML/);
});

test('normalizzaUrl: toglie tracciamento e frammento, rifiuta schemi diversi da http', () => {
  assert.equal(normalizzaUrl('https://a.test/x?at_medium=RSS&at_campaign=rss&p=1#top'), 'https://a.test/x?p=1');
  assert.equal(normalizzaUrl('/relativo', 'https://a.test/feed/'), 'https://a.test/relativo');
  assert.equal(normalizzaUrl('javascript:alert(1)'), null);
});

test('componi: età massima per livello, doppioni e ordine', () => {
  const adesso = Date.parse('2026-11-15T18:00:00Z');
  const voce = (id, pubblicato, extra = {}) => ({
    id, titolo: id, estratto: '', url: `https://a.test/${id}`, testata: 'T', sezione: 'mercati',
    livello: 'notizie', tipo: null, lingua: 'it', pubblicato, immagine: null, minuti_lettura: null, ...extra,
  });
  const gruppi = [
    { ordine: 0, voci: [
      voce('a', '2026-11-15T12:00:00Z', { sezione: 'attualita', immagine: 'https://a.test/a.jpg' }),
      voce('vecchia', '2026-11-12T17:00:00Z'),
      voce('venerdi', '2026-11-13T09:00:00Z'),
      voce('senza-data', null),
    ] },
    { ordine: 1, voci: [
      voce('a', '2026-11-15T12:00:00Z', { sezione: 'politica', estratto: 'Dalla sezione' }),
      voce('b', '2026-11-15T17:00:00Z'),
      voce('lettura', '2026-10-20T09:00:00Z', { livello: 'letture' }),
      voce('lettura-vecchia', '2026-10-10T09:00:00Z', { livello: 'letture' }),
    ] },
  ];
  const { voci, doppioni, fuoriEta } = componi(gruppi, adesso);
  assert.deepEqual(voci.map((v) => v.id), ['b', 'a', 'venerdi', 'lettura'], 'il venerdì resta visibile la domenica');
  assert.equal(doppioni, 1);
  assert.equal(fuoriEta, 3);
  const a = voci[1];
  assert.equal(a.sezione, 'politica', 'vince la fonte di sezione su quella generale');
  assert.equal(a.immagine, 'https://a.test/a.jpg', 'i campi mancanti si completano');
  assert.ok(!('ordine' in a));
});

test('componi: di ogni fonte entrano solo le letture più recenti', () => {
  const adesso = Date.parse('2026-11-15T18:00:00Z');
  const voci = Array.from({ length: LETTURE_PER_FONTE + 5 }, (_, i) => ({
    id: `l${i}`, titolo: `l${i}`, estratto: '', url: `https://a.test/l${i}`, testata: 'T', sezione: 'geopolitica',
    livello: 'letture', tipo: 'analisi', lingua: 'it', immagine: null, minuti_lettura: null,
    pubblicato: new Date(adesso - (i + 1) * 3600_000).toISOString(),
  }));
  const esito = componi([{ ordine: 0, voci: [...voci].reverse() }], adesso);
  assert.equal(esito.voci.length, LETTURE_PER_FONTE);
  assert.equal(esito.oltreTetto, 5);
  assert.equal(esito.voci[0].id, 'l0');
  assert.ok(!esito.voci.some((v) => v.id === `l${LETTURE_PER_FONTE}`), 'restano fuori le più vecchie');
});
