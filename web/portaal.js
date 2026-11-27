// =============================================================================
// Syndexia Platform - eigenaarsportaal en contactbeheer.
//
// PORTAAL. Een eigenaar is geen lid van het kantoor en mag geen enkele tabel lezen. Hij
// roept één databankfunctie aan, portaal(), die alleen teruggeeft wat bij zijn bevestigde
// e-mailadres hoort. Dit bestand tekent dat antwoord: per kavel wat nog openstaat, zijn
// deel in de afgesloten boekjaren, de vrijgegeven documenten en de geplande vergaderingen.
// Daarnaast kan hij een vraag stellen aan de assistent, een probleem melden en volgen, en een
// wijziging van zijn contactgegevens doorgeven (functies portaal_extra, portaal_melding, portaal_wijziging).
//
// CONTACTEN. De pagina #/contacten is voor het kantoor: alle eigenaars en andere contacten
// met hun adres, telefoon en e-mailadressen. Het e-mailadres hier bepaalt wie in het
// portaal mag meekijken en waar de mailings naartoe gaan.
// =============================================================================
const portaalOgm = (o) => (o ? `+++${o.slice(0, 3)}/${o.slice(3, 7)}/${o.slice(7)}+++` : '');
const portaalIban = (i) => (i ? i.replace(/(.{4})/g, '$1 ').trim() : '');

// ---- het portaal -------------------------------------------------------------------------
// Eén scherm met bovenaan een vraagvak (de assistent) en daaronder zes delen. S.pt onthoudt waar
// de eigenaar staat, zodat het scherm na een actie op dezelfde plek terugkomt.
const PT_DELEN = [['overzicht', 'Overzicht'], ['betalen', 'Betalen'], ['documenten', 'Documenten'], ['vergaderingen', 'Vergaderingen'], ['melden', 'Melden'], ['gegevens', 'Mijn gegevens']];
const PT_VRAGEN = ['Hoeveel moet ik nog betalen?', 'Wanneer is de volgende vergadering?', 'Waar vind ik de basisakte?', 'Wat is het verschil tussen werkkapitaal en reservefonds?'];
const ptKopie = (waarde, wat) => `<button type="button" class="stil ptkopie" data-kopie="${esc(waarde)}" aria-label="${esc(wat)} kopiëren">Kopiëren</button>`;
const ptStatus = (m) => (m.status === 'afgesloten' ? ['afgehandeld', 'ok'] : m.status === 'open' ? ['ontvangen', 'warn'] : [m.status, 'warn']);

function schermPortaal(p, metTerug = false) {
  const st = (S.pt ??= { deel: 'overzicht', gesprek: [], zoek: '', extra: null, vme: null });
  const vmes = [...new Map(p.kavels.map((k) => [k.vme_id, k])).values()];
  if (!vmes.length) return toon(`${metTerug ? terug : ''}<h2>Mijn eigendom</h2><p class="klein">U bent aangemeld als ${esc(p.email)}.</p><div class="kaart"><p class="leeg">Dit e-mailadres is aan geen enkele kavel gekoppeld. Vraag uw syndicus om dit adres bij uw gegevens te zetten.</p></div>`);
  if (!vmes.some((v) => v.vme_id === st.vme)) st.vme = vmes[0].vme_id;
  if (!PT_DELEN.some(([d]) => d === st.deel)) st.deel = 'overzicht';
  const v = vmes.find((x) => x.vme_id === st.vme), kavels = p.kavels.filter((k) => k.vme_id === v.vme_id), nu = kavels.filter((k) => k.huidig), ex = st.extra ?? { mij: [], meldingen: [] };
  const docs = p.documenten.filter((d) => d.vme_id === v.vme_id), avs = p.vergaderingen.filter((g) => g.vme_id === v.vme_id), meld = ex.meldingen.filter((m) => m.vme_id === v.vme_id);
  const open = nu.flatMap((k) => k.openstaand.map((o) => ({ ...o, kavel: k.kavelnummer, iban: k.iban }))), totaal = open.reduce((s, o) => s + Number(o.openstaand), 0);
  const eerst = open.map((o) => o.vervaldatum).filter(Boolean).sort()[0], vandaag = new Date().toISOString().slice(0, 10), teLaat = open.some((o) => o.vervaldatum && o.vervaldatum < vandaag);
  const voornaam = ex.mij[0]?.voornaam || '', openMeld = meld.filter((m) => m.status !== 'afgesloten').length;
  const naar = (deel, tekst, klasse = 'ptlink') => `<button type="button" class="${klasse}" data-ptdeel="${deel}">${tekst}</button>`;
  const docRij = (d) => `<li><span><b>${esc(d.naam)}</b><span class="klein">${esc(d.map)} · ${dat(d.datum)}</span></span><button type="button" class="stil" data-pdoc="${d.id}">Openen</button></li>`;

  const delen = {
    overzicht: () => `<div class="pttegels">
        <div class="pttegel${totaal > 0 ? (teLaat ? ' fout' : ' warn') : ' ok'}"><span>Te betalen</span><b>${eur(totaal)} euro</b><p>${totaal > 0 ? (teLaat ? 'De vervaldag is voorbij.' : eerst ? `Tegen ${dat(eerst)}.` : 'Zie de oproep.') : 'U bent helemaal in orde.'}</p>${totaal > 0 ? naar('betalen', 'Nu betalen', 'knop') : naar('betalen', 'Mijn afrekeningen')}</div>
        <div class="pttegel"><span>Volgende vergadering</span><b>${avs[0] ? dat(avs[0].datum) : 'Nog niet gepland'}</b><p>${avs[0] ? `${avs[0].tijdstip ? `Om ${esc(avs[0].tijdstip.slice(0, 5))}` : ''}${avs[0].plaats ? `${avs[0].tijdstip ? ', ' : ''}${esc(avs[0].plaats)}` : ''}` : 'U krijgt een uitnodiging zodra de datum vastligt.'}</p>${avs[0] ? naar('vergaderingen', 'Agenda bekijken') : ''}</div>
        <div class="pttegel"><span>Mijn meldingen</span><b>${openMeld ? `${openMeld} in behandeling` : 'Geen open meldingen'}</b><p>Lek, defect of iets anders in het gebouw?</p>${naar('melden', 'Iets melden')}</div></div>
      <div class="kaart"><h3 style="margin-top:0">Recente documenten</h3>${docs.length ? `<ul class="ptlijst">${[...docs].sort((a, b) => String(b.datum).localeCompare(String(a.datum))).slice(0, 4).map(docRij).join('')}</ul><p style="margin-bottom:0">${naar('documenten', `Alle ${docs.length} documenten`)}</p>` : '<p class="leeg">De syndicus heeft nog geen documenten vrijgegeven.</p>'}</div>
      <div class="kaart"><h3 style="margin-top:0">Uw eigendom</h3><p style="margin:0">${kavels.map((k) => `<b>${esc(k.kavelnummer)}</b>${k.omschrijving ? ` ${esc(k.omschrijving)}` : k.soort ? ` (${esc(k.soort)})` : ''}${k.huidig ? '' : ' <span class="pil">vroegere eigenaar</span>'}`).join(' · ')}</p><p class="klein" style="margin:6px 0 0">${esc(v.adres)}${v.ondernemingsnummer ? ` · ${esc(v.ondernemingsnummer)}` : ''} · syndicus: ${esc(v.kantoor)}</p></div>`,
    betalen: () => `${open.length ? `<div class="kaart"><h3 style="margin-top:0">Nog te betalen: ${eur(totaal)} euro</h3>
        ${open.map((o) => `<div class="ptbetaal"><div><b>${esc(o.omschrijving ?? 'Provisie')}</b> <span class="klein">kavel ${esc(o.kavel)} · oproep van ${dat(o.datum)}${o.vervaldatum ? ` · vervalt ${dat(o.vervaldatum)}` : ''}${o.vervaldatum && o.vervaldatum < vandaag ? ' <span class="pil fout">vervallen</span>' : ''}</span>${Number(o.betaald) ? `<br><span class="klein">Bedrag ${eur(o.bedrag)}, al betaald ${eur(o.betaald)}</span>` : ''}</div>
          <dl class="ptgegevens"><dt>Bedrag</dt><dd><b>${eur(o.openstaand)} euro</b> ${ptKopie(Number(o.openstaand).toFixed(2).replace('.', ','), 'Bedrag')}</dd>
            ${o.iban ? `<dt>Rekening van de VME</dt><dd>${esc(portaalIban(o.iban))} ${ptKopie(o.iban, 'Rekeningnummer')}</dd>` : ''}${o.ogm ? `<dt>Mededeling</dt><dd>${esc(portaalOgm(o.ogm))} ${ptKopie(portaalOgm(o.ogm), 'Mededeling')}</dd>` : ''}</dl></div>`).join('')}
        <p class="klein" style="margin-bottom:0">Betaal met uw eigen bankapp en neem de mededeling exact over: zo wordt uw betaling vanzelf herkend. Na verwerking van het bankuittreksel verdwijnt het bedrag hier.</p></div>` : '<div class="kaart"><h3 style="margin-top:0">U bent helemaal in orde</h3><p class="leeg" style="padding:0">Er staat niets open.</p></div>'}
      <div class="kaart"><h3 style="margin-top:0">Uw deel in de kosten</h3><p class="klein">Per afgesloten boekjaar, volgens de verdeelsleutels van het gebouw.</p>
        ${kavels.some((k) => k.afrekeningen.length) ? kavels.flatMap((k) => k.afrekeningen.map((a, n) => `<details class="ptafr"${n === 0 && kavels.length === 1 ? ' open' : ''}><summary><b>Boekjaar ${esc(a.boekjaar)}</b> · kavel ${esc(k.kavelnummer)} <span class="klein">${dat(a.van)} – ${dat(a.tot)}</span>${a.nota ? '' : ` <b style="float:right">${eur(a.totaal)}</b>`}</summary>
          ${a.nota ? `<p class="klein">${esc(a.nota)}</p>` : tabel(['Verdeelsleutel', 'Eigenaar van – tot', '#Bedrag'], [...a.lijnen.map((l) => `<tr>${cel(l.sleutel)}${cel(`${dat(l.van) || 'begin'} – ${dat(l.tot) || 'heden'}`)}${celN(l.bedrag)}</tr>`), `<tr class="tot"><td colspan="2">Totaal</td><td class="n">${eur(a.totaal)}</td></tr>`])}</details>`)).join('') : '<p class="leeg">Er is nog geen afgesloten boekjaar.</p>'}</div>`,
    documenten: () => { const z = st.zoek.trim().toLowerCase(), lijst = docs.filter((d) => !z || `${d.naam} ${d.map}`.toLowerCase().includes(z)), mappen = [...new Set(lijst.map((d) => d.map))];
      return `<div class="kaart"><h3 style="margin-top:0">Documenten</h3>${docs.length ? `<input id="ptzoek" type="search" placeholder="Zoek op naam, bv. basisakte, verslag, polis" value="${esc(st.zoek)}" aria-label="Zoeken in de documenten">
        <div id="ptdocs">${mappen.map((m) => `<h4>${esc(m)}</h4><ul class="ptlijst">${lijst.filter((d) => d.map === m).map(docRij).join('')}</ul>`).join('') || '<p class="leeg">Geen document gevonden met die naam.</p>'}</div>` : '<p class="leeg">De syndicus heeft nog geen documenten vrijgegeven.</p>'}
        <p class="klein" style="margin-bottom:0">Mist u een document? Vraag het aan via ${naar('melden', 'Melden')}.</p></div>`; },
    vergaderingen: () => `<div class="kaart"><h3 style="margin-top:0">Geplande vergaderingen</h3>${avs.length ? avs.map((g) => `<div class="ptav"><b>${dat(g.datum)}${g.tijdstip ? ` om ${esc(g.tijdstip.slice(0, 5))}` : ''}</b><span class="klein">${esc(g.soort)} algemene vergadering${g.plaats ? ` · ${esc(g.plaats)}` : ''}</span>${g.agenda.length ? `<ol>${g.agenda.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>` : '<p class="klein">De agenda volgt.</p>'}</div>`).join('') : '<p class="leeg">Er is nog geen vergadering gepland. U krijgt een uitnodiging zodra de datum vastligt.</p>'}
        <p class="klein" style="margin-bottom:0">De verslagen van vorige vergaderingen vindt u bij ${naar('documenten', 'Documenten')}.</p></div>`,
    melden: () => `<div class="kaart"><h3 style="margin-top:0">Iets melden aan de syndicus</h3><p class="ptnood">Bij brand, gasgeur of iemand in gevaar: bel eerst <b>112</b>.</p>
        ${nu.length ? `<form id="fptm"><label>Wat is er aan de hand?</label><input name="titel" required minlength="3" maxlength="120" placeholder="bv. Lamp in de inkomhal is stuk">
          <label style="margin-top:10px">Waar in het gebouw?</label><input name="plaats" maxlength="120" placeholder="bv. inkomhal, lift, garage, mijn appartement">
          <label style="margin-top:10px">Beschrijf het</label><textarea name="tekst" rows="4" required minlength="10" maxlength="3000" placeholder="Sinds wanneer, hoe erg, wat u al probeerde"></textarea>
          <label class="ovvink" style="margin-top:10px"><input type="checkbox" name="dringend"> Dit is dringend (schade wordt erger of het gebouw is niet veilig)</label>
          <div id="ptmfout"></div><p style="margin-bottom:0"><button>Melding versturen</button></p></form>` : '<p class="leeg">U kan alleen iets melden voor een gebouw waar u vandaag eigenaar bent.</p>'}</div>
      <div class="kaart"><h3 style="margin-top:0">Mijn meldingen</h3>${meld.length ? `<ul class="ptlijst">${meld.map((m) => { const [t, kleur] = ptStatus(m); return `<li><span><b>${esc(m.titel)}</b><span class="klein">gemeld op ${dat(m.gemeld_op)}${m.afgesloten_op ? ` · afgehandeld op ${dat(m.afgesloten_op)}` : ''}${m.dringend ? ' · dringend' : ''}</span></span><span class="pil ${kleur}">${esc(t)}</span></li>`; }).join('')}</ul>` : '<p class="leeg">U hebt nog niets gemeld via het portaal.</p>'}</div>`,
    gegevens: () => `<div class="kaart"><h3 style="margin-top:0">Zo kent de syndicus u</h3>${ex.mij.length ? ex.mij.map((m) => `<dl class="ptgegevens"><dt>Naam</dt><dd>${esc(m.naam)}</dd><dt>E-mailadres</dt><dd>${esc((m.emails ?? []).join(', ') || 'niet ingevuld')}</dd><dt>Telefoon</dt><dd>${esc([m.telefoon, m.gsm].filter(Boolean).join(' / ') || 'niet ingevuld')}</dd><dt>Adres</dt><dd>${esc(m.adres || 'niet ingevuld')}</dd></dl>`).join('<hr>') : '<p class="leeg">Uw gegevens konden niet geladen worden.</p>'}
        <p class="klein">Naar dit e-mailadres stuurt de syndicus oproepen en uitnodigingen. U meldt zich met hetzelfde adres aan in dit portaal.</p></div>
      <div class="kaart"><h3 style="margin-top:0">Klopt er iets niet?</h3><form id="fptw"><label>Wat moet er veranderen?</label><textarea name="tekst" rows="3" required minlength="5" maxlength="1500" placeholder="bv. Mijn nieuw gsm-nummer is … / Mijn post mag naar …"></textarea>
        <div id="ptwfout"></div><p style="margin-bottom:0"><button>Doorgeven aan de syndicus</button></p></form><p class="klein" style="margin-bottom:0">De syndicus past het aan. Verkoopt u uw eigendom, dan meldt uw notaris dat aan de syndicus.</p></div>`,
  };

  toon(`${metTerug ? terug : ''}<div class="pt"><div class="pthero"><p class="ptwie">${esc(v.vme)}${vmes.length > 1 ? ` <select id="ptvme" aria-label="Kies het gebouw">${vmes.map((x) => `<option value="${x.vme_id}"${x.vme_id === v.vme_id ? ' selected' : ''}>${esc(x.vme)}</option>`).join('')}</select>` : ''}</p>
      <h2>Dag${voornaam ? ` ${esc(voornaam)}` : ''}, waarmee kan ik u helpen?</h2>
      <form id="fptv"><input name="vraag" maxlength="1500" required autocomplete="off" placeholder="Stel uw vraag, bv. hoeveel moet ik nog betalen?" aria-label="Uw vraag"><button>Vraag</button></form>
      <div id="ptgesprek">${st.gesprek.map((b) => (b.role === 'user' ? `<p class="ptvraag">${esc(b.content)}</p>` : `<div class="ptantw"><p>${esc(b.content)}</p>${b.secties?.length || b.naar_syndicus ? `<p class="ptnaar">${(b.secties ?? []).map((d) => naar(d, `Naar ${PT_DELEN.find(([x]) => x === d)?.[1] ?? d}`, 'knop licht')).join(' ')}${b.naar_syndicus && !(b.secties ?? []).includes('melden') ? ` ${naar('melden', 'Vraag het aan de syndicus', 'knop licht')}` : ''}</p>` : ''}</div>`)).join('')}</div>
      ${st.gesprek.length ? '<p style="margin:8px 0 0"><button type="button" class="ptlink" id="ptwis">Gesprek wissen</button></p>' : `<p class="ptchips">${PT_VRAGEN.map((t) => `<button type="button" class="ptchip">${esc(t)}</button>`).join('')}</p>`}<div id="ptvfout"></div></div>
    <nav class="ptnav" aria-label="Delen van het portaal">${PT_DELEN.map(([d, t]) => `<button type="button" data-ptdeel="${d}" class="${d === st.deel ? 'aan' : ''}"${d === st.deel ? ' aria-current="page"' : ''}>${t}${d === 'betalen' && totaal > 0 ? ' <i></i>' : ''}</button>`).join('')}</nav>
    <div id="ptdeel">${delen[st.deel]()}</div>
    <p class="klein ptvoet">U bent aangemeld als ${esc(p.email)} en ziet alleen de gegevens van uw eigen kavel(s). De assistent antwoordt met die gegevens en kan zich vergissen: bij twijfel beslist uw syndicus.</p></div>`);

  const opnieuw = () => schermPortaal(p, metTerug);
  // De extra gegevens (wie ben ik, mijn meldingen) komen na de eerste tekening: het scherm staat er meteen.
  if (!st.extra) { st.extra = { mij: [], meldingen: [], laadt: true }; q(sb.rpc('portaal_extra')).then((e) => { st.extra = { mij: e?.mij ?? [], meldingen: e?.meldingen ?? [] }; if (!document.querySelector('.pt')) return;
    // wat de eigenaar intussen al typte in het vraagvak blijft staan
    const getypt = document.querySelector('#fptv [name=vraag]')?.value ?? '', had = document.activeElement?.name === 'vraag'; opnieuw(); const vak = document.querySelector('#fptv [name=vraag]'); if (vak && getypt) { vak.value = getypt; if (had) vak.focus(); } }).catch(() => { st.extra = { mij: [], meldingen: [] }; }); }
  document.querySelectorAll('[data-ptdeel]').forEach((b) => { b.onclick = () => { st.deel = b.dataset.ptdeel; opnieuw(); document.querySelector('.ptnav')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // bij Melden de stand van de meldingen verversen: de syndicus kan er intussen een afgehandeld hebben
    if (st.deel === 'melden') q(sb.rpc('portaal_extra')).then((e) => { const oud = JSON.stringify(st.extra.meldingen); st.extra = { mij: e?.mij ?? [], meldingen: e?.meldingen ?? [] };
      if (JSON.stringify(st.extra.meldingen) !== oud && st.deel === 'melden' && document.querySelector('.pt') && !document.querySelector('#fptm [name=titel]')?.value && !document.querySelector('#fptm [name=tekst]')?.value) opnieuw(); }).catch(() => {}); }; });
  const kies1 = document.getElementById('ptvme'); if (kies1) kies1.onchange = () => { st.vme = kies1.value; opnieuw(); };
  document.querySelectorAll('.ptkopie').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.kopie); b.textContent = 'Gekopieerd'; setTimeout(() => { b.textContent = 'Kopiëren'; }, 1800); } catch (e) { b.textContent = 'Selecteer en kopieer zelf'; } }; });
  document.querySelectorAll('[data-pdoc]').forEach((knop) => { knop.onclick = async () => {
    const doc = p.documenten.find((d) => d.id === knop.dataset.pdoc), venster = window.open('', '_blank');
    const { data, error } = await sb.storage.from('documenten').createSignedUrl(doc.pad, 120);
    if (error) { if (venster) venster.close(); fout({ message: 'Dit document kan niet geopend worden.' }); return opnieuw(); }
    if (venster) venster.location = data.signedUrl; else location.href = data.signedUrl;
  }; });
  const zoek = document.getElementById('ptzoek'); if (zoek) zoek.oninput = () => { st.zoek = zoek.value; const plek = zoek.selectionStart; opnieuw(); const z2 = document.getElementById('ptzoek'); z2.focus(); z2.setSelectionRange(plek, plek); };
  // de assistent
  const fv = document.getElementById('fptv'), stel = async (tekst) => {
    const knop = fv.querySelector('button'), uit = document.getElementById('ptvfout'); knop.disabled = true; knop.textContent = 'Even denken…'; uit.innerHTML = '';
    try { const { data, error } = await sb.functions.invoke('portaal-assistent', { body: { vraag: tekst, geschiedenis: st.gesprek.map((b) => ({ role: b.role, content: b.content })) } });
      if (error || data?.fout) { let uitleg = data?.fout ?? 'De assistent is even niet bereikbaar.'; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
      st.gesprek.push({ role: 'user', content: tekst }, { role: 'assistant', content: String(data.antwoord ?? ''), secties: (Array.isArray(data.secties) ? data.secties : []).filter((d) => PT_DELEN.some(([x]) => x === d)), naar_syndicus: !!data.naar_syndicus }); opnieuw();
    } catch (e) { knop.disabled = false; knop.textContent = 'Vraag'; uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; }
  };
  fv.onsubmit = (ev) => { ev.preventDefault(); const t = fv.vraag.value.trim(); if (t) stel(t); };
  document.querySelectorAll('.ptchip').forEach((b) => { b.onclick = () => stel(b.textContent); });
  const wis = document.getElementById('ptwis'); if (wis) wis.onclick = () => { st.gesprek = []; opnieuw(); };
  // melden en een wijziging doorgeven
  const fm = document.getElementById('fptm'); if (fm) fm.onsubmit = async (ev) => { ev.preventDefault(); const knop = fm.querySelector('button'); knop.disabled = true;
    try { await q(sb.rpc('portaal_melding', { p_vme: v.vme_id, p_titel: fm.titel.value, p_tekst: fm.tekst.value, p_plaats: fm.plaats.value, p_dringend: fm.dringend.checked }));
      const e = await q(sb.rpc('portaal_extra')); st.extra = { mij: e?.mij ?? [], meldingen: e?.meldingen ?? [] };
      S.bericht = { soort: 'ok', tekst: 'Uw melding is aangekomen bij de syndicus. U volgt ze hieronder bij "Mijn meldingen".' }; opnieuw();
    } catch (e) { knop.disabled = false; document.getElementById('ptmfout').innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; } };
  const fw = document.getElementById('fptw'); if (fw) fw.onsubmit = async (ev) => { ev.preventDefault(); const knop = fw.querySelector('button'); knop.disabled = true;
    try { await q(sb.rpc('portaal_wijziging', { p_tekst: fw.tekst.value })); S.bericht = { soort: 'ok', tekst: 'Doorgegeven. De syndicus past uw gegevens aan.' }; opnieuw(); }
    catch (e) { knop.disabled = false; document.getElementById('ptwfout').innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; } };
}
// Wie ook lid is van een kantoor, bekijkt zijn eigen eigendom via #/portaal.
UIT.routes.portaal = async () => schermPortaal(await q(sb.rpc('portaal')), true);

// ---- contacten: tabblad per VME (en #/contacten voor het hele kantoor) ----------------
const portaalNaam = (c) => c.bedrijfsnaam || [c.voornaam, c.achternaam].filter(Boolean).join(' ');
const CONTACT_VELDEN = 'id, soort, voornaam, achternaam, bedrijfsnaam, taal, emails, telefoon, gsm, adres_straat, postcode, gemeente';
const contactenHtml = (lijst, waar) => `<p class="klein">Het e-mailadres bepaalt waar mailings naartoe gaan en wie zich als eigenaar in het portaal kan aanmelden. Meerdere adressen scheid je met een komma.</p>
  ${lijst.length ? lijst.map((c) => `<details class="contact" data-id="${c.id}"${S.contactOpen === c.id ? ' open' : ''} style="border-top:1px solid var(--l);padding:8px 0">
    <summary style="cursor:pointer"><b>${esc(portaalNaam(c))}</b> <span class="klein">${esc(waar(c) || 'geen kavel')} · ${esc((c.emails ?? []).join(', ') || 'geen e-mailadres')}${c.gsm || c.telefoon ? ` · ${esc(c.gsm || c.telefoon)}` : ''}</span></summary>
    <form class="fc" data-id="${c.id}" data-soort="${c.soort}" style="margin-top:8px">
      <div class="rij">${c.soort === 'vennootschap' ? veld('Bedrijfsnaam', inp('bedrijfsnaam', `required value="${esc(c.bedrijfsnaam ?? '')}"`), '2 1 240px')
        : veld('Voornaam', inp('voornaam', `value="${esc(c.voornaam ?? '')}"`)) + veld('Achternaam', inp('achternaam', `required value="${esc(c.achternaam ?? '')}"`))}
        ${veld('Taal', kies('taal', ['nl', 'fr', 'en', 'de'].map((t) => `<option${t === (c.taal ?? 'nl') ? ' selected' : ''}>${t}</option>`).join('')), '0 1 90px')}</div>
      <div class="rij">${veld('E-mailadres(sen)', inp('emails', `value="${esc((c.emails ?? []).join(', '))}"`), '2 1 260px')}${veld('Telefoon', inp('telefoon', `value="${esc(c.telefoon ?? '')}"`))}${veld('Gsm', inp('gsm', `value="${esc(c.gsm ?? '')}"`))}</div>
      <div class="rij">${veld('Straat en nummer', inp('adres_straat', `value="${esc(c.adres_straat ?? '')}"`), '2 1 240px')}${veld('Postcode', inp('postcode', `value="${esc(c.postcode ?? '')}"`), '0 1 110px')}${veld('Gemeente', inp('gemeente', `value="${esc(c.gemeente ?? '')}"`))}</div>
      <p><button>Opslaan</button></p></form></details>`).join('') : '<p class="leeg">Nog geen contacten. Je maakt ze aan bij Beheer, wanneer je een eigenaar aan een kavel koppelt.</p>'}`;
function bindContacten(wortel, opnieuw) {
  const ok = (a) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(a);
  wortel.querySelectorAll('form.fc').forEach((f) => { f.onsubmit = async (ev) => {
    ev.preventDefault();
    const adressen = f.emails.value.split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
    S.contactOpen = f.dataset.id;
    if (!adressen.every(ok)) { fout({ message: `Geen geldig e-mailadres: ${adressen.find((a) => !ok(a))}` }); return opnieuw(); }
    const naam = f.dataset.soort === 'vennootschap' ? { bedrijfsnaam: f.bedrijfsnaam.value.trim() } : { voornaam: ofNull(f.voornaam.value), achternaam: f.achternaam.value.trim() };
    try {
      await q(sb.from('contact').update({ ...naam, taal: f.taal.value, emails: adressen, telefoon: ofNull(f.telefoon.value), gsm: ofNull(f.gsm.value),
        adres_straat: ofNull(f.adres_straat.value), postcode: ofNull(f.postcode.value), gemeente: ofNull(f.gemeente.value) }).eq('id', f.dataset.id));
      S.bericht = { soort: 'ok', tekst: 'Contact opgeslagen.' }; S.contactOpen = null;
    } catch (e) { fout(e); }
    opnieuw();
  }; });
}
// Tabblad binnen een VME: iedereen die aan een kavel van deze VME hangt (eigenaar, huurder…).
UIT.tabs.push(['contacten', 'Contacten']);
UIT.fn.contacten = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.contacten = async () => {
  const v = S.vme, doel = document.getElementById('tabinhoud');
  let relaties, lijst = [];
  try {
    relaties = await q(sb.from('kavel_relatie').select('contact_id, kavel_id, rol, eind_datum').eq('vme_id', v.id));
    const ids = [...new Set(relaties.map((r) => r.contact_id))];
    if (ids.length) lijst = await q(sb.from('contact').select(CONTACT_VELDEN).in('id', ids).order('achternaam').order('bedrijfsnaam'));
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;
  const kavel = Object.fromEntries(S.d.kavels.map((k) => [k.id, k.kavelnummer])), vandaag = new Date().toISOString().slice(0, 10);
  const waar = (c) => relaties.filter((r) => r.contact_id === c.id).map((r) => `${r.eind_datum && r.eind_datum < vandaag ? 'vroegere ' : ''}${r.rol} ${kavel[r.kavel_id] ?? ''}`).join(', ');
  doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Contacten van ${esc(v.naam)}</h3>${contactenHtml(lijst, waar)}</div>`;
  bindContacten(doel, () => schermVme());
};
// Alle contacten van het kantoor, over de VME's heen (geen knop meer op het startscherm).
UIT.routes.contacten = async () => {
  const [lijst, kavels, vmes] = await Promise.all([
    q(sb.from('contact').select(CONTACT_VELDEN).order('achternaam').order('bedrijfsnaam')),
    q(sb.from('v_kavel_eigenaar_vandaag').select('contact_id, kavelnummer, vme_id')), q(sb.from('vme').select('id, naam')),
  ]);
  const vmeNaam = Object.fromEntries(vmes.map((x) => [x.id, x.naam]));
  toon(`${terug}<div class="kaart"><h2>Contacten</h2>${contactenHtml(lijst, (c) => kavels.filter((k) => k.contact_id === c.id).map((k) => `${vmeNaam[k.vme_id] ?? ''} ${k.kavelnummer}`).join(', '))}</div>`);
  bindContacten(document, () => UIT.routes.contacten());
};
