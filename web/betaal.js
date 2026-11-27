// =============================================================================
// Syndexia Platform - leveranciers betalen met een SEPA-bestand (in het tabblad Bank).
//
// Toont wat de VME nog aan leveranciers moet, laat je kiezen wat je betaalt en maakt daar een
// SEPA-bestand van (sepa.mjs). Dat bestand laad je op in het bankprogramma van de VME en je
// tekent daar. Het platform betaalt zelf niets en boekt de betaling pas wanneer ze op het
// bankafschrift (CODA) staat.
// =============================================================================
const betaalVorigeBank = UIT.bind.bank;
UIT.bind.bank = async () => {
  await betaalVorigeBank();
  const v = S.vme, doel = document.getElementById('tabinhoud'); if (!doel || S.tab !== 'bank') return;
  let open, leveranciers, rekeningen;
  try {
    [open, leveranciers, rekeningen] = await Promise.all([
      q(sb.from('v_openstaand_leverancier').select('leverancier_id, naam, openstaand').eq('vme_id', v.id)),
      q(sb.from('leverancier').select('id, iban')),
      q(sb.from('bankrekening').select('id, iban, omschrijving, soort').eq('vme_id', v.id).order('iban')),
    ]);
  } catch (e) { return; }
  if (!document.body.contains(doel) || S.vme !== v || document.getElementById('sepa')) return;
  // dezelfde leverancier kan in meerdere boekjaren openstaan: per leverancier samentellen
  const per = new Map(); for (const o of open) { const nu = per.get(o.leverancier_id) ?? { id: o.leverancier_id, naam: o.naam, som: 0 }; nu.som += Number(o.openstaand); per.set(o.leverancier_id, nu); }
  const lijst = [...per.values()].filter((x) => Math.round(x.som * 100) > 0).sort((a, b) => a.naam.localeCompare(b.naam)), iban = Object.fromEntries(leveranciers.map((l) => [l.id, l.iban]));
  const morgen = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
  doel.insertAdjacentHTML('beforeend', `<div class="kaart" id="sepa"><h3 style="margin-top:0">Leveranciers betalen</h3>
    <p class="klein">Kies wat je wil betalen en maak een SEPA-bestand. Dat laad je op in het bankprogramma van de VME, waar je de betaling tekent. Het platform betaalt zelf niets; de betaling wordt geboekt zodra ze op een bankafschrift staat.</p>
    ${!lijst.length ? '<p class="leeg">Er staat niets open bij leveranciers.</p>' : !rekeningen.length ? '<p class="leeg">Voeg hierboven eerst de bankrekening van de VME toe.</p>' : `<form id="fsepa">
      ${tabel(['', 'Leverancier', 'IBAN', '#Bedrag', 'Mededeling'], lijst.map((x) => `<tr><td><input type="checkbox" name="kies" value="${x.id}" style="width:auto"${iban[x.id] ? ' checked' : ' disabled'} aria-label="${esc(x.naam)} betalen"></td>${cel(x.naam)}<td>${iban[x.id] ? esc(iban[x.id]) : '<span class="pil warn">geen IBAN</span>'}</td>
        <td class="n"><input name="b_${x.id}" type="number" step="0.01" min="0.01" value="${x.som.toFixed(2)}" style="width:110px;text-align:right" aria-label="Bedrag voor ${esc(x.naam)}"></td><td><input name="m_${x.id}" maxlength="140" placeholder="factuurnummer of +++…+++" aria-label="Mededeling voor ${esc(x.naam)}"></td></tr>`))}
      <div class="rij" style="margin-top:10px">${veld('Van rekening', kies('van', rekeningen.map((r) => `<option value="${r.id}">${esc(r.iban)}${r.omschrijving ? ` · ${esc(r.omschrijving)}` : ''}</option>`).join('')), '2 1 260px')}${veld('Uitvoeren op', inp('datum', `type="date" required value="${morgen}" min="${new Date().toLocaleDateString('sv-SE')}"`))}</div>
      <div id="sepauit"></div><p><button>SEPA-bestand maken</button></p>
      ${lijst.some((x) => !iban[x.id]) ? '<p class="klein">Een leverancier zonder IBAN kan je niet aanvinken. Vul het IBAN in bij Leveranciers op het startscherm.</p>' : ''}</form>`}</div>`);
  // Bankuittreksel als pdf (bv. KBC zonder CODA): de AI leest het, het platform rekent na, jij bekijkt het en leest in.
  document.getElementById('sepa').insertAdjacentHTML('beforebegin', `<div class="kaart" id="bankpdf"><h3 style="margin-top:0">Bankuittreksel als pdf inlezen</h3>
    <p class="klein">Geen CODA-bestand? Kies het uittreksel als pdf. De AI leest de bewegingen; het platform aanvaardt ze alleen als oud saldo plus alle bewegingen exact het nieuwe saldo geeft. Je ziet eerst wat gelezen is en leest dan pas in.</p>
    ${rekeningen.length ? '<input type="file" id="bankpdfkies" accept="application/pdf,.pdf"><div id="bankpdfuit"></div>' : '<p class="leeg">Voeg hierboven eerst de bankrekening van de VME toe.</p>'}</div>`);
  const pdfVak = document.getElementById('bankpdfkies');
  if (pdfVak) pdfVak.onchange = async () => { const bestand = pdfVak.files[0], uit = document.getElementById('bankpdfuit'); if (!bestand) return;
    try {
      if (bestand.size > 5 * 1024 * 1024) throw new Error('De pdf is te groot (hoogstens 5 MB).');
      uit.innerHTML = '<p class="klein">De AI leest het uittreksel… dit kan een halve minuut duren.</p>'; pdfVak.disabled = true;
      const bytes = new Uint8Array(await bestand.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const { data, error } = await sb.functions.invoke('bank-pdf', { body: { vme_id: v.id, base64: btoa(bin) } });
      if (error || data?.fout) { let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
      const a = data.afschrift;
      uit.innerHTML = `<div class="melding ok">Gelezen en nagerekend: ${a.bewegingen.length} beweging(en) op ${esc(a.iban)}. Saldo ${eur(a.saldoOud)} op ${dat(a.datumOud)} wordt ${eur(a.saldoNieuw)} op ${dat(a.datumNieuw)}.</div>
        ${tabel(['Datum', 'Tegenpartij', 'Mededeling', '#Bedrag'], a.bewegingen.map((b) => `<tr>${cel(dat(b.boekdatum))}${cel(b.naam)}${cel(b.ogm ?? b.mededeling)}${celN(b.bedrag)}</tr>`))}
        <p><button type="button" id="bankpdfin">Deze bewegingen inlezen</button> <button type="button" class="stil" id="bankpdfweg">Niet inlezen</button></p>`;
      document.getElementById('bankpdfweg').onclick = () => { uit.innerHTML = ''; pdfVak.value = ''; pdfVak.disabled = false; };
      document.getElementById('bankpdfin').onclick = async (ev) => { ev.target.disabled = true;
        try { const status = await q(sb.rpc('laad_afschrift', { p_vme: v.id, p_bron: bestand.name, p_afschrift: a })); S.bericht = { soort: 'ok', tekst: `${bestand.name}: afschrift ${status}${status === 'ingeladen' ? ` (${a.bewegingen.length} bewegingen)` : ''}.` }; }
        catch (e) { fout(e); } schermVme(); };
    } catch (e) { uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; pdfVak.value = ''; pdfVak.disabled = false; }
  };

  const f = document.getElementById('fsepa'); if (!f) return;
  f.onsubmit = async (ev) => { ev.preventDefault(); const uit = document.getElementById('sepauit');
    try {
      const { maakSepa } = await import('./sepa.mjs?v=0.27');
      const gekozen = [...f.querySelectorAll('[name=kies]:checked')].map((b) => lijst.find((x) => x.id === b.value));
      const van = rekeningen.find((r) => r.id === f.van.value), nu = new Date(), kenmerk = `SYN-${nu.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
      const bestand = maakSepa({ id: kenmerk, moment: nu.toISOString().slice(0, 19), datum: f.datum.value, debiteur: { naam: v.naam, iban: van.iban },
        betalingen: gekozen.map((x) => ({ naam: x.naam, iban: iban[x.id], bedrag: f[`b_${x.id}`].value, mededeling: f[`m_${x.id}`].value })) });
      const url = URL.createObjectURL(new Blob([bestand], { type: 'application/xml' })), a = document.createElement('a');
      a.href = url; a.download = `betalingen-${v.naam.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${f.datum.value}.xml`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      const totaal = gekozen.reduce((t, x) => t + Math.round(Number(f[`b_${x.id}`].value) * 100), 0) / 100;
      uit.innerHTML = `<div class="melding ok">Bestand gemaakt: ${gekozen.length} betaling(en), samen ${eur(totaal)}. Laad het op in het bankprogramma en teken daar.</div>`;
    } catch (e) { uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; }
  };
};
