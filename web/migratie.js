// =============================================================================
// Syndexia Platform - overdracht en overname van een VME.
//
// OVERDRACHT (tabblad per VME)  één knop maakt het overdrachtsbestand: alle stamgegevens,
//   de balans per boekjaar, wat openstaat, de dossiers en de lijst van documenten. Je kan
//   het ook als leesbare staat afdrukken voor de nieuwe syndicus.
// OVERNAME (#/overname)  je laadt zo'n bestand op, of een lijst (csv) die je van de vorige
//   syndicus kreeg, kijkt de samenvatting na en neemt over. De databank maakt de VME aan
//   met kavels, eigenaars, sleutels en rekeningen in één keer: lukt iets niet, dan komt er
//   niets. De boekhouding komt niet mee: je start met een beginbalans die je zelf boekt.
//   Je kan er ook DE HELE MAP van de vorige syndicus in slepen: het platform laat de belangrijkste
//   documenten uitlezen (basisakte, eigenaarslijst, contracten, attesten, verslagen), maakt er
//   een voorstel en een verslag van, en laadt na het overnemen alle bestanden in bij Documenten.
// =============================================================================
const MIG_SOORTEN = ['appartement', 'studio', 'handelsruimte', 'kantoor', 'garage', 'parking', 'berging', 'kelder', 'andere'];
const MIG_SJABLOON = 'kavel;soort;voornaam;naam;email;aandelen\nA1;appartement;Jan;Jansen;jan@voorbeeld.be;120\nA2;appartement;;Voorbeeld BV;info@voorbeeld.be;80\nG1;garage;Jan;Jansen;jan@voorbeeld.be;10\n';
const migDownload = (naam, tekst, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([tekst], { type })); a.download = naam; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

// Zet een lijst (csv met ; , of tab) om naar dezelfde structuur als een overdrachtsbestand.
function migLeesCsv(tekst, vmeNaam) {
  const regels = tekst.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim());
  if (regels.length < 2) throw new Error('De lijst heeft een kopregel en minstens één kavel nodig.');
  const scheiding = [';', '\t', ','].sort((a, b) => regels[0].split(b).length - regels[0].split(a).length)[0];
  const kop = regels[0].split(scheiding).map((k) => k.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const kolom = (...namen) => kop.findIndex((k) => namen.includes(k));
  const iK = kolom('kavel', 'kavelnummer'), iS = kolom('soort'), iV = kolom('voornaam'), iN = kolom('naam', 'achternaam', 'eigenaar'), iE = kolom('email', 'emailadres', 'mail'), iA = kolom('aandelen', 'aandeel', 'quotiteiten', 'quotiteit');
  if (iK < 0 || iN < 0 || iA < 0) throw new Error('De kopregel moet minstens de kolommen kavel, naam en aandelen hebben.');
  const kavels = [], contacten = new Map(), relaties = [], aandelen = [];
  regels.slice(1).forEach((regel, n) => {
    const c = regel.split(scheiding).map((x) => x.trim()), kavel = c[iK], naam = c[iN], waar = `Regel ${n + 2}`;
    if (!kavel) throw new Error(`${waar}: de kavel ontbreekt.`);
    const aandeel = Number(String(c[iA] ?? '').replace(/\./g, '').replace(',', '.'));
    if (!(aandeel > 0)) throw new Error(`${waar} (${kavel}): "${c[iA] ?? ''}" is geen geldig aantal aandelen.`);
    const soort = (iS >= 0 ? c[iS] : '').toLowerCase();
    if (soort && !MIG_SOORTEN.includes(soort)) throw new Error(`${waar} (${kavel}): soort "${soort}" bestaat niet. Kies uit: ${MIG_SOORTEN.join(', ')}.`);
    if (kavels.some((k) => k.kavelnummer === kavel)) throw new Error(`${waar}: kavel ${kavel} staat twee keer in de lijst. Zet meerdere eigenaars van één kavel later bij in Beheer.`);
    kavels.push({ kavelnummer: kavel, soort: soort || null }); aandelen.push({ kavelnummer: kavel, aandeel });
    if (naam) {
      const voornaam = iV >= 0 ? c[iV] : '', email = iE >= 0 ? c[iE] : '', sleutel = `${voornaam}|${naam}|${email}`.toLowerCase();
      if (!contacten.has(sleutel)) contacten.set(sleutel, { ref: `c${contacten.size + 1}`, soort: voornaam ? 'persoon' : (/\b(bv|nv|vof|cv|vzw|comm\.? ?v|bvba|srl|sa)\b/i.test(naam) ? 'vennootschap' : 'persoon'), voornaam: voornaam || null, emails: email ? [email] : [] });
      const ct = contacten.get(sleutel); if (ct.soort === 'vennootschap') ct.bedrijfsnaam = naam; else ct.achternaam = naam;
      relaties.push({ kavelnummer: kavel, contact_ref: ct.ref, rol: 'eigenaar' });
    }
  });
  const totaal = Math.round(aandelen.reduce((s, a) => s + a.aandeel, 0) * 10000) / 10000;
  return { formaat: 'syndexia-overdracht', versie: 1, bron: 'lijst', vme: { naam: vmeNaam }, kavels, contacten: [...contacten.values()], relaties,
    sleutels: [{ code: '1.0', naam: 'Basisakte', totaal_aandelen: totaal, is_basisakte: true, aandelen }], bankrekeningen: [] };
}

// ---- tabblad Overdracht ---------------------------------------------------------------
UIT.tabs.push(['overdracht', 'Overdracht']);
UIT.fn.overdracht = () => `<style>@media print { body.ovdruk * { visibility: hidden } body.ovdruk #ovstaat, body.ovdruk #ovstaat * { visibility: visible } body.ovdruk #ovstaat { position: absolute; left: 0; top: 0; width: 100%; border: 0; box-shadow: none } body.ovdruk .geen-druk { display: none !important } }</style>
  <div class="kaart"><h3 style="margin-top:0">Overdracht van ${esc(S.vme.naam)}</h3>
    <p class="klein">Neemt een andere syndicus dit gebouw over, dan zet deze knop alles klaar: stamgegevens, kavels en eigenaars, verdeelsleutels, bankrekeningen, de balans per boekjaar, wat nog openstaat, de dossiers en de lijst van documenten. Het bestand bevat persoonsgegevens van de eigenaars: bezorg het alleen aan de nieuwe syndicus.</p>
    <p><button id="ovmaak">Overdrachtsdossier klaarzetten</button></p><div id="ovuit"></div></div>`;
UIT.bind.overdracht = () => {
  const v = S.vme, uit = document.getElementById('ovuit');
  document.getElementById('ovmaak').onclick = async (ev) => {
    ev.target.disabled = true; uit.innerHTML = '<p class="leeg">Bezig met samenstellen…</p>';
    let d;
    try { d = await q(sb.rpc('overdracht_vme', { p_vme: v.id })); } catch (e) { uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; ev.target.disabled = false; return; }
    ev.target.disabled = false;
    const naamVan = (c) => c.bedrijfsnaam || [c.voornaam, c.achternaam].filter(Boolean).join(' '), perRef = Object.fromEntries(d.contacten.map((c) => [c.ref, c]));
    const dicht = [...d.boekjaren].reverse().find((j) => j.afgesloten), laatste = d.boekjaren[d.boekjaren.length - 1];
    uit.innerHTML = `<p class="geen-druk"><button class="stil" id="ovbestand">Bestand downloaden (voor overname in het platform)</button> <button class="stil" id="ovdruk">Staat afdrukken of bewaren als pdf</button></p>
      <div class="kaart" id="ovstaat"><p style="text-align:right">${esc(S.kantoor.naam)}<br>${dat(new Date().toISOString().slice(0, 10))}</p><h2>Overdrachtsstaat ${esc(d.vme.naam)}</h2>
        <p>${esc([d.vme.adres_straat, [d.vme.postcode, d.vme.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', '))}${d.vme.ondernemingsnummer ? ` · ${esc(d.vme.ondernemingsnummer)}` : ''}</p>
        <h4>Kavels en eigenaars</h4>${tabel(['Kavel', 'Soort', 'Eigenaar(s) en andere relaties'], d.kavels.map((k) => `<tr>${cel(k.kavelnummer)}${cel(k.soort)}${cel(d.relaties.filter((r) => r.kavelnummer === k.kavelnummer).map((r) => `${naamVan(perRef[r.contact_ref] ?? {})} (${r.rol}${r.eind_datum ? ` tot ${dat(r.eind_datum)}` : ''})`).join(', '))}</tr>`))}
        <h4>Verdeelsleutels</h4>${d.sleutels.map((s) => `<p><b>${esc(s.code)} ${esc(s.naam)}</b> (totaal ${esc(s.totaal_aandelen)}): ${esc(s.aandelen.map((a) => `${a.kavelnummer} ${a.aandeel}`).join(' · '))}</p>`).join('') || '<p class="leeg">Geen.</p>'}
        <h4>Bankrekeningen</h4><p>${esc(d.bankrekeningen.map((b) => `${b.soort}: ${b.iban}`).join(' · ') || 'Geen.')}</p>
        <h4>Balans ${dicht ? `van het laatst afgesloten boekjaar ${esc(dicht.omschrijving)}` : laatste ? `van het lopende boekjaar ${esc(laatste.omschrijving)} (nog niet afgesloten)` : ''}</h4>
        ${(dicht ?? laatste) ? tabel(['Rekening', 'Naam', '#Debet', '#Credit'], (dicht ?? laatste).balans.map((b) => `<tr>${cel(b.nummer)}${cel(b.naam)}${celN(b.debet)}${celN(b.credit)}</tr>`)) : '<p class="leeg">Geen boekjaar.</p>'}
        <h4>Openstaande provisies</h4>${d.openstaande_provisies.length ? tabel(['Kavel', 'Datum', 'Omschrijving', '#Bedrag', '#Betaald', '#Openstaand'], d.openstaande_provisies.map((p) => `<tr>${cel(p.kavelnummer)}${cel(dat(p.datum))}${cel(p.omschrijving ?? 'provisie')}${celN(p.bedrag)}${celN(p.betaald)}${celN(p.openstaand)}</tr>`)) : '<p>Geen.</p>'}
        <h4>Nog te betalen aan leveranciers</h4>${d.openstaand_leveranciers.length ? tabel(['Leverancier', '#Openstaand'], d.openstaand_leveranciers.map((l) => `<tr>${cel(l.naam)}${celN(l.openstaand)}</tr>`)) : '<p>Geen.</p>'}
        <h4>Dossiers</h4>${d.dossiers.length ? `<ul>${d.dossiers.map((x) => `<li>#${x.nummer} ${esc(x.titel)} (${esc(x.soort)}, ${esc(x.status)}), ${x.notities.length} notitie(s)</li>`).join('')}</ul>` : '<p>Geen.</p>'}
        <h4>Documenten (${d.documenten.length})</h4><p class="klein">${esc(d.documenten.map((x) => `${x.map}: ${x.naam}`).join(' · ') || 'Geen opgeladen.')}</p>
        <p class="klein">De documenten zelf zitten niet in het bestand: bezorg ze apart.</p></div>`;
    document.getElementById('ovbestand').onclick = () => migDownload(`overdracht-${v.naam.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.json`, JSON.stringify(d, null, 2), 'application/json');
    document.getElementById('ovdruk').onclick = () => { document.body.classList.add('ovdruk'); window.print(); document.body.classList.remove('ovdruk'); };
  };
};

// ---- een hele map inlezen ------------------------------------------------------------------
const MIG_GEHEIM = /wachtwoord|paswoord|password|passwd|login|account\.txt$/i, MIG_ROMMEL = /(^|\/)(~\$|\.|desktop\.ini$|thumbs\.db$)/i;
const MIG_LEESBAAR = /\.(pdf|docx|xlsx|xlsm|csv|txt|jpe?g|png|webp)$/i, MIG_LEES_MAX = 4.4 * 1024 * 1024, MIG_LEES_AANTAL = 40;
// Hoe waarschijnlijk is het dat een document iets zegt over kavels, eigenaars, contracten of attesten?
const MIG_WOORDEN = [[/basisakte|statuten|splitsingsakte/i, 10], [/eigenaar|bewoner|contactlijst|adreslijst|ledenlijst/i, 9], [/quotiteit|verdeelsleutel|aandelen|duizendsten/i, 9], [/overdracht|overname/i, 8],
  [/reglement/i, 7], [/balans|afrekening|afsluiting/i, 7], [/asbest|epc|keuring|attest|postinterventie|\bpid\b/i, 6], [/verslag|notulen|algemene vergadering|(^|[^a-z])av([^a-z]|$)/i, 5], [/contract|overeenkomst|onderhoud/i, 5], [/polis|verzekering/i, 5], [/saldo|uittreksel/i, 3]];
const migScore = (pad) => MIG_WOORDEN.reduce((t, [re, p]) => t + (re.test(pad) ? p : 0), 0);
const migGrootte = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
// Een map die je in het venster sleept: de browser geeft "entries" die we zelf moeten aflopen.
async function migUitSleep(entries) {
  const uit = [];
  const loop = async (e, pad) => {
    if (uit.length >= 5000) return;
    if (e.isFile) uit.push({ file: await new Promise((ok, nok) => e.file(ok, nok)), pad: pad + e.name });
    else if (e.isDirectory) { const lezer = e.createReader();
      for (;;) { const deel = await new Promise((ok, nok) => lezer.readEntries(ok, nok)); if (!deel.length) break; for (const k of deel) await loop(k, `${pad}${e.name}/`); } }
  };
  for (const e of entries) await loop(e, '');
  return uit;
}
// Maakt van de gekozen bestanden de werklijst: rommel en bestanden met wachtwoorden eruit, en een eerste keuze van wat gelezen wordt.
function migMaakMap(ruw) {
  const alle = ruw.filter((b) => !MIG_ROMMEL.test(b.pad) && b.file.size > 0), bestanden = alle.filter((b) => !MIG_GEHEIM.test(b.file.name));
  if (!bestanden.length) throw new Error('Er zitten geen bruikbare bestanden in deze map.');
  const wortel = bestanden.every((b) => b.pad.includes('/')) ? bestanden[0].pad.split('/')[0] : '';
  const eenWortel = wortel && bestanden.every((b) => b.pad.startsWith(`${wortel}/`));
  for (const b of bestanden) { b.kort = eenWortel ? b.pad.slice(wortel.length + 1) : b.pad; b.kan = MIG_LEESBAAR.test(b.file.name) && b.file.size <= MIG_LEES_MAX; b.score = b.kan ? migScore(b.kort) : 0; b.lees = false; }
  // De keuze gebeurt vanzelf: eerst wat er belangrijk uitziet (hoogste score), daarna de rest,
  // telkens het recentste eerst, tot het maximum dat in één keer gelezen wordt.
  [...bestanden].filter((b) => b.kan).sort((x, y) => y.score - x.score || y.file.lastModified - x.file.lastModified).slice(0, MIG_LEES_AANTAL).forEach((b) => { b.lees = true; });
  bestanden.sort((x, y) => x.kort.localeCompare(y.kort));
  return { naam: eenWortel ? wortel : '', bestanden, geheim: alle.length - bestanden.length };
}
const migBase64 = (file) => new Promise((ok, nok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => nok(new Error('Het bestand kon niet gelezen worden.')); r.readAsDataURL(file); });
async function migRoep(body) {
  const { data, error } = await sb.functions.invoke('overname', { body });
  if (error || data?.fout) { let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ } throw new Error(uitleg); }
  return data;
}
const migVerslagTekst = (vs, map) => [`Overname uit de map "${map?.naam || 'zonder naam'}" (${map?.bestanden.length ?? 0} bestanden, ${map?.bestanden.filter((b) => b.uittreksel).length ?? 0} uitgelezen).`, vs.samenvatting,
  ...[['Kijk na', vs.meldingen], ['Documenten spreken elkaar tegen', vs.tegenstrijdig], ['Ontbreekt in de map', vs.ontbreekt], ['Op te volgen', vs.aandachtspunten], ['Voor de beginbalans', vs.financieel], ['Bankrekeningen vermeld in de documenten (zelf invullen bij Bank)', vs.bankrekeningen]]
    .filter(([, l]) => l?.length).map(([t, l]) => `${t}:\n${l.map((x) => `- ${x}`).join('\n')}`)].filter(Boolean).join('\n\n');

// ---- pagina: overname -------------------------------------------------------------------
UIT.vandaag.push('<p><a class="knop licht" href="#/overname">Gebouw uit een map</a></p>');
UIT.routes.overname = async () => {
  const jaar = new Date().getFullYear(), st = (S.overname ??= { data: null });
  const d = st.data;
  const map = st.map, vs = st.verslag, teLezen = map ? map.bestanden.filter((b) => b.lees) : [];
  const blok = (titel, l, soort = '') => (l?.length ? `<h4>${titel}</h4><ul class="ovlijst ${soort}">${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  toon(`${terug}<div class="kaart"><h2>Nieuw gebouw uit een map</h2>
    <p class="klein">Sleep de volledige map van het gebouw hierheen. Het platform leest de documenten zelf (basisakte, eigenaarslijst, verdeelsleutels, contracten, attesten, verslagen, afrekening) en zet het hele gebouw klaar: kavels, eigenaars, verdeelsleutels, leveranciers, attesten, lopende dossiers, taken en alle documenten. Jij kijkt het voorstel na en klikt één keer op Gebouw aanmaken. Bestanden met wachtwoorden of logins worden nooit meegenomen.</p>
    <div id="ovdrop" class="ovdrop" tabindex="0"><b>Sleep hier de map van de VME</b><span class="klein">of</span>
      <span><label class="knop licht" for="ovmap">Map kiezen</label> <label class="knop licht" for="ovlos">Losse bestanden kiezen</label></span>
      <input type="file" id="ovmap" webkitdirectory multiple hidden><input type="file" id="ovlos" multiple hidden></div>
    <div id="ovmapuit">${map && !d ? `<p><b>${esc(map.naam || 'Gekozen bestanden')}</b>: ${map.bestanden.length} bestanden${map.geheim ? `, ${map.geheim} met wachtwoorden of logins niet meegenomen` : ''}. ${teLezen.length} document(en) worden uitgelezen (hoogstens ${MIG_LEES_AANTAL}); alle bestanden komen daarna bij Documenten.</p>
      <details${st.auto ? '' : ' open'}><summary>Welke documenten gelezen worden</summary><div class="schuif ovkies"><table><thead><tr><th>Lezen</th><th>Bestand</th><th class="n">Grootte</th></tr></thead><tbody>${map.bestanden.map((b, n) => `<tr><td><input type="checkbox" data-lees="${n}"${b.lees ? ' checked' : ''}${b.kan ? '' : ' disabled'} aria-label="${esc(b.file.name)} laten uitlezen"></td><td style="white-space:normal;overflow-wrap:anywhere">${esc(b.kort)}${b.kan ? '' : ` <span class="klein">(${MIG_LEESBAAR.test(b.file.name) ? 'te groot om te lezen' : 'dit soort bestand wordt niet gelezen'})</span>`}${b.fout ? ` <span class="pil fout">${esc(b.fout)}</span>` : b.uittreksel ? ` <span class="pil ok">${esc(b.uittreksel.soort)}</span>` : ''}</td><td class="n">${migGrootte(b.file.size)}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="klein">De aangevinkte documenten gaan naar de AI-dienst (Claude van Anthropic) om gelezen te worden. Ze bevatten wellicht persoonsgegevens van eigenaars.</p>
      <p><button type="button" id="ovlees"${teLezen.length ? '' : ' disabled'}>${teLezen.length} document(en) laten uitlezen</button> <button type="button" class="stil" id="ovmapweg">Andere map kiezen</button></p><div id="ovvoortgang"></div>` : ''}</div>
    ${vs && d ? `<div class="ovverslag"><h3 style="margin-top:0">Wat de map zegt</h3><p>${esc(vs.samenvatting)}</p>
      ${blok('Kijk na voor je overneemt', vs.meldingen, 'warn')}${blok('Documenten spreken elkaar tegen', vs.tegenstrijdig, 'warn')}${blok('Ontbreekt in de map', vs.ontbreekt, 'fout')}${blok('Op te volgen', vs.aandachtspunten)}${blok('Voor de beginbalans', vs.financieel)}
      ${vs.bankrekeningen?.length ? `${blok('Bankrekeningen vermeld in de documenten', vs.bankrekeningen)}<p class="klein">Rekeningnummers worden niet overgenomen: vul ze zelf in bij Bank.</p>` : ''}</div>` : ''}
    <h3>Of een bestand</h3>
    <p class="klein">Laad het overdrachtsbestand van de vorige syndicus op (een .json uit dit platform), of een lijst met de kavels, eigenaars en aandelen (.csv). Je krijgt eerst een samenvatting; er wordt pas iets aangemaakt als je op Overnemen klikt.</p>
    <p><input type="file" id="ovin" accept=".json,.csv,.txt,application/json,text/csv"> <button type="button" class="stil" id="ovsjab">Voorbeeldlijst downloaden</button></p><div id="ovfout"></div>
    ${d ? `<h3>Samenvatting</h3>
      <form id="fov"><div class="rij">${veld('Naam van de VME', inp('naam', `required value="${esc(d.vme.naam ?? '')}"`), '3 1 260px')}${veld('Ondernemingsnummer', inp('ond', `value="${esc(d.vme.ondernemingsnummer ?? '')}"`))}</div>
        <div class="rij">${veld('Straat en nummer', inp('straat', `value="${esc(d.vme.adres_straat ?? '')}"`), '3 1 260px')}${veld('Postcode', inp('postcode', `value="${esc(d.vme.postcode ?? '')}"`))}${veld('Gemeente', inp('gemeente', `value="${esc(d.vme.gemeente ?? '')}"`))}</div>
        <div class="rij">${veld('Eerste boekjaar van', inp('start', `type="date" required value="${jaar}-01-01"`))}${veld('tot en met', inp('eind', `type="date" required value="${jaar}-12-31"`))}</div>
        <p><b>${d.kavels.length}</b> kavels · <b>${d.contacten.length}</b> contacten · <b>${d.relaties.length}</b> relaties · <b>${d.sleutels.length}</b> verdeelsleutel(s) · <b>${d.bankrekeningen.length}</b> bankrekening(en)</p>
        ${d.sleutels.map((s) => { const som1 = Math.round(s.aandelen.reduce((t, a) => t + Number(a.aandeel), 0) * 10000) / 10000; return `<p class="klein">Sleutel ${esc(s.code)} ${esc(s.naam)}: totaal ${esc(s.totaal_aandelen)}, som van de kavels ${som1} ${som1 === Number(s.totaal_aandelen) ? '<span class="pil ok">sluit</span>' : '<span class="pil fout">sluit niet</span>'}</p>`; }).join('')}
        ${tabel(['Kavel', 'Soort', 'Eigenaar(s)'], d.kavels.map((k) => `<tr>${cel(k.kavelnummer)}${cel(k.soort)}${cel(d.relaties.filter((r) => r.kavelnummer === k.kavelnummer).map((r) => { const c = d.contacten.find((x) => String(x.ref) === String(r.contact_ref)) ?? {}; return c.bedrijfsnaam || [c.voornaam, c.achternaam].filter(Boolean).join(' '); }).join(', '))}</tr>`))}
        ${d.boekjaren?.length ? '<p class="klein"><span class="pil warn">let op</span> De boekhouding van de vorige syndicus wordt niet overgenomen. Boek zelf de beginbalans op basis van zijn afgesloten balans; die staat in het bestand en op zijn overdrachtsstaat.</p>' : ''}
        ${vs ? `<h3>Wat er na het overnemen meteen bijkomt</h3>
          ${map ? `<label class="ovvink"><input type="checkbox" name="mdoc" checked> Alle ${map.bestanden.length} bestanden uit de map inladen bij Documenten</label>` : ''}
          <label class="ovvink"><input type="checkbox" name="mdos" checked> Het verslag bewaren als dossier, met een taak per ontbrekend stuk</label>
          ${vs.leveranciers.length ? `<p style="margin-bottom:4px"><b>Leveranciers uit de documenten</b> <span class="klein">(wie al bestaat in je kantoor wordt overgeslagen)</span></p>${vs.leveranciers.map((l, n) => `<label class="ovvink"><input type="checkbox" name="mlev" value="${n}" checked> ${esc(l.naam)} <span class="klein">${esc([l.categorie, l.wat].filter(Boolean).join(' · '))}</span></label>`).join('')}` : ''}
          ${vs.attesten.length ? `<p style="margin-bottom:4px"><b>Attesten uit de documenten</b></p>${vs.attesten.map((a, n) => `<label class="ovvink"><input type="checkbox" name="matt" value="${n}" checked> ${esc(a.soort)} van ${dat(a.datum)}${a.geldig_tot ? `, geldig tot ${dat(a.geldig_tot)}` : ''} <span class="klein">${esc(a.uitvoerder ?? '')}</span></label>`).join('')}` : ''}` : ''}
        ${vs?.dossiers?.length ? `<p style="margin-bottom:4px"><b>Lopende dossiers uit de documenten</b></p>${vs.dossiers.map((x, n) => `<label class="ovvink"><input type="checkbox" name="mzaak" value="${n}" checked> ${esc(x.titel)}${x.dringend ? ' <span class="pil fout">dringend</span>' : ''} <span class="klein">${esc(x.soort)}</span></label>`).join('')}` : ''}
        ${vs?.taken?.length ? `<p style="margin-bottom:4px"><b>Taken uit de documenten</b></p>${vs.taken.map((x, n) => `<label class="ovvink"><input type="checkbox" name="mtaak" value="${n}" checked> ${esc(x.titel)}${x.tegen ? ` <span class="klein">tegen ${dat(x.tegen)}</span>` : ''}</label>`).join('')}` : ''}
        ${vs?.vergadering && vs.vergadering.datum >= new Date().toISOString().slice(0, 10) ? `<label class="ovvink"><input type="checkbox" name="mav" checked> Algemene vergadering inplannen op ${dat(vs.vergadering.datum)}${vs.vergadering.tijdstip ? ` om ${esc(vs.vergadering.tijdstip)}` : ''} <span class="klein">${esc(vs.vergadering.plaats ?? '')}</span></label>` : ''}
        ${vs?.beginbalans?.length ? `<h3>Beginbalans volgens de documenten</h3>${tabel(['Post', 'Datum', 'Bron', '#Bedrag'], vs.beginbalans.map((x) => `<tr>${cel(x.post)}${cel(x.datum ? dat(x.datum) : '')}${cel(x.bron ?? '')}${celN(eur(x.bedrag))}</tr>`))}<p class="klein"><span class="pil warn">let op</span> Deze bedragen worden niet geboekt. Ze komen in het overnamedossier, met een taak om de beginbalans na te kijken en te boeken.</p>` : ''}
        <p><button>${vs ? 'Gebouw aanmaken' : 'Overnemen'}</button> ${map ? '<button type="button" class="stil" id="ovkiezen">Andere documenten laten lezen</button> ' : ''}<button type="button" class="stil" id="ovweg">Annuleren</button></p></form>` : ''}</div>`);
  // ---- de map: kiezen, slepen, laten uitlezen ----
  const neemMap = (ruw) => { try { st.map = migMaakMap(ruw); st.data = null; st.verslag = null; st.auto = st.map.bestanden.some((b) => b.lees); UIT.routes.overname(); } catch (e) { document.getElementById('ovfout').innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; } };
  const drop = document.getElementById('ovdrop');
  for (const id of ['ovmap', 'ovlos']) document.getElementById(id).onchange = (ev) => { const b = [...ev.target.files]; if (b.length) neemMap(b.map((f) => ({ file: f, pad: f.webkitRelativePath || f.name }))); };
  drop.ondragover = (ev) => { ev.preventDefault(); drop.classList.add('val'); }; drop.ondragleave = () => drop.classList.remove('val');
  drop.ondrop = async (ev) => { ev.preventDefault(); drop.classList.remove('val');
    // de entries moeten meteen opgevraagd worden: na het eerste wachten zijn ze weg
    const entries = [...(ev.dataTransfer?.items ?? [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean), los = [...(ev.dataTransfer?.files ?? [])];
    drop.querySelector('b').textContent = 'Map wordt ingelezen…';
    try { neemMap(entries.length ? await migUitSleep(entries) : los.map((f) => ({ file: f, pad: f.name }))); } catch (e) { document.getElementById('ovfout').innerHTML = `<div class="melding fout">De map kon niet gelezen worden: ${esc(e.message)}</div>`; drop.querySelector('b').textContent = 'Sleep hier de map van de VME'; } };
  if (map && !d) {
    const knop = document.getElementById('ovlees');
    document.querySelectorAll('[data-lees]').forEach((v) => { v.onchange = () => { const b = map.bestanden[Number(v.dataset.lees)]; if (v.checked && map.bestanden.filter((x) => x.lees).length >= MIG_LEES_AANTAL) { v.checked = false; return; } b.lees = v.checked; const n = map.bestanden.filter((x) => x.lees).length; knop.textContent = `${n} document(en) laten uitlezen`; knop.disabled = !n; }; });
    document.getElementById('ovmapweg').onclick = () => { st.map = null; UIT.routes.overname(); };
    knop.onclick = async () => {
      const lijst = map.bestanden.filter((b) => b.lees), uit = document.getElementById('ovvoortgang'); let klaar = 0;
      knop.disabled = true; document.querySelectorAll('[data-lees], #ovmapweg').forEach((e) => { e.disabled = true; });
      const stand = (t) => { uit.innerHTML = `<p class="klein">${esc(t)}</p><progress max="${lijst.length + 1}" value="${klaar}" style="width:100%"></progress>`; };
      stand(`Bezig met lezen: 0 van ${lijst.length}. Een lang document kan een minuut duren.`);
      // drie documenten tegelijk; een document dat mislukt houdt de rest niet tegen
      const rij = [...lijst], werk = async () => { for (let b = rij.shift(); b; b = rij.shift()) {
        b.fout = null;
        try { if (!b.uittreksel) b.uittreksel = (await migRoep({ actie: 'lees', naam: b.file.name, pad: b.kort, base64: await migBase64(b.file) })).uittreksel; } catch (e) { b.fout = e.message.slice(0, 120); }
        klaar++; stand(`Bezig met lezen: ${klaar} van ${lijst.length} · ${b.file.name}`); } };
      await Promise.all([werk(), werk(), werk()]);
      const gelezen = lijst.filter((b) => b.uittreksel);
      if (!gelezen.length) { S.bericht = { soort: 'fout', tekst: `Geen enkel document kon gelezen worden. ${lijst[0]?.fout ?? ''}` }; return UIT.routes.overname(); }
      stand(`Alle documenten zijn gelezen (${gelezen.length} van ${lijst.length}). Het voorstel wordt opgemaakt…`);
      try { const r = await migRoep({ actie: 'bundel', mapnaam: map.naam, documenten: gelezen.map((b) => ({ naam: b.file.name, pad: b.kort, uittreksel: b.uittreksel })) });
        for (const k of ['kavels', 'contacten', 'relaties', 'sleutels', 'bankrekeningen']) if (!Array.isArray(r.data[k])) r.data[k] = [];
        st.data = r.data; st.verslag = r.verslag;
        if (!r.data.kavels.length) S.bericht = { soort: 'fout', tekst: 'In de gelezen documenten zijn geen kavels gevonden. Vink de basisakte of een eigenaarslijst aan en probeer opnieuw, of neem over met een lijst (csv).' };
      } catch (e) { S.bericht = { soort: 'fout', tekst: `Het voorstel kon niet gemaakt worden: ${e.message}` }; }
      UIT.routes.overname();
    };
  }
  // Na het kiezen van een map begint het lezen vanzelf; de lijst aanpassen kan daarna nog.
  if (map && !d && st.auto) { st.auto = false; document.getElementById('ovlees').click(); }
  const anders = document.getElementById('ovkiezen'); if (anders) anders.onclick = () => { st.data = null; st.verslag = null; st.auto = false; UIT.routes.overname(); };
  const mis = (t) => { document.getElementById('ovfout').innerHTML = `<div class="melding fout">${esc(t)}</div>`; };
  document.getElementById('ovsjab').onclick = () => migDownload('voorbeeld-overname.csv', MIG_SJABLOON, 'text/csv');
  document.getElementById('ovin').onchange = async (ev) => {
    const bestand = ev.target.files[0]; if (!bestand) return;
    try {
      const tekst = await bestand.text();
      let data;
      if (/^\s*\{/.test(tekst)) { data = JSON.parse(tekst); if (data.formaat !== 'syndexia-overdracht') throw new Error('Dit is geen overdrachtsbestand van het Syndexia Platform.'); }
      else data = migLeesCsv(tekst, bestand.name.replace(/\.[^.]+$/, ''));
      for (const k of ['kavels', 'contacten', 'relaties', 'sleutels', 'bankrekeningen']) if (!Array.isArray(data[k])) data[k] = [];
      if (!data.vme || !data.kavels.length) throw new Error('Het bestand bevat geen kavels.');
      st.data = data; UIT.routes.overname();
    } catch (e) { mis(e instanceof SyntaxError ? 'Het bestand is geen geldige JSON.' : e.message); ev.target.value = ''; }
  };
  if (!d) return;
  document.getElementById('ovweg').onclick = () => { st.data = null; st.verslag = null; UIT.routes.overname(); };
  bijVerzenden('fov', async (f) => {
    const data = { ...d, vme: { naam: f.naam.value.trim(), ondernemingsnummer: ofNull(f.ond.value), adres_straat: ofNull(f.straat.value), postcode: ofNull(f.postcode.value), gemeente: ofNull(f.gemeente.value) } };
    const id = await q(sb.rpc('overname_vme', { p_kantoor: S.kantoor.id, p_data: data, p_boekjaar_start: f.start.value, p_boekjaar_eind: f.eind.value }));
    const extra = [];
    if (vs) {
      // Vanaf hier bestaat de VME al. Wat hierna misloopt wordt gemeld, maar draait de overname niet terug.
      const uit = document.getElementById('ovfout'), stand = (t) => { uit.innerHTML = `<div class="melding">${esc(t)}</div>`; uit.scrollIntoView({ block: 'nearest' }); }, k = S.kantoor.id;
      const gekozen = (naam) => [...f.querySelectorAll(`[name=${naam}]:checked`)].map((v) => Number(v.value));
      try { const levs = gekozen('mlev').map((n) => vs.leveranciers[n]).filter(Boolean);
        if (levs.length) { stand('Leveranciers aanmaken…'); const bestaand = new Set((await q(sb.from('leverancier').select('naam'))).map((l) => l.naam.trim().toLowerCase())), nieuw = levs.filter((l) => !bestaand.has(l.naam.trim().toLowerCase()));
          if (nieuw.length) await q(sb.from('leverancier').insert(nieuw.map((l) => ({ kantoor_id: k, naam: l.naam, categorie: l.categorie, email: l.email, telefoon: l.telefoon, notitie: l.wat ? `${data.vme.naam}: ${l.wat}` : null }))));
          extra.push(`${nieuw.length} leverancier(s) aangemaakt`); } } catch (e) { extra.push(`leveranciers mislukt (${e.message})`); }
      try { const atts = gekozen('matt').map((n) => vs.attesten[n]).filter(Boolean);
        if (atts.length) { stand('Attesten invoeren…'); await q(sb.from('attest').insert(atts.map((a) => ({ kantoor_id: k, vme_id: id, soort: a.soort, datum: a.datum, geldig_tot: a.geldig_tot && a.geldig_tot >= a.datum ? a.geldig_tot : null, uitvoerder: a.uitvoerder, resultaat: a.resultaat, notitie: 'Overgenomen uit de map van de vorige syndicus. Kijk na met het attest zelf.' })))); extra.push(`${atts.length} attest(en) ingevoerd`); } } catch (e) { extra.push(`attesten mislukt (${e.message})`); }
      if (f.mdos?.checked) try { stand('Verslag bewaren als dossier…');
        const [dos] = await q(sb.from('dossier').insert({ kantoor_id: k, vme_id: id, titel: 'Overname: bevindingen uit de map van de vorige syndicus', soort: 'administratie', omschrijving: migVerslagTekst(vs, map).slice(0, 20000) }).select('id'));
        const taken = vs.ontbreekt.slice(0, 20).map((t) => ({ kantoor_id: k, vme_id: id, dossier_id: dos.id, titel: `Opvragen bij de vorige syndicus: ${t}`.slice(0, 200) }));
        if (taken.length) await q(sb.from('taak').insert(taken));
        extra.push(`dossier met ${taken.length} taak/taken`); } catch (e) { extra.push(`dossier mislukt (${e.message})`); }
      try { const zaken = gekozen('mzaak').map((n) => vs.dossiers?.[n]).filter(Boolean);
        if (zaken.length) { stand('Lopende dossiers openen…'); await q(sb.from('dossier').insert(zaken.map((x) => ({ kantoor_id: k, vme_id: id, titel: x.titel, soort: x.soort, dringend: x.dringend, omschrijving: `${x.omschrijving ?? ''}\n\nOvergenomen uit de map van de vorige syndicus. Kijk na met de documenten zelf.`.trim() })))); extra.push(`${zaken.length} lopend(e) dossier(s) geopend`); } } catch (e) { extra.push(`dossiers mislukt (${e.message})`); }
      try { const tk = gekozen('mtaak').map((n) => vs.taken?.[n]).filter(Boolean).map((x) => ({ kantoor_id: k, vme_id: id, titel: x.titel, vervaldatum: x.tegen, omschrijving: null }));   // elke rij dezelfde velden: dat eist de databank bij meerdere rijen tegelijk
        if (vs.beginbalans?.length) tk.push({ kantoor_id: k, vme_id: id, titel: 'Beginbalans nakijken en boeken', vervaldatum: null, omschrijving: vs.beginbalans.map((x) => `${x.post}: ${eur(x.bedrag)}${x.datum ? ` op ${dat(x.datum)}` : ''}${x.bron ? ` (${x.bron})` : ''}`).join('; ').slice(0, 1000) });
        if (tk.length) { stand('Taken klaarzetten…'); await q(sb.from('taak').insert(tk)); extra.push(`${tk.length} taak/taken klaargezet`); } } catch (e) { extra.push(`taken mislukt (${e.message})`); }
      if (f.mav?.checked && vs.vergadering) try { stand('Vergadering inplannen…'); await q(sb.from('vergadering').insert({ kantoor_id: k, vme_id: id, datum: vs.vergadering.datum, tijdstip: vs.vergadering.tijdstip, plaats: vs.vergadering.plaats, soort: 'gewone', status: 'gepland' })); extra.push(`vergadering gepland op ${dat(vs.vergadering.datum)}`); } catch (e) { extra.push(`vergadering mislukt (${e.message})`); }
      if (map && f.mdoc?.checked) { let gelukt = 0, over = 0; const fouten = [];
        // de eerste submap bepaalt de map bij Documenten, net als bij "hele map inladen" daar
        const kiesMap = (b) => { const stukken = b.kort.split('/'), sub = stukken.length > 1 ? stukken[0].trim() : 'Algemeen', nr = (sub.match(/^(\d)\./) ?? [])[1]; return DOC_MAPPEN.find((m) => nr && m.startsWith(`${nr}.`)) ?? (DOC_MAPPEN.find((m) => m.toLowerCase() === sub.toLowerCase()) ?? sub.slice(0, 80)); };
        const gehad = new Set();
        for (const [nr, b] of map.bestanden.entries()) {
          stand(`Documenten inladen: ${nr + 1} van ${map.bestanden.length} · ${b.file.name}. Laat dit venster open.`);
          const doel = kiesMap(b); if (b.file.size > DOC_MAX || gehad.has(`${doel}\n${b.file.name}`)) { over++; continue; }
          try { const ext = (b.file.name.match(/\.([A-Za-z0-9]{1,8})$/) ?? [])[1], pad = `${k}/${id}/${crypto.randomUUID()}${ext ? '.' + ext.toLowerCase() : ''}`;
            const { error } = await opslag().upload(pad, b.file, { contentType: b.file.type || 'application/octet-stream', upsert: false }); if (error) throw new Error(error.message);
            try { await q(sb.from('document').insert({ kantoor_id: k, vme_id: id, map: doel, naam: b.file.name, pad, grootte: b.file.size, soort: b.file.type || null })); } catch (e) { await opslag().remove([pad]); throw e; }
            gehad.add(`${doel}\n${b.file.name}`); gelukt++;
          } catch (e) { fouten.push(`${b.file.name}: ${e.message}`); if (fouten.length >= 10) break; } }
        extra.push(`${gelukt} document(en) ingeladen${over ? `, ${over} overgeslagen (te groot of dubbel)` : ''}${fouten.length ? `, ${fouten.length} mislukt${fouten.length >= 10 ? ' (gestopt na 10 fouten)' : ''}: ${fouten.slice(0, 2).join(' · ')}` : ''}`); }
    }
    st.data = null; st.verslag = null; st.map = null; S.bericht = { soort: extra.some((x) => x.includes('mislukt')) ? 'fout' : 'ok', tekst: `${data.vme.naam} is aangemaakt met ${d.kavels.length} kavels${extra.length ? `; ${extra.join('; ')}` : ''}. Kijk Beheer na, boek de beginbalans en vul de bankrekeningen in.` };
    location.hash = `#/vme/${id}/beheer`;
  }, UIT.routes.overname);
};
