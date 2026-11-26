// =============================================================================
// Syndexia Platform - algemene vergadering (aanwezigheid, quorum, stemmen, verslag)
// en het wijzigen of wissen van kavels en verdeelsleutels.
//
// Quorum, stembeperking en meerderheden worden in de databank berekend
// (vergadering_quorum en vergadering_uitslag, migratie 0011). Dit bestand toont
// de uitkomst en geeft door wat je invult; het rekent zelf niets uit.
// =============================================================================
const MEERDERHEID = { geen: 'geen stemming', volstrekte: 'volstrekte meerderheid', twee_derde: 'twee derde', vier_vijfde: 'vier vijfde', eenparig: 'eenparigheid van alle mede-eigenaars' };
const aand = (v) => Number(v ?? 0).toLocaleString('nl-BE', { maximumFractionDigits: 2 });
const datumLang = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

UIT.tabs.push(['av', 'Vergaderingen']);
UIT.fn.av = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.av = async () => {
  const v = S.vme, basis = { kantoor_id: S.kantoor.id, vme_id: v.id }, doel = document.getElementById('tabinhoud');
  const mis = (e) => { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; };
  let lijst;
  try { lijst = await q(sb.from('vergadering').select('*').eq('vme_id', v.id).order('datum', { ascending: false })); } catch (e) { return mis(e); }
  const av = lijst.find((x) => x.id === S.av);

  // ---- geen vergadering gekozen: de lijst en een nieuwe plannen --------------------
  if (!av) {
    doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Algemene vergaderingen</h3>
        ${tabel(['Datum', 'Soort', 'Plaats', 'Status', ''], lijst.map((x) => `<tr>${cel(dat(x.datum))}${cel(x.soort + (x.tweede_zitting ? ' (tweede zitting)' : ''))}${cel(x.plaats)}<td><span class="pil ${x.status === 'gepland' ? 'ok' : ''}">${x.status}</span></td><td><button class="stil" data-av="${x.id}">Openen</button></td></tr>`))}
        <h3>Vergadering plannen</h3>
        <form id="fg"><div class="rij">${veld('Datum', inp('datum', `type="date" required value="${vandaag()}"`))}${veld('Uur', inp('tijdstip', 'placeholder="bv. 19:00"'))}${veld('Plaats', inp('plaats'), '2 1 220px')}
        ${veld('Soort', kies('soort', '<option>gewone</option><option>buitengewone</option>'))}${veld('Tweede zitting?', kies('tweede', '<option value="nee">nee</option><option value="ja">ja (geen quorum nodig)</option>'))}</div><p><button>Vergadering aanmaken</button></p></form></div>`;
    doel.querySelectorAll('[data-av]').forEach((k) => { k.onclick = () => { S.av = k.dataset.av; schermVme(); }; });
    bijVerzenden('fg', async (f) => {
      const nieuw = await q(sb.from('vergadering').insert({ ...basis, datum: f.datum.value, tijdstip: ofNull(f.tijdstip.value), plaats: ofNull(f.plaats.value), soort: f.soort.value, tweede_zitting: f.tweede.value === 'ja' }).select('id').single());
      S.av = nieuw.id; S.bericht = { soort: 'ok', tekst: 'Vergadering aangemaakt. Stel nu de agenda op.' }; schermVme();
    });
    return;
  }

  // ---- één vergadering -------------------------------------------------------------
  let kavels, quorum, punten, stemmen;
  try {
    [kavels, [quorum], punten, stemmen] = await Promise.all([
      q(sb.rpc('vergadering_kavels', { p_vergadering: av.id })), q(sb.rpc('vergadering_quorum', { p_vergadering: av.id })),
      q(sb.rpc('vergadering_uitslag', { p_vergadering: av.id })), q(sb.from('stem').select('agendapunt_id, kavel_id, keuze').eq('vme_id', v.id)),
    ]);
  } catch (e) { return mis(e); }
  if (!document.body.contains(doel)) return;
  const open = av.status === 'gepland', aanwezig = kavels.filter((k) => k.status && Number(k.aandeel) > 0);
  const keuzeVan = (punt, kavel) => stemmen.find((s) => s.agendapunt_id === punt && s.kavel_id === kavel)?.keuze ?? '';
  const optie = (waarde, tekst, gekozen) => `<option value="${waarde}"${waarde === gekozen ? ' selected' : ''}>${tekst}</option>`;
  const uitslagTekst = (p) => p.meerderheid === 'geen' ? '' : `voor ${aand(p.voor)} · tegen ${aand(p.tegen)} · onthouding ${aand(p.onthouding)}${Number(p.niet_gestemd) ? ` · niet gestemd ${aand(p.niet_gestemd)}` : ''}`;
  const pil = (p) => p.meerderheid === 'geen' ? '<span class="pil">ter informatie</span>' : Number(p.voor) + Number(p.tegen) + Number(p.onthouding) === 0 ? '<span class="pil warn">nog niet gestemd</span>' : p.aangenomen ? '<span class="pil ok">aangenomen</span>' : '<span class="pil fout">niet aangenomen</span>';

  const punt = (p) => `<div style="border-top:1px solid var(--l);padding:12px 0"><b>${p.volgnummer}. ${esc(p.titel)}</b> ${pil(p)}
      <div class="klein">${esc(MEERDERHEID[p.meerderheid])}${p.toelichting ? ' · ' + esc(p.toelichting) : ''}</div>
      ${p.meerderheid === 'geen' ? '' : `<div>${uitslagTekst(p)}</div>`}
      ${!open ? (p.besluit ? `<p>${esc(p.besluit)}</p>` : '') : `<details><summary class="klein">${p.meerderheid === 'geen' ? 'Besluit of nota invullen' : 'Stemmen en besluit invullen'}</summary><form class="st" data-id="${p.agendapunt_id}">
        ${p.meerderheid === 'geen' ? '' : aanwezig.length ? `<div class="schuif"><table><tbody>${aanwezig.map((k) => `<tr>${cel(k.kavelnummer)}${cel(k.eigenaars ?? '—')}<td class="n">${aand(k.aandeel)}</td><td><select name="k|${k.kavel_id}" style="width:auto">${optie('', '—', keuzeVan(p.agendapunt_id, k.kavel_id))}${optie('voor', 'voor', keuzeVan(p.agendapunt_id, k.kavel_id))}${optie('tegen', 'tegen', keuzeVan(p.agendapunt_id, k.kavel_id))}${optie('onthouding', 'onthouding', keuzeVan(p.agendapunt_id, k.kavel_id))}</select></td></tr>`).join('')}</tbody></table></div>
          <p><button type="button" class="stil" data-allen="1">Allen voor</button></p>` : '<p class="leeg">Duid eerst aan wie aanwezig is.</p>'}
        <label>Besluit (komt in het verslag)</label><textarea name="besluit" rows="2" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit">${esc(p.besluit ?? '')}</textarea>
        <p><button>Opslaan</button> <button type="button" class="stil" data-wis="1">Punt wissen</button></p></form></details>`}</div>`;

  doel.innerHTML = `<p><button class="stil" id="avterug">← alle vergaderingen</button></p>
    <div class="kaart"><h3 style="margin-top:0">${av.soort === 'gewone' ? 'Gewone' : 'Buitengewone'} algemene vergadering van ${esc(datumLang(av.datum))}${av.tweede_zitting ? ' (tweede zitting)' : ''}</h3>
      <p class="klein">${esc([av.tijdstip, av.plaats].filter(Boolean).join(' · '))} <span class="pil ${open ? 'ok' : ''}">${av.status}</span></p>
      <p><span class="pil ${quorum.bereikt ? 'ok' : 'fout'}">${quorum.bereikt ? 'quorum bereikt' : 'geen quorum'}</span> ${quorum.eigenaars_aanwezig} van ${quorum.eigenaars_totaal} mede-eigenaars · ${aand(quorum.aandelen_aanwezig)} van ${aand(quorum.aandelen_totaal)} aandelen. ${esc(quorum.uitleg)}</p></div>
    <div class="kaart"><h3 style="margin-top:0">Aanwezigheid</h3>
      <form id="fw"><div class="schuif"><table><thead><tr><th>Kavel</th><th>Eigenaar(s)</th><th class="n">Aandelen</th><th>Aanwezig</th><th>Volmacht aan</th></tr></thead><tbody>
      ${kavels.map((k) => `<tr>${cel(k.kavelnummer)}${cel(k.eigenaars ?? '— geen eigenaar —')}<td class="n">${aand(k.aandeel)}</td>
        <td><select name="w|${k.kavel_id}" style="width:auto"${open ? '' : ' disabled'}>${optie('', 'afwezig', k.status ?? '')}${optie('aanwezig', 'aanwezig', k.status ?? '')}${optie('volmacht', 'volmacht', k.status ?? '')}</select></td>
        <td><input name="h|${k.kavel_id}" value="${esc(k.volmachthouder ?? '')}"${open ? '' : ' disabled'}></td></tr>`).join('')}</tbody></table></div>
      ${open ? '<p class="klein">Een lasthebber mag hoogstens drie volmachten hebben, tenzij hij met zijn eigen stemmen samen niet boven 10% van alle stemmen komt. Dat controleert het programma nog niet.</p><p><button>Aanwezigheid opslaan</button> <button type="button" class="stil" id="iedereen">Iedereen aanwezig</button></p>' : ''}</form></div>
    <div class="kaart"><h3 style="margin-top:0">Agenda en stemming</h3>
      <p class="klein">Stemmen tellen volgens de aandelen in de basisakte. Onthoudingen tellen niet mee. Wie meer aandelen heeft dan alle andere aanwezigen samen, stemt voor evenveel als die anderen.</p>
      ${punten.map(punt).join('') || '<p class="leeg">Nog geen agendapunten.</p>'}
      ${open ? `<h3>Agendapunt toevoegen</h3><form id="fq"><div class="rij">${veld('Titel', inp('titel', 'required'), '3 1 260px')}${veld('Vereiste meerderheid', kies('meerderheid', Object.entries(MEERDERHEID).map(([k, t]) => optie(k, t, 'volstrekte')).join('')))}</div>
        <div class="rij">${veld('Toelichting', inp('toelichting'), '1 1 100%')}</div><p><button>Punt toevoegen</button></p></form>` : ''}</div>
    <div class="kaart"><h3 style="margin-top:0">Verslag</h3>
      <p><button type="button" id="toonverslag">Verslag tonen</button> ${open ? '<button type="button" class="stil" id="sluitav">Vergadering sluiten</button>' : ''}</p>
      ${open ? '<p class="klein">Sluiten zet aanwezigheid, stemmen en besluiten vast. Dat kan niet ongedaan gemaakt worden; vink daarom eerst aan: <label style="display:inline"><input type="checkbox" id="zeker" style="width:auto"> ik ben zeker</label></p>' : ''}
      <div id="verslag"></div></div>`;

  document.getElementById('avterug').onclick = () => { S.av = null; schermVme(); };
  const opnieuw = (tekst) => { S.bericht = { soort: 'ok', tekst }; schermVme(); };
  const kanFout = (fn) => async (...a) => { try { await fn(...a); } catch (e) { fout(e); schermVme(); } };

  bijVerzenden('fw', async (f) => {
    const bewaren = [], wissen = [];
    for (const k of kavels) {
      const status = f.querySelector(`[name="w|${k.kavel_id}"]`).value, houder = ofNull(f.querySelector(`[name="h|${k.kavel_id}"]`).value);
      if (status) bewaren.push({ ...basis, vergadering_id: av.id, kavel_id: k.kavel_id, status, volmachthouder: status === 'volmacht' ? houder : null });
      else if (k.status) wissen.push(k.kavel_id);
    }
    if (bewaren.length) await q(sb.from('aanwezigheid').upsert(bewaren, { onConflict: 'vergadering_id,kavel_id' }));
    for (const kavel of wissen) await q(sb.from('aanwezigheid').delete().eq('vergadering_id', av.id).eq('kavel_id', kavel));
    opnieuw('Aanwezigheid opgeslagen.');
  });
  const iedereen = document.getElementById('iedereen');
  if (iedereen) iedereen.onclick = () => doel.querySelectorAll('#fw select').forEach((s) => { if (!s.value) s.value = 'aanwezig'; });

  bijVerzenden('fq', async (f) => {
    await q(sb.from('agendapunt').insert({ ...basis, vergadering_id: av.id, volgnummer: Math.max(0, ...punten.map((p) => p.volgnummer)) + 1, titel: f.titel.value.trim(), meerderheid: f.meerderheid.value, toelichting: ofNull(f.toelichting.value) }));
    opnieuw('Agendapunt toegevoegd.');
  });

  doel.querySelectorAll('form.st').forEach((f) => {
    const id = f.dataset.id;
    const allen = f.querySelector('[data-allen]'); if (allen) allen.onclick = () => f.querySelectorAll('select').forEach((s) => { s.value = 'voor'; });
    f.querySelector('[data-wis]').onclick = kanFout(async () => { await q(sb.from('agendapunt').delete().eq('id', id)); opnieuw('Agendapunt gewist.'); });
    f.onsubmit = kanFout(async (ev) => {
      ev.preventDefault(); f.querySelector('button:not([type])').disabled = true;
      const bewaren = [], wissen = [];
      for (const s of f.querySelectorAll('select')) {
        const kavel = s.name.slice(2);
        if (s.value) bewaren.push({ ...basis, agendapunt_id: id, kavel_id: kavel, keuze: s.value });
        else if (keuzeVan(id, kavel)) wissen.push(kavel);
      }
      if (bewaren.length) await q(sb.from('stem').upsert(bewaren, { onConflict: 'agendapunt_id,kavel_id' }));
      for (const kavel of wissen) await q(sb.from('stem').delete().eq('agendapunt_id', id).eq('kavel_id', kavel));
      await q(sb.from('agendapunt').update({ besluit: ofNull(f.besluit.value) }).eq('id', id));
      opnieuw('Stemmen en besluit opgeslagen.');
    });
  });

  const sluit = document.getElementById('sluitav');
  if (sluit) sluit.onclick = kanFout(async () => {
    if (!document.getElementById('zeker').checked) throw new Error('Vink eerst "ik ben zeker" aan om de vergadering te sluiten.');
    await q(sb.from('vergadering').update({ status: 'gesloten' }).eq('id', av.id));
    opnieuw('Vergadering gesloten.');
  });

  // Het verslag: wie er was, het quorum en per punt de uitslag, met de naam van wie tegen stemde
  // of zich onthield (dat hoort in de notulen te staan).
  document.getElementById('toonverslag').onclick = () => {
    const namen = (punt, keuze) => aanwezig.filter((k) => keuzeVan(punt, k.kavel_id) === keuze).map((k) => `${k.eigenaars ?? 'onbekend'} (${k.kavelnummer})`).join(', ') || 'niemand';
    const uitgebracht = (p) => Number(p.voor) + Number(p.tegen);
    const pct = (p) => uitgebracht(p) ? ` (${(100 * Number(p.voor) / uitgebracht(p)).toLocaleString('nl-BE', { maximumFractionDigits: 2 })}% van de uitgebrachte stemmen)` : '';
    document.getElementById('verslag').innerHTML = `<div id="afdruk" style="border:1px solid var(--l);border-radius:8px;padding:18px;margin-top:10px;white-space:normal">
      <h2>Verslag van de ${av.soort === 'gewone' ? 'gewone' : 'buitengewone'} algemene vergadering</h2>
      <p><b>${esc(v.naam)}</b>${v.ondernemingsnummer ? ' · ' + esc(v.ondernemingsnummer) : ''}<br>${esc(datumLang(av.datum))}${av.tijdstip ? ' om ' + esc(av.tijdstip) : ''}${av.plaats ? ', ' + esc(av.plaats) : ''}${av.tweede_zitting ? ' (tweede zitting)' : ''}</p>
      <h3>Aanwezigheid</h3>
      ${tabel(['Kavel', 'Eigenaar(s)', '#Aandelen', 'Aanwezigheid'], kavels.map((k) => `<tr>${cel(k.kavelnummer)}${cel(k.eigenaars ?? '—')}<td class="n">${aand(k.aandeel)}</td>${cel(k.status === 'volmacht' ? `volmacht${k.volmachthouder ? ' aan ' + k.volmachthouder : ''}` : k.status ?? 'afwezig')}</tr>`))}
      <p>${quorum.eigenaars_aanwezig} van de ${quorum.eigenaars_totaal} mede-eigenaars zijn aanwezig of vertegenwoordigd, samen ${aand(quorum.aandelen_aanwezig)} van de ${aand(quorum.aandelen_totaal)} aandelen. ${esc(quorum.uitleg)}</p>
      <h3>Agenda en beslissingen</h3>
      ${punten.map((p) => `<p><b>${p.volgnummer}. ${esc(p.titel)}</b>${p.toelichting ? '<br>' + esc(p.toelichting) : ''}
        ${p.meerderheid === 'geen' ? '' : `<br>Vereist: ${esc(MEERDERHEID[p.meerderheid])}. Uitslag: ${uitslagTekst(p)}${pct(p)}. Het voorstel is <b>${p.aangenomen ? 'aangenomen' : 'niet aangenomen'}</b>.<br>Tegen: ${esc(namen(p.agendapunt_id, 'tegen'))}. Onthouding: ${esc(namen(p.agendapunt_id, 'onthouding'))}.`}
        ${p.besluit ? '<br>' + esc(p.besluit) : ''}</p>`).join('') || '<p>Geen agendapunten.</p>'}
      </div><p><button type="button" id="druk">Afdrukken of bewaren als pdf</button></p>`;
    document.getElementById('druk').onclick = () => {
      const venster = window.open('', '_blank');
      venster.document.write(`<title>Verslag AV ${esc(v.naam)} ${dat(av.datum)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:30px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:5px 8px;text-align:left}td.n,th.n{text-align:right}</style>${document.getElementById('afdruk').innerHTML}`);
      venster.document.close(); venster.print();
    };
  };
};

// =============================================================================
// Beheer: een kavel of verdeelsleutel wijzigen of wissen. Dit breidt het tabblad
// Beheer uit zonder beheer.js aan te raken: de oorspronkelijke functies worden
// eerst uitgevoerd, daarna komt dit erbij.
// =============================================================================
const beheerHtml = UIT.fn.beheer, beheerBind = UIT.bind.beheer;
UIT.fn.beheer = () => {
  const d = S.d;
  return beheerHtml() + `<div class="kaart"><h3 style="margin-top:0">Wijzigen of wissen</h3>
    <p class="klein">Wissen lukt alleen zolang er geen kosten, boekingen of vergaderingen aan hangen; de databank weigert het anders.</p>
    ${d.kavels.length ? `<form id="fkw"><div class="rij">${veld('Kavel', kies('kavel', d.kavels.map((k) => `<option value="${k.id}">${esc(k.kavelnummer)}</option>`).join('')))}${veld('Nieuw kavelnummer', inp('nummer', 'placeholder="leeg = ongewijzigd"'))}${veld('Soort', kies('soort', '<option value="">ongewijzigd</option>' + SOORTEN.map((s) => `<option>${s}</option>`).join('')))}${veld('Verdieping', inp('verdieping', 'placeholder="leeg = ongewijzigd"'))}</div>
      <p><button>Kavel wijzigen</button> <button type="button" class="stil" data-wis="kavel">Kavel wissen</button> <label style="display:inline"><input type="checkbox" name="zeker" style="width:auto"> bevestig wissen</label></p></form>` : ''}
    ${d.sleutels.length ? `<form id="fsw"><div class="rij">${veld('Verdeelsleutel', kies('sleutel', d.sleutels.map((s) => `<option value="${s.id}">${esc(s.code)} ${esc(s.naam)}</option>`).join('')))}${veld('Nieuwe code', inp('code', 'placeholder="leeg = ongewijzigd"'))}${veld('Nieuwe naam', inp('naam', 'placeholder="leeg = ongewijzigd"'), '2 1 220px')}</div>
      <p><button>Sleutel wijzigen</button> <button type="button" class="stil" data-wis="verdeelsleutel">Sleutel wissen</button> <label style="display:inline"><input type="checkbox" name="zeker" style="width:auto"> bevestig wissen</label></p></form>` : ''}</div>`;
};
UIT.bind.beheer = () => {
  beheerBind();
  const zonderLeeg = (o) => Object.fromEntries(Object.entries(o).filter(([, w]) => w !== null && w !== ''));
  bijVerzenden('fkw', async (f) => {
    const wijziging = zonderLeeg({ kavelnummer: f.nummer.value.trim(), soort: f.soort.value, verdieping: f.verdieping.value.trim() });
    if (!Object.keys(wijziging).length) throw new Error('Vul in wat er moet wijzigen.');
    await q(sb.from('kavel').update(wijziging).eq('id', f.kavel.value)); await ververs('Kavel gewijzigd.');
  });
  bijVerzenden('fsw', async (f) => {
    const wijziging = zonderLeeg({ code: f.code.value.trim(), naam: f.naam.value.trim() });
    if (!Object.keys(wijziging).length) throw new Error('Vul in wat er moet wijzigen.');
    await q(sb.from('verdeelsleutel').update(wijziging).eq('id', f.sleutel.value)); await ververs('Verdeelsleutel gewijzigd.');
  });
  document.querySelectorAll('#fkw [data-wis], #fsw [data-wis]').forEach((knop) => {
    knop.onclick = async () => {
      const f = knop.form, tabelNaam = knop.dataset.wis;
      try {
        if (!f.zeker.checked) throw new Error('Vink eerst "bevestig wissen" aan.');
        await q(sb.from(tabelNaam).delete().eq('id', tabelNaam === 'kavel' ? f.kavel.value : f.sleutel.value));
        await ververs(tabelNaam === 'kavel' ? 'Kavel gewist.' : 'Verdeelsleutel gewist.');
      } catch (e) { fout(e); schermVme(); }
    };
  });
};
