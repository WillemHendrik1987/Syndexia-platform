// =============================================================================
// Syndexia Platform - documenten per VME.
//
// Het bestand gaat naar de bestandsopslag van Supabase (bucket "documenten",
// niet publiek), onder <kantoor>/<VME>/<willekeurige naam>. De tabel "document"
// onthoudt de map en de echte bestandsnaam. Openen gebeurt met een link die twee
// minuten geldig is; zonder login kan niemand aan de bestanden.
// De mappen volgen de vaste indeling van de Syndexia-dossiers.
// =============================================================================
const DOC_MAPPEN = ['1. ADMIN - ALGEMEEN', '2. AV - RVME', '3. BOEKHOUDING', '4. TECHNISCH BEHEER', '5. OVERDRACHT', 'INFO EIGENAARS & HUURDERS'];
const DOC_MAX = 25 * 1024 * 1024;
const grootte = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} kB` : `${(b / 1048576).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} MB`);
const opslag = () => sb.storage.from('documenten');

UIT.tabs.push(['doc', 'Documenten']);
UIT.fn.doc = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.doc = async () => {
  const v = S.vme, doel = document.getElementById('tabinhoud');
  let lijst;
  try { lijst = await q(sb.from('document').select('id, map, naam, pad, grootte, aangemaakt_op, voor_eigenaars').eq('vme_id', v.id).order('map').order('naam')); }
  catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;
  const mappen = [...new Set([...DOC_MAPPEN, ...lijst.map((d) => d.map)])];

  doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Documenten opladen</h3>
      <form id="fd"><div class="rij">${veld('Map', kies('map', mappen.map((m) => `<option>${esc(m)}</option>`).join('')))}${veld('Bestanden (elk hoogstens 25 MB)', '<input type="file" name="bestanden" multiple required>', '2 1 260px')}</div>
      <p><button>Opladen</button></p></form><div id="docuit"></div>
      <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Een hele map in één keer inladen</summary>
        <p class="klein">Kies de map van dit gebouw op je computer (bv. uit OneDrive). Elke submap wordt een map hier; de mappen 1 tot 5 van je vaste indeling worden herkend. Bestanden die hier al staan (zelfde map en naam) of groter zijn dan 25 MB worden overgeslagen, net als bestanden met wachtwoorden of logins in de naam. Werkt in Chrome en Edge op de computer.</p>
        <input type="file" id="docmap" webkitdirectory multiple><div id="docmapuit"></div></details></div>
    ${mappen.filter((m) => lijst.some((d) => d.map === m)).map((m) => `<div class="kaart"><h3 style="margin-top:0">${esc(m)}</h3>
      ${tabel(['Naam', '#Grootte', 'Opgeladen', 'Portaal', ''], lijst.filter((d) => d.map === m).map((d) => `<tr>${cel(d.naam)}<td class="n">${grootte(d.grootte)}</td>${cel(dat(d.aangemaakt_op))}
        <td><label style="display:inline;white-space:nowrap" title="Zichtbaar voor de eigenaars in het portaal"><input type="checkbox" data-vrij="${d.id}" style="width:auto"${d.voor_eigenaars ? ' checked' : ''}> eigenaars</label></td>
        <td><button class="stil" data-open="${d.id}">Openen</button> <button class="stil" data-wis="${d.id}">Wissen</button></td></tr>`))}</div>`).join('') || '<div class="kaart"><p class="leeg">Nog geen documenten voor deze VME.</p></div>'}`;

  // Hele map inladen. De browser geeft per bestand het pad binnen de gekozen map (webkitRelativePath):
  // het eerste stuk is de gekozen map zelf, het tweede de submap. Die submap bepaalt de map hier.
  const mapVak = document.getElementById('docmap');
  if (mapVak) mapVak.onchange = async () => {
    const uit = document.getElementById('docmapuit'), ruw = [...mapVak.files].filter((b) => !/(^|\/)(~\$|\.|desktop\.ini$|Thumbs\.db$)/i.test(b.webkitRelativePath || b.name)),
      // bestanden met wachtwoorden of logins horen niet in het platform: die slaan we altijd over
      alle = ruw.filter((b) => !/wachtwoord|paswoord|password|passwd|login|account\.txt$/i.test(b.name)), geheim = ruw.length - alle.length;
    const bestaat = new Set(lijst.map((d) => `${d.map}\n${d.naam}`)), fouten = []; let gelukt = 0, over = 0;
    const kiesMap = (b) => { const stukken = (b.webkitRelativePath || b.name).split('/'), sub = stukken.length > 2 ? stukken[1].trim() : 'Algemeen';
      const nr = (sub.match(/^(\d)\./) ?? [])[1]; return DOC_MAPPEN.find((m) => nr && m.startsWith(`${nr}.`)) ?? (DOC_MAPPEN.find((m) => m.toLowerCase() === sub.toLowerCase()) ?? sub.slice(0, 80)); };
    mapVak.disabled = true;
    for (const [nr, bestand] of alle.entries()) {
      const map = kiesMap(bestand);
      uit.innerHTML = `<p class="klein">Bezig: ${nr + 1} van ${alle.length} · ${esc(bestand.name)}</p>`;
      if (bestaat.has(`${map}\n${bestand.name}`) || bestand.size > DOC_MAX || bestand.size === 0) { over++; continue; }
      try {
        const ext = (bestand.name.match(/\.([A-Za-z0-9]{1,8})$/) ?? [])[1], pad = `${S.kantoor.id}/${v.id}/${crypto.randomUUID()}${ext ? '.' + ext.toLowerCase() : ''}`;
        const { error } = await opslag().upload(pad, bestand, { contentType: bestand.type || 'application/octet-stream', upsert: false });
        if (error) throw new Error(error.message);
        try { await q(sb.from('document').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, map, naam: bestand.name, pad, grootte: bestand.size, soort: bestand.type || null })); }
        catch (e) { await opslag().remove([pad]); throw e; }
        bestaat.add(`${map}\n${bestand.name}`); gelukt++;
      } catch (e) { fouten.push(`${bestand.name}: ${e.message}`); if (fouten.length >= 10) break; }
    }
    S.bericht = { soort: fouten.length ? 'fout' : 'ok', tekst: `${gelukt} document(en) ingeladen, ${over} overgeslagen${geheim ? `, ${geheim} bestand(en) met wachtwoorden of logins niet meegenomen` : ''}${fouten.length ? `, ${fouten.length} mislukt${fouten.length >= 10 ? ' (gestopt na 10 fouten)' : ''}. ${fouten.slice(0, 3).join(' · ')}` : '.'}` };
    schermVme();
  };

  bijVerzenden('fd', async (f) => {
    const bestanden = [...f.bestanden.files], uit = document.getElementById('docuit'), fouten = [];
    let gelukt = 0;
    for (const bestand of bestanden) {
      uit.innerHTML = `<p class="klein">Bezig met ${esc(bestand.name)}…</p>`;
      try {
        if (bestand.size > DOC_MAX) throw new Error('groter dan 25 MB');
        // in de opslag krijgt het bestand een willekeurige naam; de echte naam staat in de tabel
        const ext = (bestand.name.match(/\.([A-Za-z0-9]{1,8})$/) ?? [])[1], pad = `${S.kantoor.id}/${v.id}/${crypto.randomUUID()}${ext ? '.' + ext.toLowerCase() : ''}`;
        const { error } = await opslag().upload(pad, bestand, { contentType: bestand.type || 'application/octet-stream', upsert: false });
        if (error) throw new Error(error.message);
        try { await q(sb.from('document').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, map: f.map.value, naam: bestand.name, pad, grootte: bestand.size, soort: bestand.type || null })); }
        catch (e) { await opslag().remove([pad]); throw e; }   // geen bestand achterlaten zonder regel in de tabel
        gelukt++;
      } catch (e) { fouten.push(`${bestand.name}: ${e.message}`); }
    }
    S.bericht = fouten.length ? { soort: 'fout', tekst: `${gelukt} opgeladen, ${fouten.length} mislukt. ${fouten.join(' · ')}` } : { soort: 'ok', tekst: `${gelukt} document(en) opgeladen in ${f.map.value}.` };
    schermVme();
  });

  doel.querySelectorAll('[data-open]').forEach((knop) => {
    knop.onclick = async () => {
      const doc = lijst.find((d) => d.id === knop.dataset.open);
      const venster = window.open('', '_blank');   // meteen openen, anders houdt de browser het venster tegen
      const { data, error } = await opslag().createSignedUrl(doc.pad, 120);
      if (error) { if (venster) venster.close(); fout(error); return schermVme(); }
      if (venster) venster.location = data.signedUrl; else location.href = data.signedUrl;
    };
  });
  // Vinkje "eigenaars": het document verschijnt in het portaal van wie vandaag eigenaar is in deze VME.
  doel.querySelectorAll('[data-vrij]').forEach((vink) => {
    vink.onchange = async () => {
      const doc = lijst.find((d) => d.id === vink.dataset.vrij);
      try { await q(sb.from('document').update({ voor_eigenaars: vink.checked }).eq('id', doc.id)); S.bericht = { soort: 'ok', tekst: `${doc.naam} is ${vink.checked ? 'nu zichtbaar voor de eigenaars' : 'niet meer zichtbaar voor de eigenaars'}.` }; }
      catch (e) { fout(e); }
      schermVme();
    };
  });
  doel.querySelectorAll('[data-wis]').forEach((knop) => {
    knop.onclick = async () => {
      if (!knop.dataset.zeker) { knop.dataset.zeker = '1'; knop.textContent = 'Zeker? Klik opnieuw'; return; }
      const doc = lijst.find((d) => d.id === knop.dataset.wis);
      try {
        const { error } = await opslag().remove([doc.pad]);
        if (error) throw new Error(error.message);
        await q(sb.from('document').delete().eq('id', doc.id));
        S.bericht = { soort: 'ok', tekst: `${doc.naam} gewist.` };
      } catch (e) { fout(e); }
      schermVme();
    };
  });
};
