// SEPA-betaalbestand (pain.001.001.03) voor overschrijvingen aan leveranciers.
//
// Het platform betaalt zelf niets. Het maakt alleen het bestand; de syndicus laadt het op in het
// bankprogramma van de VME en tekent daar. De betaling wordt pas geboekt wanneer ze op het
// bankafschrift (CODA) staat.
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// SEPA laat maar een beperkte tekenset toe: accenten weg, al de rest wordt een spatie.
export const sepaTekst = (s, max) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function geldigIban(iban) {
  const i = String(iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
  const cijfers = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0; for (const c of cijfers) rest = (rest * 10 + Number(c)) % 97;
  return rest === 1;
}
// Belgische gestructureerde mededeling: 12 cijfers, de laatste twee zijn de controle (mod 97, 0 wordt 97).
export function ogmCijfers(mededeling) {
  const c = String(mededeling ?? '').replace(/[^\d]/g, '');
  if (!/^\+{3}\d{3}\/\d{4}\/\d{5}\+{3}$/.test(String(mededeling ?? '').trim()) || c.length !== 12) return null;
  const controle = Number(BigInt(c.slice(0, 10)) % 97n) || 97;
  return controle === Number(c.slice(10)) ? c : null;
}
const bedrag = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

export function maakSepa({ id, moment, datum, debiteur, betalingen }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datum ?? ''))) throw new Error('Kies een uitvoeringsdatum.');
  if (!geldigIban(debiteur?.iban)) throw new Error('De rekening van de VME heeft geen geldig IBAN.');
  const naamVme = sepaTekst(debiteur.naam, 70); if (!naamVme) throw new Error('De naam van de VME ontbreekt.');
  if (!Array.isArray(betalingen) || !betalingen.length) throw new Error('Kies minstens één betaling.');
  if (betalingen.length > 500) throw new Error('Hoogstens 500 betalingen per bestand.');
  const regels = betalingen.map((b, nr) => {
    const naam = sepaTekst(b.naam, 70), iban = String(b.iban ?? '').replace(/\s+/g, '').toUpperCase(), som = Number(b.bedrag);
    if (!naam) throw new Error(`Betaling ${nr + 1}: de naam van de begunstigde ontbreekt.`);
    if (!geldigIban(iban)) throw new Error(`${naam}: geen geldig IBAN. Vul het in bij Leveranciers.`);
    if (!(som > 0) || som > 999999999 || Math.abs(som * 100 - Math.round(som * 100)) > 1e-6) throw new Error(`${naam}: het bedrag moet groter zijn dan 0 en hoogstens twee decimalen hebben.`);
    const ogm = ogmCijfers(b.mededeling), vrij = sepaTekst(b.mededeling, 140);
    if (!ogm && String(b.mededeling ?? '').includes('+++')) throw new Error(`${naam}: de gestructureerde mededeling klopt niet.`);
    return { naam, iban, som, ogm, vrij, ref: sepaTekst(b.ref || `${id}-${nr + 1}`, 35) };
  });
  const totaal = bedrag(regels.reduce((t, r) => t + Math.round(r.som * 100), 0) / 100), kenmerk = sepaTekst(id, 35), debIban = debiteur.iban.replace(/\s+/g, '').toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr><MsgId>${xml(kenmerk)}</MsgId><CreDtTm>${xml(moment)}</CreDtTm><NbOfTxs>${regels.length}</NbOfTxs><CtrlSum>${totaal}</CtrlSum><InitgPty><Nm>${xml(naamVme)}</Nm></InitgPty></GrpHdr>
    <PmtInf><PmtInfId>${xml(kenmerk)}-1</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>false</BtchBookg><NbOfTxs>${regels.length}</NbOfTxs><CtrlSum>${totaal}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${datum}</ReqdExctnDt>
      <Dbtr><Nm>${xml(naamVme)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${debIban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId>${debiteur.bic ? `<BIC>${xml(sepaTekst(debiteur.bic, 11).toUpperCase())}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}</FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>
${regels.map((r) => `      <CdtTrfTxInf><PmtId><EndToEndId>${xml(r.ref)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${bedrag(r.som)}</InstdAmt></Amt>
        <Cdtr><Nm>${xml(r.naam)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${r.iban}</IBAN></Id></CdtrAcct>
        ${r.ogm ? `<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry><Issr>BBA</Issr></Tp><Ref>${r.ogm}</Ref></CdtrRefInf></Strd></RmtInf>` : r.vrij ? `<RmtInf><Ustrd>${xml(r.vrij)}</Ustrd></RmtInf>` : ''}</CdtTrfTxInf>`).join('\n')}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
