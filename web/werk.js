// =============================================================================
// Syndexia Platform - dossiers, taken en de leveranciersfiche.
//
// DOSSIER   één zaak in een VME (schade, herstelling, onderhoud…). Elk dossier heeft een
//           tijdlijn van notities (een logboek: toevoegen kan, wijzigen niet) en eigen taken.
// TAAK      iets wat iemand moet doen tegen een datum. Staat op het startscherm zolang ze
//           open is; #/taken toont alles.
// LEVERANCIER  de pagina #/leveranciers toont nu per leverancier een fiche met
//           contactgegevens, wat nog te betalen is en de open dossiers.
// =============================================================================
const DOSSIER_SOORT = ['schade', 'herstelling', 'onderhoud', 'administratie', 'juridisch', 'andere'];
const DOSSIER_STATUS = ['open', 'in behandeling', 'wacht op derde', 'afgesloten'];
const LEV_CATEGORIE = ['aannemer', 'loodgieter', 'elektricien', 'lift', 'schoonmaak', 'tuin', 'verzekering', 'nutsvoorziening', 'brandbeveiliging', 'keuring', 'notaris of advocaat', 'andere'];
const werkOpties = (lijst, gekozen, leeg) => (leeg == null ? '' : `<option value="">${esc(leeg)}</option>`) + lijst.map((o) => { const [w, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(w)}"${w === gekozen ? ' selected' : ''}>${esc(t)}</option>`; }).join('');
const werkTijd = (t) => new Date(t).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
const werkLaat = (taak) => !taak.klaar_op && taak.vervaldatum && taak.vervaldatum < new Date().toISOString().slice(0, 10);
async function werkLeden() { return (S.leden ??= await q(sb.rpc('kantoor_leden'))); }
const werkWie = (leden, id) => (id ? (leden.find((l) => l.user_id === id)?.email ?? 'onbekend').split('@')[0] : '');
const taakRij = (t, leden, extra = '') => `<tr${t.klaar_op ? ' style="opacity:.55"' : ''}><td><input type="checkbox" data-taak="${t.id}" style="width:auto"${t.klaar_op ? ' checked' : ''} title="Klaar"></td>
  <td>${esc(t.titel)}${t.omschrijving ? `<br><span class="klein">${esc(t.omschrijving)}</span>` : ''}</td>${extra}<td>${t.vervaldatum ? `${dat(t.vervaldatum)}${werkLaat(t) ? ' <span class="pil fout">te laat</span>' : ''}` : ''}</td>${cel(werkWie(leden, t.toegewezen_aan))}</tr>`;
// Vinkje bij een taak: klaar of terug open. "na" tekent het scherm opnieuw.
function bindTaken(wortel, na) {
  wortel.querySelectorAll('[data-taak]').forEach((vink) => { vink.onchange = async () => {
    try { await q(sb.from('taak').update({ klaar_op: vink.checked ? new Date().toISOString() : null }).eq('id', vink.dataset.taak)); } catch (e) { fout(e); }
    na();
  }; });
}

// ---- tabblad Dossiers ---------------------------------------------------------------
UIT.tabs.push(['dossiers', 'Dossiers']);
UIT.fn.dossiers = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.dossiers = async () => {
  const v = S.vme, d = S.d, doel = document.getElementById('tabinhoud');
  let dossiers, notities = [], taken, leden, mails = [];
  try {
    [dossiers, taken, leden] = await Promise.all([
      q(sb.from('dossier').select('id, nummer, titel, soort, status, omschrijving, kavel_id, leverancier_id, geopend_op, afgesloten_op, bron, categorie, dringend, melder_naam, melder_contact, melder_plaats, ai_samenvatting, gevraagd_aan, aanvaard_op').eq('vme_id', v.id).order('nummer', { ascending: false })),
      q(sb.from('taak').select('id, dossier_id, titel, omschrijving, vervaldatum, toegewezen_aan, klaar_op').eq('vme_id', v.id).order('vervaldatum')),
      werkLeden(),
    ]);
    if (dossiers.length) notities = await q(sb.from('dossier_notitie').select('dossier_id, tekst, auteur, aangemaakt_op').in('dossier_id', dossiers.map((x) => x.id)).order('aangemaakt_op'));
    // Gesprekken uit de mailbox die aan een dossier hangen (alleen de verwijzing; de mail zelf staat in Gmail).
    if (dossiers.length) { try { mails = await q(sb.from('dossier_mail').select('id, dossier_id, gmail_id, van, onderwerp, datum').in('dossier_id', dossiers.map((x) => x.id)).order('datum')); } catch (e) { mails = []; } }
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;
  const kavelOpt = d.kavels.map((k) => [k.id, k.kavelnummer]), levOpt = d.leveranciers.map((l) => [l.id, l.naam]), ledenOpt = leden.map((l) => [l.user_id, l.email]);
  const toon1 = dossiers.filter((x) => S.dossierAlle || x.status !== 'afgesloten'), nDicht = dossiers.filter((x) => x.status === 'afgesloten').length;
  const pil = (s) => `<span class="pil ${s === 'afgesloten' ? 'ok' : s === 'wacht op derde' ? 'warn' : ''}">${esc(s)}</span>`;

  doel.innerHTML = `${UIT.meldKaart ? UIT.meldKaart() : ''}<div class="kaart"><details${dossiers.length ? '' : ' open'}><summary style="cursor:pointer;font-weight:600">+ Nieuw dossier</summary>
      <form id="fdn" style="margin-top:10px"><div class="rij">${veld('Titel', inp('titel', 'required placeholder="bv. Waterinsijpeling dak"'), '3 1 260px')}${veld('Soort', kies('soort', werkOpties(DOSSIER_SOORT, 'herstelling')))}</div>
        <div class="rij">${veld('Kavel (als het één kavel betreft)', kies('kavel', werkOpties(kavelOpt, null, 'gemene delen')))}${veld('Leverancier', kies('lev', werkOpties(levOpt, null, 'nog geen')))}</div>
        <label>Omschrijving</label><textarea name="omschrijving" rows="3" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit"></textarea>
        <p><button>Dossier openen</button></p></form></details></div>
    ${toon1.map((x) => { const tk = taken.filter((t) => t.dossier_id === x.id), nt = notities.filter((n) => n.dossier_id === x.id), nOpen = tk.filter((t) => !t.klaar_op).length;
      return `<div class="kaart"><details class="dossier" data-id="${x.id}"${S.dossierOpen === x.id ? ' open' : ''}>
        <summary style="cursor:pointer"><b>#${x.nummer} ${esc(x.titel)}</b> ${pil(x.status)}${x.dringend ? ' <span class="pil fout">dringend</span>' : ''}${x.bron === 'qr' ? ' <span class="pil">QR-melding</span>' : ''} <span class="klein">${esc(x.soort)} · geopend ${dat(x.geopend_op)}${x.afgesloten_op ? ` · afgesloten ${dat(x.afgesloten_op)}` : ''}${nOpen ? ` · ${nOpen} open taak${nOpen === 1 ? '' : 'en'}` : ''}</span></summary>
        ${x.bron === 'qr' ? `<p class="klein">Gemeld door <b>${esc(x.melder_naam)}</b> (${esc(x.melder_contact)})${x.melder_plaats ? ` · ${esc(x.melder_plaats)}` : ''}${x.categorie ? ` · ${esc(x.categorie)}` : ''}</p>
          ${x.gevraagd_aan ? `<p class="klein">Vraag tot interventie verstuurd naar ${esc(d.leveranciers.find((l) => l.id === x.gevraagd_aan)?.naam ?? 'leverancier')}: ${x.aanvaard_op ? `<span class="pil ok">aangenomen op ${werkTijd(x.aanvaard_op)}</span>` : '<span class="pil warn">nog niet aangenomen</span>'}</p>` : ''}
          ${x.ai_samenvatting ? `<p class="klein"><b>Samenvatting AI:</b> ${esc(x.ai_samenvatting)}</p>` : ''}` : ''}
        ${x.omschrijving ? `<p style="white-space:pre-wrap">${esc(x.omschrijving)}</p>` : ''}
        ${mails.some((m) => m.dossier_id === x.id) ? `<div class="dmails"><b>Mails</b>${mails.filter((m) => m.dossier_id === x.id).map((m) => `<p><a href="#/mailbox/mail/${esc(m.gmail_id)}">${esc(m.onderwerp || '(geen onderwerp)')}</a> <span class="klein">${esc((/^\s*"?([^"<]*?)"?\s*</.exec(m.van ?? '')?.[1] || m.van || '').trim())}${m.datum ? ` · ${dat(m.datum)}` : ''}</span> <button type="button" class="stil" data-maillos="${m.id}" title="Dit gesprek van het dossier ontkoppelen">Ontkoppelen</button></p>`).join('')}</div>` : ''}
        <form class="fds" data-id="${x.id}"><div class="rij">${veld('Status', kies('status', werkOpties(DOSSIER_STATUS, x.status)))}${veld('Soort', kies('soort', werkOpties(DOSSIER_SOORT, x.soort)))}${veld('Kavel', kies('kavel', werkOpties(kavelOpt, x.kavel_id, 'gemene delen')))}${veld('Leverancier', kies('lev', werkOpties(levOpt, x.leverancier_id, 'nog geen')))}</div>
          <p><button class="stil">Wijziging opslaan</button></p></form>
        ${x.status === 'afgesloten' ? '' : `<details><summary style="cursor:pointer;font-weight:600">Werkopdracht sturen naar een leverancier</summary>
          <form class="fwo" data-id="${x.id}" style="margin-top:8px"><div class="rij">${veld('Leverancier', kies('lev', werkOpties(levOpt, x.gevraagd_aan ?? x.leverancier_id, 'kies')), '2 1 220px')}</div>
            <label>Opdracht</label><textarea name="bericht" rows="3" required maxlength="3000" placeholder="Wat moet er gebeuren? Het adres van het gebouw en de link om aan te nemen komen er vanzelf bij." style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit"></textarea>
            <p><button>Opdracht mailen</button> <button type="button" class="stil" data-wa>Klaarzetten in WhatsApp</button></p>
            <p class="klein">De leverancier krijgt een link om de opdracht aan te nemen; dat zie je daarna hier in het dossier. Bij WhatsApp opent het gesprek met de tekst ingevuld en verstuur je zelf.</p></form></details>`}
        <h4>Taken</h4>${tk.length ? tabel(['', 'Taak', 'Tegen', 'Voor'], tk.map((t) => taakRij(t, leden))) : '<p class="leeg">Nog geen taken.</p>'}
        <form class="fdt" data-id="${x.id}"><div class="rij">${veld('Nieuwe taak', inp('titel', 'required'), '3 1 220px')}${veld('Tegen', inp('verval', 'type="date"'))}${veld('Voor', kies('wie', werkOpties(ledenOpt, null, 'niemand')))}<div style="align-self:flex-end"><button class="stil">Toevoegen</button></div></div></form>
        <h4>Tijdlijn</h4>${nt.length ? nt.map((n) => `<p style="margin:6px 0"><span class="klein">${werkTijd(n.aangemaakt_op)} · ${esc(werkWie(leden, n.auteur))}</span><br><span style="white-space:pre-wrap">${esc(n.tekst)}</span></p>`).join('') : '<p class="leeg">Nog geen notities.</p>'}
        <form class="fdo" data-id="${x.id}"><textarea name="tekst" rows="2" required placeholder="Wat is er gebeurd of afgesproken?" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit"></textarea>
          <p><button class="stil">Notitie toevoegen</button></p></form></details></div>`; }).join('') || `<div class="kaart"><p class="leeg">${dossiers.length ? 'Geen open dossiers.' : 'Nog geen dossiers voor deze VME.'}</p></div>`}
    ${nDicht ? `<p><label style="display:inline"><input type="checkbox" id="dalle" style="width:auto"${S.dossierAlle ? ' checked' : ''}> Ook de ${nDicht} afgesloten dossier(s) tonen</label></p>` : ''}`;

  const opnieuw = () => schermVme();
  doel.querySelectorAll('details.dossier').forEach((el) => { el.ontoggle = () => { if (el.open) S.dossierOpen = el.dataset.id; else if (S.dossierOpen === el.dataset.id) S.dossierOpen = null; }; });
  doel.querySelectorAll('[data-maillos]').forEach((b) => { b.onclick = async () => { S.dossierOpen = b.closest('details.dossier')?.dataset.id ?? S.dossierOpen; try { await q(sb.from('dossier_mail').delete().eq('id', b.dataset.maillos)); S.bericht = { soort: 'ok', tekst: 'Het gesprek is ontkoppeld. De mail zelf blijft in de mailbox.' }; } catch (e) { fout(e); } opnieuw(); }; });
  const alle = document.getElementById('dalle'); if (alle) alle.onchange = () => { S.dossierAlle = alle.checked; opnieuw(); };
  const stuur = (selector, werk) => doel.querySelectorAll(selector).forEach((f) => { f.onsubmit = async (ev) => {
    ev.preventDefault(); if (f.dataset.id) S.dossierOpen = f.dataset.id;
    try { await werk(f); } catch (e) { fout(e); }
    opnieuw();
  }; });
  stuur('#fdn', async (f) => {
    const [nieuw] = await q(sb.from('dossier').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, titel: f.titel.value.trim(), soort: f.soort.value, kavel_id: ofNull(f.kavel.value), leverancier_id: ofNull(f.lev.value), omschrijving: ofNull(f.omschrijving.value) }).select('id, nummer'));
    S.dossierOpen = nieuw.id; S.bericht = { soort: 'ok', tekst: `Dossier #${nieuw.nummer} geopend.` };
  });
  stuur('form.fds', async (f) => { await q(sb.from('dossier').update({ status: f.status.value, soort: f.soort.value, kavel_id: ofNull(f.kavel.value), leverancier_id: ofNull(f.lev.value) }).eq('id', f.dataset.id)); S.bericht = { soort: 'ok', tekst: 'Dossier bijgewerkt.' }; });
  stuur('form.fdt', async (f) => { await q(sb.from('taak').insert({ kantoor_id: S.kantoor.id, dossier_id: f.dataset.id, titel: f.titel.value.trim(), vervaldatum: ofNull(f.verval.value), toegewezen_aan: ofNull(f.wie.value) })); });
  stuur('form.fdo', async (f) => { await q(sb.from('dossier_notitie').insert({ kantoor_id: S.kantoor.id, dossier_id: f.dataset.id, tekst: f.tekst.value.trim() })); });
  // werkopdracht: de functie zet de aanvaardlink in het dossier en verstuurt de mail (of geeft de WhatsApp-link terug)
  const werkopdracht = async (f, kanaal) => {
    if (!f.lev.value) throw new Error('Kies een leverancier.');
    if (!f.bericht.value.trim()) throw new Error('Schrijf wat de leverancier moet doen.');
    const { data, error } = await sb.functions.invoke('werkopdracht', { body: { dossier_id: f.dataset.id, leverancier_id: f.lev.value, bericht: f.bericht.value, kanaal } });
    if (error || data?.fout) { let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
    return data;
  };
  stuur('form.fwo', async (f) => { const uit = await werkopdracht(f, 'mail'); S.bericht = { soort: 'ok', tekst: `Werkopdracht gemaild naar ${uit.naar}.` }; });
  doel.querySelectorAll('form.fwo [data-wa]').forEach((b) => { b.onclick = async () => {
    const f = b.closest('form'), venster = window.open('', '_blank');   // venster meteen openen: na het wachten blokkeert de browser het
    try { const uit = await werkopdracht(f, 'whatsapp'); if (venster) venster.location = uit.whatsapp; else location.href = uit.whatsapp; S.bericht = { soort: 'ok', tekst: `WhatsApp-bericht voor ${uit.naar} staat klaar. Verstuur het in WhatsApp.` }; }
    catch (e) { if (venster) venster.close(); fout(e); }
    opnieuw();
  }; });
  bindTaken(doel, opnieuw);
  if (UIT.meldBind) UIT.meldBind(doel, opnieuw);
};

// ---- startscherm: open taken ----------------------------------------------------------
UIT.vandaag.push('<p><a class="knop licht" href="#/taken">Taken</a></p>', '<div id="taken-start"></div>');
(UIT.naVandaag ??= []).push(async () => {
  const doel = document.getElementById('taken-start'); if (!doel) return;
  try {
    const [taken, leden, vmes] = await Promise.all([
      q(sb.from('taak').select('id, vme_id, titel, omschrijving, vervaldatum, toegewezen_aan, klaar_op').is('klaar_op', null).order('vervaldatum').limit(8)),
      werkLeden(), q(sb.from('vme').select('id, naam')),
    ]);
    if (!document.body.contains(doel)) return;
    const naam = Object.fromEntries(vmes.map((x) => [x.id, x.naam]));
    doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Open taken <a href="#/taken" class="klein" style="font-weight:400">alle taken en nieuwe taak →</a></h3>
      ${taken.length ? tabel(['', 'Taak', 'VME', 'Tegen', 'Voor'], taken.map((t) => taakRij(t, leden, cel(naam[t.vme_id] ?? '')))) : '<p class="leeg">Geen open taken.</p>'}</div>`;
    bindTaken(doel, () => schermVandaag());
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; }
});

// ---- pagina: alle taken ---------------------------------------------------------------
UIT.routes.taken = async () => {
  const [taken, leden, vmes, dossiers] = await Promise.all([
    q(sb.from('taak').select('id, vme_id, dossier_id, titel, omschrijving, vervaldatum, toegewezen_aan, klaar_op').order('vervaldatum')),
    werkLeden(), q(sb.from('vme').select('id, naam').order('naam')), q(sb.from('dossier').select('id, nummer, titel')),
  ]);
  const naam = Object.fromEntries(vmes.map((x) => [x.id, x.naam])), dos = Object.fromEntries(dossiers.map((x) => [x.id, `#${x.nummer} ${x.titel}`]));
  const lijst = taken.filter((t) => S.takenAlle || !t.klaar_op), nKlaar = taken.filter((t) => t.klaar_op).length;
  toon(`${terug}<div class="kaart"><h2>Taken</h2>
    ${lijst.length ? tabel(['', 'Taak', 'VME', 'Dossier', 'Tegen', 'Voor'], lijst.map((t) => taakRij(t, leden, cel(naam[t.vme_id] ?? '') + cel(dos[t.dossier_id] ?? '')))) : '<p class="leeg">Geen open taken.</p>'}
    ${nKlaar ? `<p><label style="display:inline"><input type="checkbox" id="talle" style="width:auto"${S.takenAlle ? ' checked' : ''}> Ook de ${nKlaar} afgewerkte taak/taken tonen</label></p>` : ''}
    <h3>Nieuwe taak</h3>
    <form id="ftn"><div class="rij">${veld('Taak', inp('titel', 'required'), '3 1 240px')}${veld('VME', kies('vme', werkOpties(vmes.map((x) => [x.id, x.naam]), null, 'geen')))}${veld('Tegen', inp('verval', 'type="date"'))}${veld('Voor', kies('wie', werkOpties(leden.map((l) => [l.user_id, l.email]), S.sessie.user.id, 'niemand')))}</div>
      <label>Toelichting</label><input name="omschrijving"><p><button>Taak toevoegen</button></p></form></div>`);
  const alle = document.getElementById('talle'); if (alle) alle.onchange = () => { S.takenAlle = alle.checked; UIT.routes.taken(); };
  bindTaken(document, () => UIT.routes.taken());
  bijVerzenden('ftn', async (f) => {
    await q(sb.from('taak').insert({ kantoor_id: S.kantoor.id, titel: f.titel.value.trim(), vme_id: ofNull(f.vme.value), vervaldatum: ofNull(f.verval.value), toegewezen_aan: ofNull(f.wie.value), omschrijving: ofNull(f.omschrijving.value) }));
    S.bericht = { soort: 'ok', tekst: 'Taak toegevoegd.' };
    await UIT.routes.taken();
  }, UIT.routes.taken);
};

// ---- pagina: leveranciers met fiche (vervangt de eenvoudige lijst uit beheer.js) ------
UIT.routes.leveranciers = async () => {
  const [lijst, open, dossiers, vmes] = await Promise.all([
    q(sb.from('leverancier').select('id, naam, ondernemingsnummer, iban, categorie, contactpersoon, email, telefoon, adres_straat, postcode, gemeente, notitie').order('naam')),
    q(sb.from('v_openstaand_leverancier').select('leverancier_id, vme_id, openstaand')),
    q(sb.from('dossier').select('id, nummer, titel, vme_id, leverancier_id, status').neq('status', 'afgesloten')),
    q(sb.from('vme').select('id, naam')),
  ]);
  const naam = Object.fromEntries(vmes.map((x) => [x.id, x.naam]));
  toon(`${terug}<div class="kaart"><h2>Leveranciers</h2>
    <p class="klein">Leveranciers zijn gedeeld door alle VME's van het kantoor. Klik op een naam voor de fiche.</p>
    ${lijst.map((l) => { const schuld = som(open.filter((o) => o.leverancier_id === l.id), (o) => o.openstaand), ds = dossiers.filter((x) => x.leverancier_id === l.id);
      return `<details class="lev" data-id="${l.id}"${S.levOpen === l.id ? ' open' : ''} style="border-top:1px solid var(--l);padding:8px 0">
      <summary style="cursor:pointer"><b>${esc(l.naam)}</b> <span class="klein">${esc([l.categorie, l.telefoon, l.email].filter(Boolean).join(' · ') || 'geen contactgegevens')}${schuld ? ` · nog te betalen ${eur(schuld)}` : ''}${ds.length ? ` · ${ds.length} open dossier(s)` : ''}</span></summary>
      ${ds.length ? `<p class="klein">Open dossiers: ${ds.map((x) => `<a href="#/vme/${x.vme_id}/dossiers">${esc(naam[x.vme_id] ?? '')} #${x.nummer} ${esc(x.titel)}</a>`).join(' · ')}</p>` : ''}
      <form class="flf" data-id="${l.id}" style="margin-top:8px">
        <div class="rij">${veld('Naam', inp('naam', `required value="${esc(l.naam)}"`), '2 1 220px')}${veld('Categorie', kies('categorie', werkOpties([...new Set([...LEV_CATEGORIE, ...(l.categorie ? [l.categorie] : [])])], l.categorie, 'geen')))}${veld('Ondernemingsnummer', inp('ond', `value="${esc(l.ondernemingsnummer ?? '')}"`))}${veld('IBAN', inp('iban', `value="${esc(l.iban ?? '')}"`), '2 1 200px')}</div>
        <div class="rij">${veld('Contactpersoon', inp('contactpersoon', `value="${esc(l.contactpersoon ?? '')}"`))}${veld('E-mailadres', inp('email', `type="email" value="${esc(l.email ?? '')}"`), '2 1 220px')}${veld('Telefoon', inp('telefoon', `value="${esc(l.telefoon ?? '')}"`))}</div>
        <div class="rij">${veld('Straat en nummer', inp('adres_straat', `value="${esc(l.adres_straat ?? '')}"`), '2 1 220px')}${veld('Postcode', inp('postcode', `value="${esc(l.postcode ?? '')}"`), '0 1 110px')}${veld('Gemeente', inp('gemeente', `value="${esc(l.gemeente ?? '')}"`))}</div>
        <label>Notitie (bv. wachtdienst, afspraken, contractnummer)</label><input name="notitie" value="${esc(l.notitie ?? '')}">
        <p><button class="stil">Fiche opslaan</button></p></form></details>`; }).join('') || '<p class="leeg">Nog geen leveranciers.</p>'}
    <h3>Leverancier toevoegen</h3>
    <form id="fl"><div class="rij">${veld('Naam', inp('naam', 'required'), '2 1 220px')}${veld('Categorie', kies('categorie', werkOpties(LEV_CATEGORIE, null, 'geen')))}${veld('Ondernemingsnummer', inp('ond', 'placeholder="0123.456.789"'))}${veld('IBAN', inp('iban', 'placeholder="BE.."'), '2 1 220px')}</div>
    <p><button>Toevoegen</button></p></form></div>`);
  document.querySelectorAll('form.flf').forEach((f) => { f.onsubmit = async (ev) => {
    ev.preventDefault(); S.levOpen = f.dataset.id;
    try {
      await q(sb.from('leverancier').update({ naam: f.naam.value.trim(), categorie: ofNull(f.categorie.value), ondernemingsnummer: ondNr(f.ond.value), iban: iban(f.iban.value), contactpersoon: ofNull(f.contactpersoon.value),
        email: ofNull(f.email.value), telefoon: ofNull(f.telefoon.value), adres_straat: ofNull(f.adres_straat.value), postcode: ofNull(f.postcode.value), gemeente: ofNull(f.gemeente.value), notitie: ofNull(f.notitie.value) }).eq('id', f.dataset.id));
      S.bericht = { soort: 'ok', tekst: 'Fiche opgeslagen.' }; S.levOpen = null;
    } catch (e) { fout(e); }
    UIT.routes.leveranciers();
  }; });
  bijVerzenden('fl', async (f) => {
    await q(sb.from('leverancier').insert({ kantoor_id: S.kantoor.id, naam: f.naam.value.trim(), categorie: ofNull(f.categorie.value), ondernemingsnummer: ondNr(f.ond.value), iban: iban(f.iban.value) }));
    S.bericht = { soort: 'ok', tekst: 'Leverancier toegevoegd.' };
    await UIT.routes.leveranciers();
  }, UIT.routes.leveranciers);
};
