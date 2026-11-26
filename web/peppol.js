// =============================================================================
// Syndexia Platform - Peppol-factuur (UBL 2.1) inlezen in het tabblad Kosten.
//
// Wat dit doet: een XML-factuur lezen, nagaan of ze voor deze VME is, de
// leverancier herkennen of aanmaken, een dubbele boeking tegenhouden en een
// boekingsvoorstel tonen. Heb je voor die leverancier al eens een rekening en
// sleutel laten onthouden (boekingsregel), dan staan die vooraf ingevuld.
// Wat dit niet doet: facturen ophalen van het Peppol-netwerk. Daarvoor is een
// erkend toegangspunt met contract nodig; hier upload je het bestand zelf.
// =============================================================================
const ublKind = (el, naam) => (el ? [...el.children].find((k) => k.localName === naam) : undefined);
const ublPad = (el, ...namen) => namen.reduce((e, n) => ublKind(e, n), el);
const ublTekst = (el, ...namen) => ublPad(el, ...namen)?.textContent.trim() || null;
// "BE 0841.763.030", "0841763030" of "841763030" -> "BE0841763030"
const ublOndNr = (ruw) => { const c = String(ruw ?? '').replace(/\D/g, ''); return c.length === 9 ? 'BE0' + c : c.length === 10 ? 'BE' + c : null; };

function leesUbl(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'), d = doc.documentElement;
  if (doc.querySelector('parsererror')) throw new Error('Dit bestand is geen geldige XML.');
  const soort = d.localName === 'Invoice' ? 'factuur' : d.localName === 'CreditNote' ? 'creditnota' : null;
  if (!soort) throw new Error('Geen UBL-factuur of -creditnota (verwacht <Invoice> of <CreditNote>).');
  const partij = (naam) => {
    const p = ublPad(d, naam, 'Party');
    const btw = p ? [...p.children].filter((k) => k.localName === 'PartyTaxScheme').map((t) => ublTekst(t, 'CompanyID')).find(Boolean) : null;
    return { naam: ublTekst(p, 'PartyLegalEntity', 'RegistrationName') ?? ublTekst(p, 'PartyName', 'Name'),
      ondernemingsnummer: ublOndNr(btw ?? ublTekst(p, 'PartyLegalEntity', 'CompanyID') ?? ublTekst(p, 'EndpointID')) };
  };
  const totaal = ublTekst(d, 'LegalMonetaryTotal', 'PayableAmount') ?? ublTekst(d, 'LegalMonetaryTotal', 'TaxInclusiveAmount');
  if (!ublTekst(d, 'ID') || !ublTekst(d, 'IssueDate') || totaal == null) throw new Error('Het UBL-document mist nummer, datum of totaal.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(totaal)) throw new Error(`Totaal "${totaal}" is geen bedrag met hoogstens twee decimalen.`);
  const betaling = ublKind(d, 'PaymentMeans'), mededeling = (ublTekst(betaling, 'PaymentID') ?? '').replace(/[^\d]/g, '');
  const lijnen = [...d.children].filter((k) => k.localName === (soort === 'factuur' ? 'InvoiceLine' : 'CreditNoteLine'));
  return {
    soort, nummer: ublTekst(d, 'ID'), datum: ublTekst(d, 'IssueDate'), vervaldatum: ublTekst(d, 'DueDate') ?? ublTekst(betaling, 'PaymentDueDate'),
    leverancier: { ...partij('AccountingSupplierParty'), iban: (ublTekst(betaling, 'PayeeFinancialAccount', 'ID') ?? '').replace(/\s/g, '').toUpperCase() || null },
    klant: partij('AccountingCustomerParty'), totaal, btw: ublTekst(ublKind(d, 'TaxTotal'), 'TaxAmount') ?? '0',
    ogm: geldigeOgm(mededeling) ? mededeling : null,
    lijnen: lijnen.map((l) => ({ omschrijving: ublTekst(l, 'Item', 'Name') ?? ublTekst(l, 'Item', 'Description'), bedrag: ublTekst(l, 'LineExtensionAmount') })),
  };
}

// Het tabblad Kosten uit app.js krijgt bovenaan een extra kaart.
UIT.fn.kosten = () => (S.bj && !S.bj.afgesloten ? `<div class="kaart"><h3 style="margin-top:0">Peppol-factuur inlezen</h3>
    <p class="klein">Kies het XML-bestand (UBL) van een factuur of creditnota. Je krijgt een boekingsvoorstel dat je nakijkt voor het geboekt wordt. Rappels en aanmaningen horen hier niet.</p>
    <input type="file" id="ubl" accept=".xml,text/xml,application/xml"><div id="ubluit"></div></div>` : '') + tabKosten();

UIT.bind.kosten = () => {
  bindKosten();
  const kiezer = document.getElementById('ubl'); if (!kiezer) return;
  const uit = document.getElementById('ubluit'), v = S.vme, d = S.d;
  const mis = (tekst) => { uit.innerHTML = `<div class="melding fout">${esc(tekst)}</div>`; };
  kiezer.onchange = async () => {
    const bestand = kiezer.files[0]; if (!bestand) return;
    try {
      const xml = await bestand.text();
      kiezer.value = '';   // zo kan je hetzelfde bestand daarna opnieuw kiezen
      const f = leesUbl(xml);
      if (!f.klant.ondernemingsnummer) return mis(`Factuur ${f.nummer}: geen ondernemingsnummer van de klant gevonden.`);
      if (f.klant.ondernemingsnummer !== v.ondernemingsnummer) return mis(`Factuur ${f.nummer} is gericht aan ${f.klant.ondernemingsnummer}${f.klant.naam ? ` (${f.klant.naam})` : ''}; deze VME heeft ${v.ondernemingsnummer ?? 'geen ondernemingsnummer'}.`);
      if (!f.leverancier.ondernemingsnummer) return mis(`Factuur ${f.nummer}: geen ondernemingsnummer van de leverancier gevonden.`);
      if (f.datum < S.bj.start_datum || f.datum > S.bj.eind_datum) return mis(`Factuur ${f.nummer} is van ${dat(f.datum)}; dat valt buiten boekjaar ${S.bj.omschrijving}. Kies het juiste boekjaar.`);
      // leverancier herkennen aan het ondernemingsnummer, anders aanmaken
      let [lev] = await q(sb.from('leverancier').select('id, naam').eq('ondernemingsnummer', f.leverancier.ondernemingsnummer));
      const nieuw = !lev;
      if (!lev) lev = await q(sb.from('leverancier').insert({ kantoor_id: S.kantoor.id, naam: f.leverancier.naam ?? f.leverancier.ondernemingsnummer, ondernemingsnummer: f.leverancier.ondernemingsnummer, iban: f.leverancier.iban }).select('id, naam').single());
      const dubbel = await q(sb.from('boeking').select('id').eq('vme_id', v.id).eq('leverancier_id', lev.id).eq('document_ref', f.nummer));
      if (dubbel.length) return mis(`Factuur ${f.nummer} van ${lev.naam} is al geboekt.`);
      const [regel] = await q(sb.from('boekingsregel').select('rekening_id, verdeelsleutel_id').eq('vme_id', v.id).eq('leverancier_id', lev.id));
      const bedrag = f.soort === 'creditnota' ? -Math.abs(Number(f.totaal)) : Number(f.totaal), btw = f.soort === 'creditnota' ? -Math.abs(Number(f.btw)) : Number(f.btw);
      const gekozen = (id, doel) => (id === doel ? ' selected' : '');
      uit.innerHTML = `<div class="melding">${esc(f.soort === 'factuur' ? 'Factuur' : 'Creditnota')} <b>${esc(f.nummer)}</b> van <b>${esc(lev.naam)}</b>${nieuw ? ' (nieuwe leverancier aangemaakt)' : ''} · ${dat(f.datum)} · <b>${eur(bedrag)}</b> waarvan btw ${eur(btw)}
          ${f.vervaldatum ? ` · vervalt ${dat(f.vervaldatum)}` : ''}${f.leverancier.iban ? ` · ${esc(f.leverancier.iban)}` : ''}${f.ogm ? ` · +++${f.ogm.slice(0, 3)}/${f.ogm.slice(3, 7)}/${f.ogm.slice(7)}+++` : ''}
          ${f.lijnen.length ? `<br><span class="klein">${esc(f.lijnen.map((l) => l.omschrijving).filter(Boolean).join(' · '))}</span>` : ''}</div>
        <form id="fu"><div class="rij">
          ${veld('Kostenrekening', kies('rekening', d.rekeningen.filter((r) => r.nummer.startsWith('6')).map((r) => `<option value="${r.id}"${gekozen(r.id, regel?.rekening_id)}>${esc(r.nummer)} ${esc(r.naam)}</option>`).join('')), '2 1 220px')}
          ${veld('Verdeelsleutel', kies('sleutel', d.sleutels.map((s) => `<option value="${s.id}"${gekozen(s.id, regel?.verdeelsleutel_id)}>${esc(s.code)} ${esc(s.naam)}</option>`).join('')))}
          ${veld('Periode', inp('oms', 'placeholder="bv. 11/2026"'))}</div>
          <p><label style="display:inline"><input type="checkbox" name="onthoud" style="width:auto"${regel ? ' checked' : ''}> Onthoud deze rekening en sleutel voor ${esc(lev.naam)}</label>${regel ? ' <span class="pil ok">voorstel uit boekingsregel</span>' : ''}</p>
          <p><button>Boeken</button></p></form>`;
      bijVerzenden('fu', async (formulier) => {
        const rek = d.rekeningen.find((r) => r.id === formulier.rekening.value), sleutel = d.sleutels.find((s) => s.id === formulier.sleutel.value);
        if (!rek || !sleutel) throw new Error('Kies een kostenrekening en een verdeelsleutel.');
        await zorgBasis();
        await q(sb.rpc('boek_aankoopfactuur', { p_boekjaar: S.bj.id, p_dagboek: 'A1', p_leverancier: lev.id, p_datum: f.datum, p_document_ref: f.nummer, p_omschrijving: lev.naam,
          p_lijnen: [{ rekening: rek.nummer, sleutel: sleutel.code, bedrag, btw, omschrijving: ofNull(formulier.oms.value) ?? f.lijnen[0]?.omschrijving ?? null }] }));
        if (formulier.onthoud.checked) await q(sb.from('boekingsregel').upsert({ kantoor_id: S.kantoor.id, vme_id: v.id, leverancier_id: lev.id, rekening_id: rek.id, verdeelsleutel_id: sleutel.id }, { onConflict: 'vme_id,leverancier_id' }));
        await naBoeking(`${f.soort === 'factuur' ? 'Factuur' : 'Creditnota'} ${f.nummer} geboekt: ${eur(bedrag)} op ${rek.nummer}, sleutel ${sleutel.code}.`);
      });
    } catch (e) { mis(e.message); }
  };
};
