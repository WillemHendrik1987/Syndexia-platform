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

// ---- pagina: overname -------------------------------------------------------------------
UIT.vandaag.push('<p><a class="knop licht" href="#/overname">Gebouw overnemen</a></p>');
UIT.routes.overname = async () => {
  const jaar = new Date().getFullYear(), st = (S.overname ??= { data: null });
  const d = st.data;
  toon(`${terug}<div class="kaart"><h2>Gebouw overnemen</h2>
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
        <p><button>Overnemen</button> <button type="button" class="stil" id="ovweg">Annuleren</button></p></form>` : ''}</div>`);
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
  document.getElementById('ovweg').onclick = () => { st.data = null; UIT.routes.overname(); };
  bijVerzenden('fov', async (f) => {
    const data = { ...d, vme: { naam: f.naam.value.trim(), ondernemingsnummer: ofNull(f.ond.value), adres_straat: ofNull(f.straat.value), postcode: ofNull(f.postcode.value), gemeente: ofNull(f.gemeente.value) } };
    const id = await q(sb.rpc('overname_vme', { p_kantoor: S.kantoor.id, p_data: data, p_boekjaar_start: f.start.value, p_boekjaar_eind: f.eind.value }));
    st.data = null; S.bericht = { soort: 'ok', tekst: `${data.vme.naam} is overgenomen met ${d.kavels.length} kavels. Kijk Beheer na en boek de beginbalans.` };
    location.hash = `#/vme/${id}/beheer`;
  }, UIT.routes.overname);
};
