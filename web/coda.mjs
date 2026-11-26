// =============================================================================
// Leest een CODA-bestand (gecodeerd rekeninguittreksel, Febelfin-standaard 2.x).
//
// Een CODA-bestand bestaat uit regels van exact 128 tekens. Het eerste teken
// zegt wat de regel is:
//   0  kop                         8  nieuw saldo
//   1  oud saldo                   9  slotregel met controletotalen
//   2  beweging, in drie delen: 21 (bedrag, datum, mededeling), 22 (vervolg
//      mededeling, BIC), 23 (rekening en naam van de tegenpartij)
//   3  bijkomende informatie bij een beweging
// Elk veld staat op een vaste positie. De posities hieronder komen uit de
// officiële standaard (Febelfin, "Coded statement of account", versie 2.6).
//
// Bedragen staan als 15 cijfers zonder komma: 12 voor de komma, 3 erna.
// Teken 0 = credit (geld komt binnen), 1 = debet (geld gaat buiten).
//
// Strikt: de lezer controleert zelf of het bestand klopt
//   oud saldo + alle bewegingen = nieuw saldo
//   aantal regels en debet-/credittotaal = wat de slotregel zegt
// en stopt met een duidelijke fout als dat niet zo is. Een bestand dat niet
// sluit, komt de boekhouding niet binnen.
// =============================================================================

// stuk(regel, 6, 42) = posities 6 tot en met 42, geteld vanaf 1 zoals in de standaard
const stuk = (regel, van, tot) => regel.slice(van - 1, tot);

// 15 cijfers (12 + 3 decimalen) -> gehele centen. Een derde decimaal die niet 0 is, weigeren we.
function centen(veld, context) {
  if (!/^\d{15}$/.test(veld)) throw new Error(`${context}: bedrag "${veld}" is geen 15 cijfers`);
  if (veld[14] !== '0') throw new Error(`${context}: bedrag met duizendsten van een euro wordt niet ondersteund`);
  return Number(veld.slice(0, 14));
}
const metTeken = (teken, c, context) => {
  if (teken !== '0' && teken !== '1') throw new Error(`${context}: onbekend teken "${teken}" (verwacht 0 of 1)`);
  return teken === '1' ? -c : c;
};
// DDMMJJ -> JJJJ-MM-DD; 000000 = onbekend
function datum(veld, context) {
  if (veld === '000000') return null;
  if (!/^\d{6}$/.test(veld)) throw new Error(`${context}: datum "${veld}" is niet DDMMJJ`);
  return `20${veld.slice(4, 6)}-${veld.slice(2, 4)}-${veld.slice(0, 2)}`;
}
export const alsBedrag = (c) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`;

// Belgische gestructureerde mededeling: 12 cijfers, laatste 2 = eerste 10 modulo 97 (0 wordt 97).
export function geldigeOgm(t) {
  if (!/^\d{12}$/.test(t)) return false;
  const rest = Number(BigInt(t.slice(0, 10)) % 97n) || 97;
  return rest === Number(t.slice(10));
}
function zoekOgm(type, zone) {
  if (type === '1' && /^10[12]\d{12}/.test(zone)) return zone.slice(3, 15);   // 101/102 = Belgische gestructureerde mededeling
  const kaal = zone.trim().replace(/^\+{3}(\d{3})\/(\d{4})\/(\d{5})\+{3}$/, '$1$2$3');
  return geldigeOgm(kaal) ? kaal : null;
}

export function leesCoda(tekst) {
  const regels = tekst.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.length > 0);
  const afschriften = [];
  let a = null;        // afschrift in opbouw
  let huidig = null;   // beweging waar 22/23/3x-regels bij horen (null bij een detailregel)
  let geteld = 0;      // regels tussen kop en slot, voor de controle met regel 9

  regels.forEach((regel, i) => {
    const ctx = `regel ${i + 1}`;
    if (regel.length !== 128) throw new Error(`${ctx}: ${regel.length} tekens in plaats van 128`);
    const soort = regel[0] === '2' || regel[0] === '3' ? regel.slice(0, 2) : regel[0];
    if (soort !== '0' && soort !== '9') geteld++;
    if (soort !== '0' && soort !== '1' && !a) throw new Error(`${ctx}: regel ${soort} zonder voorafgaand oud saldo (regel 1)`);

    switch (soort) {
      case '0':
        geteld = 0;
        break;

      case '1': {
        const structuur = regel[1];
        if (structuur !== '2' && structuur !== '3') {
          throw new Error(`${ctx}: rekeningstructuur ${structuur} (geen IBAN) wordt niet ondersteund`);
        }
        const zone = stuk(regel, 6, 42);
        a = {
          iban: zone.slice(0, 34).trim(), munt: zone.slice(34, 37),
          volgnummer: Number(stuk(regel, 3, 5)),
          saldoOud: metTeken(regel[42], centen(stuk(regel, 44, 58), ctx), ctx), datumOud: datum(stuk(regel, 59, 64), ctx),
          houder: stuk(regel, 65, 90).trim(), omschrijving: stuk(regel, 91, 125).trim(),
          bewegingen: [], detailregels: 0,
        };
        huidig = null;
        break;
      }

      case '21': {
        // Detailnummer 0000 = de beweging zelf. Hogere nummers zijn de opsplitsing
        // van een gegroepeerde beweging en tellen niet opnieuw mee in het saldo.
        if (stuk(regel, 7, 10) !== '0000') { a.detailregels++; huidig = null; break; }
        const type = regel[61], zone = stuk(regel, 63, 115);
        huidig = {
          volgnummer: Number(stuk(regel, 3, 6)), bankreferentie: stuk(regel, 11, 31).trim(),
          centen: metTeken(regel[31], centen(stuk(regel, 33, 47), ctx), ctx),
          valutadatum: datum(stuk(regel, 48, 53), ctx), boekdatum: datum(stuk(regel, 116, 121), ctx),
          transactiecode: stuk(regel, 54, 61), ogm: zoekOgm(type, zone),
          mededeling: zone, tegenpartij: { naam: null, rekening: null, bic: null }, info: [],
        };
        a.bewegingen.push(huidig);
        break;
      }
      case '22':
        if (huidig) { huidig.mededeling += stuk(regel, 11, 63); huidig.tegenpartij.bic = stuk(regel, 99, 109).trim() || null; }
        break;
      case '23':
        if (huidig) {
          huidig.tegenpartij.rekening = stuk(regel, 11, 44).trim() || null;
          huidig.tegenpartij.naam = stuk(regel, 48, 82).trim() || null;
          huidig.mededeling += stuk(regel, 83, 125);
        }
        break;
      case '31': if (huidig) huidig.info.push(stuk(regel, 41, 113).trim()); break;
      case '32': if (huidig) huidig.info.push(stuk(regel, 11, 115).trim()); break;
      case '33': if (huidig) huidig.info.push(stuk(regel, 11, 100).trim()); break;

      case '8': {
        a.saldoNieuw = metTeken(regel[41], centen(stuk(regel, 43, 57), ctx), ctx);
        a.datumNieuw = datum(stuk(regel, 58, 63), ctx);
        const som = a.bewegingen.reduce((t, b) => t + b.centen, 0);
        if (a.saldoOud + som !== a.saldoNieuw) {
          throw new Error(`${ctx}: afschrift ${a.volgnummer} sluit niet: oud saldo ${alsBedrag(a.saldoOud)} + bewegingen ${alsBedrag(som)} = ${alsBedrag(a.saldoOud + som)}, maar nieuw saldo is ${alsBedrag(a.saldoNieuw)}`);
        }
        break;
      }

      case '9': {
        const debet = a.bewegingen.filter((b) => b.centen < 0).reduce((t, b) => t - b.centen, 0);
        const credit = a.bewegingen.filter((b) => b.centen > 0).reduce((t, b) => t + b.centen, 0);
        if (Number(stuk(regel, 17, 22)) !== geteld) throw new Error(`${ctx}: slotregel meldt ${Number(stuk(regel, 17, 22))} regels, bestand heeft er ${geteld}`);
        if (centen(stuk(regel, 23, 37), ctx) !== debet) throw new Error(`${ctx}: debettotaal in de slotregel klopt niet met de bewegingen`);
        if (centen(stuk(regel, 38, 52), ctx) !== credit) throw new Error(`${ctx}: credittotaal in de slotregel klopt niet met de bewegingen`);
        if (a.saldoNieuw === undefined) throw new Error(`${ctx}: slotregel zonder nieuw saldo (regel 8)`);
        for (const b of a.bewegingen) b.mededeling = b.mededeling.replace(/\s+/g, ' ').trim() || null;
        afschriften.push(a);
        a = null; huidig = null;
        break;
      }
      default:
        throw new Error(`${ctx}: onbekende regelsoort "${soort}"`);
    }
  });
  if (a) throw new Error('bestand eindigt zonder slotregel (regel 9)');
  if (afschriften.length === 0) throw new Error('geen afschrift gevonden in het bestand');
  return afschriften;
}
