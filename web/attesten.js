// =============================================================================
// Syndexia Platform - attesten van de gemene delen.
//
// Drie soorten per VME: asbestattest, EPC gemene delen en keuring elektriciteit.
// Het jongste attest van een soort bepaalt de stand; oudere blijven staan als historiek.
// De stand komt uit de databank (v_attest_stand): ontbreekt, vervallen, binnenkort
// (vervalt binnen 6 maanden), in orde of niet van toepassing.
//
// "Geldig tot" neem je over van het attest zelf. Het platform stelt alleen een datum
// voor (EPC 10 jaar, elektriciteit 5 jaar); het attest kan een andere datum dragen.
// =============================================================================
const ATTEST_SOORT = [['asbest', 'Asbestattest'], ['epc', 'EPC gemene delen'], ['elektriciteit', 'Keuring elektriciteit']];
const ATTEST_JAREN = { epc: 10, elektriciteit: 5 };   // voorstel voor "geldig tot"; asbest: geen voorstel
const attestNaam = (s) => ATTEST_SOORT.find(([k]) => k === s)?.[1] ?? s;
const attestPil = (stand) => `<span class="pil ${{ 'in orde': 'ok', binnenkort: 'warn', vervallen: 'fout', ontbreekt: 'fout' }[stand] ?? ''}">${esc({ nvt: 'niet van toepassing', binnenkort: 'vervalt binnenkort' }[stand] ?? stand)}</span>`;
const attestPlus = (datum, jaren) => { const d = new Date(`${datum}T12:00:00`); d.setFullYear(d.getFullYear() + jaren); return d.toLocaleDateString('sv-SE'); };

// ---- tabblad Attesten ---------------------------------------------------------------
UIT.tabs.push(['attesten', 'Attesten']);
UIT.fn.attesten = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.attesten = async () => {
  const v = S.vme, doel = document.getElementById('tabinhoud');
  let standen, attesten, docs;
  try {
    [standen, attesten, docs] = await Promise.all([
      q(sb.from('v_attest_stand').select('soort, stand, nvt_reden').eq('vme_id', v.id)),
      q(sb.from('attest').select('id, soort, datum, geldig_tot, nummer, uitvoerder, resultaat, notitie, document_id').eq('vme_id', v.id).order('datum', { ascending: false }).order('aangemaakt_op', { ascending: false })),
      q(sb.from('document').select('id, map, naam, pad').eq('vme_id', v.id).order('naam')),
    ]);
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;
  const opnieuw = () => schermVme();
  const docOpt = `<option value="">geen</option>${docs.map((d) => `<option value="${d.id}">${esc(d.naam)}</option>`).join('')}`;
  const details = (a) => `${dat(a.datum)}${a.geldig_tot ? ` · geldig tot <b>${dat(a.geldig_tot)}</b>` : ' · geen vervaldatum ingevuld'}${a.nummer ? ` · nr. ${esc(a.nummer)}` : ''}${a.uitvoerder ? ` · ${esc(a.uitvoerder)}` : ''}`;
  const docKnop = (a) => (a.document_id && docs.some((d) => d.id === a.document_id) ? ` <button type="button" class="stil" data-doc="${a.document_id}">Attest openen</button>` : '');

  doel.innerHTML = `<p class="klein">De stand volgt het jongste attest per soort. Neem "geldig tot" over van het attest zelf; de voorgestelde datum is maar een hulp. Het attest zelf laad je op onder Documenten en koppel je hier.</p>
    ${ATTEST_SOORT.map(([soort, titel]) => { const st = standen.find((x) => x.soort === soort) ?? { stand: 'ontbreekt' }, lijst = attesten.filter((a) => a.soort === soort), nu = lijst[0], oud = lijst.slice(1);
      return `<div class="kaart" data-soort="${soort}"><h3 style="margin-top:0">${esc(titel)} ${attestPil(st.stand)}</h3>
        ${st.stand === 'nvt' ? `<p>Niet van toepassing: ${esc(st.nvt_reden)} <button type="button" class="stil" data-nvtweg="${soort}">Toch opvolgen</button></p>` : ''}
        ${nu ? `<p>${details(nu)}${docKnop(nu)}</p>${nu.resultaat ? `<p class="klein"><b>Resultaat:</b> ${esc(nu.resultaat)}</p>` : ''}${nu.notitie ? `<p class="klein">${esc(nu.notitie)}</p>` : ''}` : (st.stand === 'nvt' ? '' : '<p class="leeg">Nog geen attest ingevoerd.</p>')}
        ${['ontbreekt', 'vervallen', 'binnenkort'].includes(st.stand) ? `<p><button type="button" class="stil" data-taak-attest="${soort}">Taak maken om dit in orde te brengen</button></p>` : ''}
        <details${nu || st.stand === 'nvt' ? '' : ' open'}><summary style="cursor:pointer;font-weight:600">+ ${nu ? 'Nieuwer attest toevoegen' : 'Attest toevoegen'}</summary>
          <form class="fat" data-soort="${soort}" style="margin-top:10px"><div class="rij">${veld('Datum attest', inp('datum', 'type="date" required'))}${veld('Geldig tot', inp('geldig', 'type="date"'))}${veld('Nummer', inp('nummer'))}${veld('Opgemaakt door', inp('uitvoerder'), '2 1 200px')}</div>
            <div class="rij">${veld('Resultaat', inp('resultaat', 'placeholder="bv. conform"'), '2 1 220px')}${veld('Document', kies('doc', docOpt), '2 1 220px')}</div>
            <label>Notitie</label><input name="notitie">
            <p><button>Attest opslaan</button></p></form></details>
        ${st.stand === 'nvt' || nu ? '' : `<details><summary style="cursor:pointer" class="klein">Niet van toepassing voor dit gebouw</summary>
          <form class="fnvt" data-soort="${soort}" style="margin-top:8px"><div class="rij">${veld('Reden', inp('reden', 'required placeholder="bv. geen gemeenschappelijke installatie"'), '3 1 260px')}</div><p><button>Opslaan</button></p></form></details>`}
        ${oud.length ? `<details><summary style="cursor:pointer" class="klein">Historiek (${oud.length})</summary>${tabel(['Datum', 'Geldig tot', 'Nummer', 'Opgemaakt door', ''], oud.map((a) => `<tr>${cel(dat(a.datum))}${cel(dat(a.geldig_tot))}${cel(a.nummer)}${cel(a.uitvoerder)}<td>${docKnop(a)}</td></tr>`))}</details>` : ''}
        ${nu ? `<p class="klein" style="margin-bottom:0"><button type="button" class="stil" data-wis="${nu.id}">Jongste attest wissen</button></p>` : ''}</div>`; }).join('')}`;

  // "geldig tot" voorstellen zodra de datum ingevuld is (alleen als het vak nog leeg is)
  doel.querySelectorAll('form.fat').forEach((f) => { f.datum.onchange = () => { const j = ATTEST_JAREN[f.dataset.soort]; if (j && f.datum.value && !f.geldig.value) f.geldig.value = attestPlus(f.datum.value, j); }; });
  const stuur = (selector, werk) => doel.querySelectorAll(selector).forEach((f) => { f.onsubmit = async (ev) => {
    ev.preventDefault(); const knop = f.querySelector('button:not([type])'); if (knop) knop.disabled = true;
    try { await werk(f); } catch (e) { fout(e); } opnieuw();
  }; });
  stuur('form.fat', async (f) => {
    if (f.geldig.value && f.geldig.value < f.datum.value) throw new Error('"Geldig tot" kan niet voor de datum van het attest liggen.');
    await q(sb.from('attest').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, soort: f.dataset.soort, datum: f.datum.value, geldig_tot: ofNull(f.geldig.value), nummer: ofNull(f.nummer.value), uitvoerder: ofNull(f.uitvoerder.value), resultaat: ofNull(f.resultaat.value), notitie: ofNull(f.notitie.value), document_id: ofNull(f.doc.value) }));
    S.bericht = { soort: 'ok', tekst: `${attestNaam(f.dataset.soort)} opgeslagen.` };
  });
  stuur('form.fnvt', async (f) => { await q(sb.from('attest_nvt').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, soort: f.dataset.soort, reden: f.reden.value.trim() })); S.bericht = { soort: 'ok', tekst: `${attestNaam(f.dataset.soort)} staat op niet van toepassing.` }; });
  doel.querySelectorAll('[data-nvtweg]').forEach((b) => { b.onclick = async () => { try { await q(sb.from('attest_nvt').delete().eq('vme_id', v.id).eq('soort', b.dataset.nvtweg)); } catch (e) { fout(e); } opnieuw(); }; });
  doel.querySelectorAll('[data-wis]').forEach((b) => { b.onclick = async () => {
    if (b.dataset.zeker !== '1') { b.dataset.zeker = '1'; b.textContent = 'Zeker? Klik opnieuw'; return; }
    try { await q(sb.from('attest').delete().eq('id', b.dataset.wis)); S.bericht = { soort: 'ok', tekst: 'Attest gewist.' }; } catch (e) { fout(e); } opnieuw();
  }; });
  doel.querySelectorAll('[data-doc]').forEach((b) => { b.onclick = async () => {
    const d = docs.find((x) => x.id === b.dataset.doc); if (!d) return;
    const { data, error } = await sb.storage.from('documenten').createSignedUrl(d.pad, 120);
    if (error) { fout(error); opnieuw(); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }; });
  doel.querySelectorAll('[data-taak-attest]').forEach((b) => { b.onclick = async () => {
    const soort = b.dataset.taakAttest, nu = attesten.find((a) => a.soort === soort);
    try {
      await q(sb.from('taak').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, titel: `${attestNaam(soort)} ${nu ? 'vernieuwen' : 'laten opmaken'}`, omschrijving: nu?.geldig_tot ? `Het huidige attest is geldig tot ${dat(nu.geldig_tot)}.` : null, vervaldatum: nu?.geldig_tot ?? null }));
      S.bericht = { soort: 'ok', tekst: 'Taak aangemaakt. Je vindt ze op het startscherm en onder Taken.' };
    } catch (e) { fout(e); } opnieuw();
  }; });
};

// ---- startscherm: wat ontbreekt of vervalt --------------------------------------------
UIT.vandaag.push('<p><a class="knop licht" href="#/attesten">Attesten <span id="atteller"></span></a></p>', '<div id="attesten-start"></div>');
(UIT.naVandaag ??= []).push(async () => {
  const doel = document.getElementById('attesten-start'); if (!doel) return;
  try {
    const rijen = await q(sb.from('v_attest_stand').select('vme_id, vme_naam, soort, stand, geldig_tot').in('stand', ['ontbreekt', 'vervallen', 'binnenkort']).order('vme_naam'));
    if (!document.body.contains(doel)) return;
    const dringend = rijen.filter((r) => r.stand !== 'ontbreekt'), weg = rijen.filter((r) => r.stand === 'ontbreekt'), erg = rijen.filter((r) => r.stand === 'vervallen'), vak = document.getElementById('atteller');
    if (vak && rijen.length) vak.innerHTML = `<span class="pil ${erg.length ? 'fout' : 'warn'}">${rijen.length}</span>`;
    if (!rijen.length) { doel.innerHTML = ''; return; }
    // vervallen en binnenkort elk op een regel; wat ontbreekt alleen als telling, anders wordt de lijst te lang
    doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Attesten die aandacht vragen <a href="#/attesten" class="klein" style="font-weight:400">overzicht van alle gebouwen →</a></h3>
      ${dringend.length ? tabel(['VME', 'Attest', 'Stand', 'Geldig tot'], dringend.map((r) => `<tr><td><a href="#/vme/${r.vme_id}/attesten">${esc(r.vme_naam)}</a></td>${cel(attestNaam(r.soort))}<td>${attestPil(r.stand)}</td>${cel(dat(r.geldig_tot))}</tr>`)) : ''}
      ${weg.length ? `<p class="klein" id="attest-ontbreekt" style="margin-bottom:0">${weg.length} attest(en) nog niet ingevoerd in ${new Set(weg.map((r) => r.vme_id)).size} gebouw(en).</p>` : ''}</div>`;
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; }
});

// ---- pagina: alle gebouwen ------------------------------------------------------------
UIT.routes.attesten = async () => {
  const rijen = await q(sb.from('v_attest_stand').select('vme_id, vme_naam, soort, stand, geldig_tot').order('vme_naam'));
  const vmes = [...new Map(rijen.map((r) => [r.vme_id, r.vme_naam])).entries()];
  const vak = (id, soort) => { const r = rijen.find((x) => x.vme_id === id && x.soort === soort); return `<td>${attestPil(r?.stand ?? 'ontbreekt')}${r?.geldig_tot ? `<br><span class="klein">tot ${dat(r.geldig_tot)}</span>` : ''}</td>`; };
  toon(`<p><a href="#/">← alle VME's</a></p><h2>Attesten</h2>
    <p class="klein">Per gebouw de stand van het asbestattest, het EPC van de gemene delen en de keuring van de elektrische installatie. "Vervalt binnenkort" betekent binnen 6 maanden. Klik op een gebouw om een attest in te voeren.</p>
    <div class="kaart">${vmes.length ? tabel(['VME', ...ATTEST_SOORT.map(([, t]) => t)], vmes.map(([id, naam]) => `<tr><td><a href="#/vme/${id}/attesten">${esc(naam)}</a></td>${ATTEST_SOORT.map(([s]) => vak(id, s)).join('')}</tr>`)) : '<p class="leeg">Nog geen gebouwen.</p>'}</div>`);
};
