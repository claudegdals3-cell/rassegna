// Regole di composizione dell'elenco unico (punto 7 delle specifiche):
// età massima per livello, eliminazione dei doppioni, ordine cronologico inverso.

const ORA = 60 * 60 * 1000;
export const ETA_MASSIMA = {
  notizie: 48 * ORA,
  letture: 30 * 24 * ORA,
};
// Tolleranza per gli orologi non allineati delle testate.
const ANTICIPO_TOLLERATO = 24 * ORA;

// Una voce senza data non può essere confrontata con l'età massima: è scartata.
export function entroEta(voce, adesso) {
  if (!voce.pubblicato) return false;
  const eta = adesso - Date.parse(voce.pubblicato);
  if (Number.isNaN(eta)) return false;
  return eta <= ETA_MASSIMA[voce.livello] && eta >= -ANTICIPO_TOLLERATO;
}

// Tra due voci con lo stesso indirizzo resta quella della fonte di sezione
// rispetto a quella generale (attualità); a parità, quella della fonte che
// viene prima in fonti.json. I campi mancanti si completano con l'altra.
function preferita(a, b) {
  const generaleA = a.sezione === 'attualita';
  const generaleB = b.sezione === 'attualita';
  if (generaleA !== generaleB) return generaleA ? [b, a] : [a, b];
  return a.ordine <= b.ordine ? [a, b] : [b, a];
}

// `gruppi` è un elenco di { ordine, voci }, uno per fonte.
export function componi(gruppi, adesso = Date.now()) {
  const perIndirizzo = new Map();
  let doppioni = 0;
  let fuoriEta = 0;

  for (const { ordine, voci } of gruppi) {
    for (const voce of voci) {
      if (!entroEta(voce, adesso)) {
        fuoriEta += 1;
        continue;
      }
      const nuova = { ...voce, ordine };
      const presente = perIndirizzo.get(voce.id);
      if (!presente) {
        perIndirizzo.set(voce.id, nuova);
        continue;
      }
      doppioni += 1;
      const [tenuta, scartata] = preferita(presente, nuova);
      perIndirizzo.set(voce.id, {
        ...tenuta,
        estratto: tenuta.estratto || scartata.estratto,
        immagine: tenuta.immagine || scartata.immagine,
        minuti_lettura: tenuta.minuti_lettura ?? scartata.minuti_lettura,
      });
    }
  }

  const voci = [...perIndirizzo.values()]
    .sort((a, b) => Date.parse(b.pubblicato) - Date.parse(a.pubblicato) || a.ordine - b.ordine)
    .map(({ ordine, ...voce }) => voce);

  return { voci, doppioni, fuoriEta };
}
