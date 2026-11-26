// =============================================================================
// Syndexia Platform - mailings.
//
// Vier soorten: herinneringen (voor de herinneringen uit het tabblad Boekjaar die nog
// niet vertrokken zijn), een provisie-oproep, de uitnodiging voor een vergadering en
// een vrij bericht aan alle eigenaars. Je schrijft één tekst met invulvelden zoals
// {naam} en {bedrag}; dit bestand vult ze per ontvanger in. Het versturen zelf doet de
// Edge Function "verstuur-mail": die zoekt de adressen op in de databank (de browser
// geeft dus nooit zelf een adres door) en schrijft elke mail in het logboek.
// Er vertrekt niets zonder het vinkje; "Proef naar mezelf" stuurt alleen naar jou.
// =============================================================================
const MAIL_VOET = '\n\n{kantoor}\n{afzender}';
const MAIL_SOORT = {
  herinnering: { naam: 'Herinneringen (nog niet verstuurd)', onderwerp: 'Herinnering openstaand saldo {vme} - {kavel}',
    tekst: 'Beste {naam},\n\nVolgens onze boekhouding staat voor {kavel} in {vme} nog een vervallen bedrag van {bedrag} euro open.\n\nMogen wij u vragen dit bedrag over te schrijven op rekening {iban} van de VME, met de mededeling van de oorspronkelijke oproep?\n\nHebt u intussen betaald, dan mag u dit bericht als niet verzonden beschouwen.' + MAIL_VOET },
  provisie: { naam: 'Provisie-oproep', onderwerp: 'Provisie-oproep {vme} - {kavel}',
    tekst: 'Beste {naam},\n\nVoor {kavel} in {vme} wordt de volgende provisie opgevraagd: {omschrijving}.\n\nBedrag: {bedrag} euro\nTe betalen tegen: {vervaldatum}\nRekening: {iban}\nGestructureerde mededeling: {mededeling}' + MAIL_VOET },
  vergadering: { naam: 'Uitnodiging algemene vergadering', onderwerp: 'Uitnodiging algemene vergadering {vme} - {datum}',
    tekst: 'Beste {naam},\n\nU wordt uitgenodigd op de {soort} algemene vergadering van {vme}.\n\nDatum: {datum}\nUur: {uur}\nPlaats: {plaats}\n\nAgenda:\n{agenda}' + MAIL_VOET },
  vrij: { naam: 'Vrij bericht aan alle eigenaars', onderwerp: '', tekst: 'Beste {naam},\n\n' + MAIL_VOET },
};
const mailVul = (sjabloon, velden) => sjabloon.replace(/\{([a-z_]+)\}/g, (heel, k) => (velden[k] == null || velden[k] === '' ? heel : velden[k]));
const mailOgm = (o) => (o ? `+++${o.slice(0, 3)}/${o.slice(3, 7)}/${o.slice(7)}+++` : null);
const MAIL_ADRES = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

UIT.tabs.push(['mail', 'Mailings']);
UIT.fn.mail = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.mail = async () => {
  const v = S.vme, doel = document.getElementById('tabinhoud');
  const st = (S.mail ??= { soort: 'herinnering', keuze: {}, onderwerp: {}, tekst: {} });
  let eig, herinn, prov, avs, punten, banken, log, logB = [], info, contacten = [];
  try {
    [eig, herinn, prov, avs, punten, banken, log, info] = await Promise.all([
      q(sb.from('v_kavel_eigenaar_vandaag').select('kavel_id, kavelnummer, contact_id, naam, is_lasthebber').eq('vme_id', v.id).order('kavelnummer')),
      q(sb.from('herinnering').select('id, kavel_id, datum, niveau, bedrag').eq('vme_id', v.id).is('verstuurd_op', null).order('datum')),
      q(sb.from('v_provisie_open').select('kavel_id, kavelnummer, datum, vervaldatum, ogm, omschrijving, bedrag').eq('vme_id', v.id).order('datum', { ascending: false })),
      q(sb.from('vergadering').select('id, datum, tijdstip, plaats, soort').eq('vme_id', v.id).eq('status', 'gepland').order('datum')),
      q(sb.from('agendapunt').select('vergadering_id, volgnummer, titel').eq('vme_id', v.id).order('volgnummer')),
      q(sb.from('bankrekening').select('iban, soort').eq('vme_id', v.id).order('aangemaakt_op')),
      q(sb.from('mailing').select('id, soort, onderwerp, aangemaakt_op').eq('vme_id', v.id).order('aangemaakt_op', { ascending: false }).limit(20)),
      sb.functions.invoke('verstuur-mail', { method: 'GET' }).then(({ data }) => data ?? {}, () => ({})),
    ]);
    const ids = [...new Set(eig.map((e) => e.contact_id))];
    [contacten, logB] = await Promise.all([
      ids.length ? q(sb.from('contact').select('id, emails').in('id', ids)) : [],
      log.length ? q(sb.from('mailbericht').select('mailing_id, status, adressen, fout').in('mailing_id', log.map((m) => m.id))) : [],
    ]);
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;

  const adresVan = Object.fromEntries(contacten.map((c) => [c.id, (c.emails ?? []).filter((a) => MAIL_ADRES.test(a))]));
  const rek = banken.find((b) => b.soort === 'werkkapitaal') ?? banken[0];
  const vast = { vme: v.naam, kantoor: S.kantoor.naam, afzender: (info.van ?? '').replace(/^.*<|>.*$/g, ''), iban: rek ? rek.iban.replace(/(.{4})/g, '$1 ').trim() : null };
  // Wie krijgt de mail van een kavel? De lasthebber als er één is aangeduid, anders alle eigenaars.
  const ontvangers = (kavelId) => { const e = eig.filter((x) => x.kavel_id === kavelId), l = e.filter((x) => x.is_lasthebber); return l.length ? l : e; };
  const oproepen = [...new Map(prov.map((p) => [`${p.datum}|${p.omschrijving ?? ''}`, p])).entries()].map(([sleutel, p]) => ({ sleutel, tekst: `${dat(p.datum)} · ${p.omschrijving ?? 'zonder omschrijving'}` }));
  if (!oproepen.some((o) => o.sleutel === st.keuze.provisie)) st.keuze.provisie = oproepen[0]?.sleutel ?? null;
  if (!avs.some((a) => a.id === st.keuze.vergadering)) st.keuze.vergadering = avs[0]?.id ?? null;

  // De ontvangers per soort: één rij = één mail.
  function rijen() {
    const perKavel = (lijnen) => lijnen.flatMap((l) => ontvangers(l.kavel_id).map((e) => ({ contact_id: e.contact_id, naam: e.naam, kavel_id: l.kavel_id, kavel: l.kavel, herinnering_id: l.herinnering_id ?? null, detail: l.detail, velden: l.velden })));
    if (st.soort === 'herinnering') return perKavel(herinn.map((h) => ({ kavel_id: h.kavel_id, kavel: eig.find((e) => e.kavel_id === h.kavel_id)?.kavelnummer ?? '?', herinnering_id: h.id, detail: `herinnering ${h.niveau} van ${dat(h.datum)} · ${eur(h.bedrag)}`, velden: { bedrag: eur(h.bedrag) } })));
    if (st.soort === 'provisie') return perKavel(prov.filter((p) => `${p.datum}|${p.omschrijving ?? ''}` === st.keuze.provisie).map((p) => ({ kavel_id: p.kavel_id, kavel: p.kavelnummer, detail: `${eur(p.bedrag)} · vervalt ${dat(p.vervaldatum) || '—'}`, velden: { bedrag: eur(p.bedrag), vervaldatum: dat(p.vervaldatum), mededeling: mailOgm(p.ogm), omschrijving: p.omschrijving || 'provisie' } })));
    // vergadering en vrij bericht: één mail per persoon, ook als die meerdere kavels heeft
    const av = avs.find((a) => a.id === st.keuze.vergadering);
    if (st.soort === 'vergadering' && !av) return [];
    const extra = st.soort === 'vergadering' ? { datum: dat(av.datum), uur: av.tijdstip, plaats: av.plaats, soort: av.soort, agenda: punten.filter((p) => p.vergadering_id === av.id).map((p) => `${p.volgnummer}. ${p.titel}`).join('\n') } : {};
    const perContact = new Map();
    for (const kavelId of [...new Set(eig.map((e) => e.kavel_id))]) for (const e of ontvangers(kavelId)) {
      const r = perContact.get(e.contact_id) ?? { contact_id: e.contact_id, naam: e.naam, kavel_id: null, herinnering_id: null, kavels: [], detail: '', velden: extra };
      r.kavels.push(e.kavelnummer); perContact.set(e.contact_id, r);
    }
    return [...perContact.values()].map((r) => ({ ...r, kavel: r.kavels.join(', ') }));
  }
  const veldenVan = (r) => ({ ...vast, ...r.velden, naam: r.naam, kavel: r.kavel });
  const sjabloon = () => ({ onderwerp: st.onderwerp[st.soort] ?? MAIL_SOORT[st.soort].onderwerp, tekst: st.tekst[st.soort] ?? MAIL_SOORT[st.soort].tekst });

  const lijst = rijen(), sj = sjabloon();
  const optie = (waarde, tekst, gekozen) => `<option value="${esc(waarde)}"${waarde === gekozen ? ' selected' : ''}>${esc(tekst)}</option>`;
  const keuze = st.soort === 'provisie' ? veld('Welke oproep', kies('keuze', oproepen.map((o) => optie(o.sleutel, o.tekst, st.keuze.provisie)).join('')), '2 1 260px')
    : st.soort === 'vergadering' ? veld('Welke vergadering', kies('keuze', avs.map((a) => optie(a.id, `${dat(a.datum)} · ${a.soort}`, st.keuze.vergadering)).join('')), '2 1 260px') : '';
  const leeg = { herinnering: 'Er zijn geen herinneringen die nog verstuurd moeten worden. Maak ze eerst aan in het tabblad Boekjaar.', provisie: 'Er zijn nog geen provisies opgevraagd.', vergadering: 'Er is geen geplande vergadering.', vrij: 'Deze VME heeft nog geen eigenaars.' }[st.soort];
  const metAdres = lijst.filter((r) => adresVan[r.contact_id]?.length);
  const logTel = (id, status) => logB.filter((b) => b.mailing_id === id && b.status === status).length;
  const mislukt = logB.filter((b) => b.status === 'mislukt');

  doel.innerHTML = `${info.mail_sleutel ? '' : '<div class="melding fout">Versturen is nog niet mogelijk: de Resend-sleutel staat niet in Supabase of de functie verstuur-mail is niet bereikbaar.</div>'}
    <div class="kaart"><h3 style="margin-top:0">Nieuwe mailing</h3>
      <p class="klein">De mails vertrekken van <b>${esc(vast.afzender || 'onbekend')}</b>. Schrijf één tekst; de velden tussen accolades worden per ontvanger ingevuld. Beschikbaar: {naam} {kavel} {vme} {bedrag} {vervaldatum} {mededeling} {omschrijving} {iban} {datum} {uur} {plaats} {agenda} {kantoor} {afzender}.</p>
      <form id="fm"><div class="rij">${veld('Soort', kies('soort', Object.entries(MAIL_SOORT).map(([k, s]) => optie(k, s.naam, st.soort)).join('')), '1 1 240px')}${keuze}</div>
        ${st.soort === 'vergadering' ? '<p class="klein"><span class="pil warn">let op</span> De wet vraagt een aangetekende zending, tenzij de eigenaar individueel, uitdrukkelijk en schriftelijk instemde met een ander communicatiemiddel. Het platform houdt die instemming nog niet bij: vink alleen aan wie instemde.</p>' : ''}
        ${lijst.length ? `<label>Onderwerp</label><input name="onderwerp" value="${esc(sj.onderwerp)}" maxlength="200">
        <label>Tekst</label><textarea name="tekst" rows="13" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit">${esc(sj.tekst)}</textarea>
        <h3>Ontvangers</h3>
        ${tabel(['', 'Kavel', 'Naam', 'E-mailadres', 'Inhoud'], lijst.map((r, i) => { const a = adresVan[r.contact_id] ?? []; return `<tr><td><input type="checkbox" class="mo" data-i="${i}" style="width:auto"${a.length ? ' checked' : ' disabled'}></td>${cel(r.kavel)}${cel(r.naam)}<td>${a.length ? esc(a.join(', ')) : `<span style="display:flex;gap:6px"><input type="email" class="ma" data-c="${r.contact_id}" placeholder="adres toevoegen" style="min-width:170px"><button type="button" class="stil mas" data-c="${r.contact_id}">Opslaan</button></span>`}</td>${cel(r.detail)}</tr>`; }))}
        <p><button type="button" class="stil" id="mvoor">Voorbeeld tonen</button> <button type="button" class="stil" id="mproef"${info.mail_sleutel && metAdres.length ? '' : ' disabled'}>Proef naar mezelf sturen</button></p>
        <div id="mvb"></div>
        <p><label style="display:inline"><input type="checkbox" id="mzeker" style="width:auto"> Ik heb de tekst nagekeken; verstuur echt naar de aangevinkte ontvangers.</label></p>
        <p><button id="mstuur"${info.mail_sleutel && metAdres.length ? '' : ' disabled'}>Versturen</button> <span class="klein" id="mtel"></span></p>` : `<p class="leeg">${leeg}</p>`}
      </form></div>
    <div class="kaart"><h3 style="margin-top:0">Verstuurde mailings</h3>
      ${tabel(['Datum', 'Soort', 'Onderwerp', '#Verzonden', '#Mislukt'], log.map((m) => `<tr>${cel(new Date(m.aangemaakt_op).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' }))}${cel(m.soort)}${cel(m.onderwerp)}<td class="n">${logTel(m.id, 'verzonden')}</td><td class="n">${logTel(m.id, 'mislukt')}</td></tr>`))}
      ${mislukt.map((b) => `<p><span class="pil fout">mislukt</span> ${esc(b.adressen.join(', '))}: ${esc(b.fout)}</p>`).join('')}</div>`;

  const f = document.getElementById('fm');
  f.soort.onchange = () => { st.soort = f.soort.value; schermVme(); };
  if (f.keuze) f.keuze.onchange = () => { st.keuze[st.soort] = f.keuze.value; schermVme(); };
  if (!lijst.length) return;
  // wat je typt blijft staan als het scherm opnieuw getekend wordt
  f.onderwerp.oninput = () => { st.onderwerp[st.soort] = f.onderwerp.value; };
  f.tekst.oninput = () => { st.tekst[st.soort] = f.tekst.value; };
  const gekozen = () => [...doel.querySelectorAll('.mo:checked')].map((k) => lijst[Number(k.dataset.i)]);
  const tel = () => { document.getElementById('mtel').textContent = `${gekozen().length} van ${lijst.length} ontvanger(s) aangevinkt`; };
  doel.querySelectorAll('.mo').forEach((k) => { k.onchange = tel; }); tel();
  const toonIn = (html) => { document.getElementById('mvb').innerHTML = html; };
  const mis = (tekst) => toonIn(`<div class="melding fout">${esc(tekst)}</div>`);

  doel.querySelectorAll('.mas').forEach((knop) => { knop.onclick = async () => {
    const adres = doel.querySelector(`.ma[data-c="${knop.dataset.c}"]`).value.trim();
    if (!MAIL_ADRES.test(adres)) return mis('Dat is geen geldig e-mailadres.');
    try { await q(sb.from('contact').update({ emails: [adres] }).eq('id', knop.dataset.c)); S.bericht = { soort: 'ok', tekst: 'E-mailadres opgeslagen.' }; } catch (e) { fout(e); }
    schermVme();
  }; });

  // Vult het sjabloon in voor elke gekozen ontvanger en weigert als er een veld leeg blijft.
  function berichten() {
    const g = gekozen();
    if (!g.length) throw new Error('Vink minstens één ontvanger aan.');
    if (!f.onderwerp.value.trim() || !f.tekst.value.trim()) throw new Error('Vul een onderwerp en een tekst in.');
    const uit = g.map((r) => ({ contact_id: r.contact_id, kavel_id: r.kavel_id, herinnering_id: r.herinnering_id, naam: r.naam, onderwerp: mailVul(f.onderwerp.value.trim(), veldenVan(r)), tekst: mailVul(f.tekst.value.trim(), veldenVan(r)) }));
    const over = uit.map((b) => (b.onderwerp + b.tekst).match(/\{[a-z_]+\}/)?.[0]).find(Boolean);
    if (over) throw new Error(`Het veld ${over} kan niet ingevuld worden${over === '{iban}' ? ': deze VME heeft nog geen bankrekening (tabblad Bank)' : ['{uur}', '{plaats}', '{agenda}'].includes(over) ? ': vul uur, plaats en agenda in bij de vergadering' : ''}. Vul het aan of haal het uit de tekst.`);
    return uit;
  }
  async function roep(body) {
    const { data, error } = await sb.functions.invoke('verstuur-mail', { body: { vme_id: v.id, soort: st.soort, onderwerp: mailVul(f.onderwerp.value.trim(), vast).replace(/\s*[-–·]?\s*\{[a-z_]+\}/g, '').trim(), ...body } });
    if (error) { let tekst = error.message; try { tekst = (await error.context.json()).fout ?? tekst; } catch (e) { /* geen uitleg van de functie */ } throw new Error(tekst); }
    return data;
  }
  document.getElementById('mvoor').onclick = () => {
    try { const [b] = berichten(); toonIn(`<div class="melding">Voorbeeld voor <b>${esc(b.naam)}</b> · onderwerp: <b>${esc(b.onderwerp)}</b></div><pre style="white-space:pre-wrap;font:inherit;border:1px solid var(--l);border-radius:8px;padding:12px">${esc(b.tekst)}</pre>`); } catch (e) { mis(e.message); }
  };
  document.getElementById('mproef').onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      const uit = await roep({ proef: true, berichten: berichten().slice(0, 1) }), r = uit.resultaat[0];
      if (r?.status === 'verzonden') toonIn(`<div class="melding ok">Proef verstuurd naar ${esc(uit.proef_naar)}. Dit is de mail zoals de eerste aangevinkte ontvanger ze krijgt.</div>`);
      else mis(`De proef is niet vertrokken: ${r?.fout ?? uit.overgeslagen[0]?.reden ?? 'onbekende reden'}`);
    } catch (e) { mis(e.message); }
    ev.target.disabled = false;
  };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    let alle;
    try { alle = berichten(); } catch (e) { return mis(e.message); }
    if (!document.getElementById('mzeker').checked) return mis('Vink eerst aan dat je de tekst hebt nagekeken.');
    const knop = document.getElementById('mstuur'); knop.disabled = true;
    let goed = 0; const slecht = []; let mailing = null;
    try {
      // in pakjes van 20: de functie wacht even tussen twee mails en mag niet te lang lopen
      for (let i = 0; i < alle.length; i += 20) {
        toonIn(`<p class="klein">Bezig met versturen… ${i} van ${alle.length}</p>`);
        const uit = await roep({ mailing_id: mailing, berichten: alle.slice(i, i + 20) });
        mailing = uit.mailing_id ?? mailing;
        goed += uit.resultaat.filter((r) => r.status === 'verzonden').length;
        slecht.push(...uit.resultaat.filter((r) => r.status !== 'verzonden').map((r) => r.fout), ...uit.overgeslagen.map((o) => o.reden), ...uit.logfouten.map((l) => `logboek: ${l}`));
      }
    } catch (e) { slecht.push(e.message); }
    if (goed && !slecht.length) { delete st.onderwerp[st.soort]; delete st.tekst[st.soort]; }   // bij een probleem blijft je tekst staan
    S.bericht = { soort: slecht.length ? 'fout' : 'ok', tekst: `${goed} mail(s) verstuurd.${slecht.length ? ` ${slecht.length} probleem/problemen: ${[...new Set(slecht)].join(' · ')}` : ''}` };
    schermVme();
  };
};
