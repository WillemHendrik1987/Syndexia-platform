// =============================================================================
// Syndexia Platform - koppeling tussen een map op je computer en de documenten van een VME.
//
// In het tabblad Documenten koppel je één keer de map van het gebouw (bv. de map in OneDrive).
// Daarna vergelijkt "Vergelijken" de map met het platform en zet "Synchroniseren" gelijk wat
// ontbreekt, in twee richtingen:
//   - wat nieuw is in de map            -> komt bij Documenten
//   - wat nieuw is in het platform      -> wordt in de map geschreven (als je dat aanvinkt)
// Er wordt nooit iets gewist of overschreven, aan geen van beide kanten. Een bestand dat aan
// beide kanten bestaat maar verschilt, wordt alleen gemeld.
//
// Dit gebruikt de File System Access API van de browser: Chrome en Edge op een computer. De
// browser onthoudt de map (in IndexedDB, alleen op dit toestel) maar vraagt na een herstart
// opnieuw je toestemming; er loopt niets op de achtergrond. Bestanden met wachtwoorden of
// logins in de naam worden nooit meegenomen.
// =============================================================================
const MK_GEHEIM = /wachtwoord|paswoord|password|passwd|login|account\.txt$/i, MK_ROMMEL = /^(~\$|\.)|^(desktop\.ini|thumbs\.db)$/i;
const mkKan = () => typeof window.showDirectoryPicker === 'function';
const mkVeilig = (naam) => String(naam).replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '').slice(0, 150) || 'zonder naam';

// Waar de browser de gekoppelde map onthoudt: IndexedDB, per VME. (In de tests vervangen door een geheugenversie.)
const mkDb = () => new Promise((ok, nok) => { const r = indexedDB.open('syndexia-mappen', 1); r.onupgradeneeded = () => r.result.createObjectStore('map'); r.onsuccess = () => ok(r.result); r.onerror = () => nok(r.error); });
const mkTx = async (soort, werk) => { const db = await mkDb(); return new Promise((ok, nok) => { const tx = db.transaction('map', soort), r = werk(tx.objectStore('map')); tx.oncomplete = () => { db.close(); ok(r?.result); }; tx.onerror = () => { db.close(); nok(tx.error); }; }); };
UIT.mapWinkel = { haal: (id) => mkTx('readonly', (s) => s.get(id)), zet: (id, w) => mkTx('readwrite', (s) => s.put(w, id)), weg: (id) => mkTx('readwrite', (s) => s.delete(id)) };

// Loopt de gekoppelde map af. De eerste submap bepaalt de map bij Documenten (zoals bij "hele map inladen").
async function mkLees(wortel) {
  const uit = []; let geheim = 0;
  const kiesMap = (sub) => { const nr = (sub.match(/^(\d)\./) ?? [])[1]; return DOC_MAPPEN.find((m) => nr && m.startsWith(`${nr}.`)) ?? (DOC_MAPPEN.find((m) => m.toLowerCase() === sub.toLowerCase()) ?? sub.slice(0, 80)); };
  const loop = async (dir, stukken) => {
    if (stukken.length > 8 || uit.length >= 5000) return;
    for await (const [naam, h] of dir.entries()) {
      if (MK_ROMMEL.test(naam)) continue;
      if (h.kind === 'directory') await loop(h, [...stukken, naam]);
      else if (MK_GEHEIM.test(naam)) geheim++;
      else { const file = await h.getFile(); if (file.size > 0) uit.push({ map: stukken.length ? kiesMap(stukken[0].trim()) : 'Algemeen', naam, file, pad: [...stukken, naam].join('/') }); }
    }
  };
  await loop(wortel, []);
  return { bestanden: uit, geheim };
}
// Legt de map naast de documenten van het platform.
function mkVergelijk(lokaal, platform) {
  const sl = (m, n) => `${m}\n${n}`.toLowerCase(), opPlatform = new Map(platform.map((d) => [sl(d.map, d.naam), d])), inMap = new Map();
  for (const b of lokaal) if (!inMap.has(sl(b.map, b.naam))) inMap.set(sl(b.map, b.naam), b);   // twee bestanden met dezelfde naam in diepere submappen: het eerste telt
  const omhoog = [], teGroot = [], anders = [];
  for (const [k, b] of inMap) { const d = opPlatform.get(k); if (!d) (b.file.size > DOC_MAX ? teGroot : omhoog).push(b); else if (d.grootte != null && Number(d.grootte) !== b.file.size) anders.push(b); }
  return { omhoog, teGroot, anders, omlaag: platform.filter((d) => !inMap.has(sl(d.map, d.naam))), dubbel: lokaal.length - inMap.size };
}

const mkVorigeDoc = UIT.bind.doc;
UIT.bind.doc = async () => {
  await mkVorigeDoc();
  const v = S.vme, doel = document.getElementById('tabinhoud'); if (!doel || !document.body.contains(doel) || doel.querySelector('.melding.fout')) return;
  doel.insertAdjacentHTML('afterbegin', '<div class="kaart" id="mkkaart"></div>');
  const kaart = document.getElementById('mkkaart');
  if (!mkKan()) { kaart.innerHTML = '<h3 style="margin-top:0">Koppeling met een map op je computer</h3><p class="klein" style="margin-bottom:0">Deze browser kan geen map koppelen. Gebruik Chrome of Edge op een computer. Hieronder kan je wel bestanden of een hele map in één keer inladen.</p>'; return; }
  let k = null; try { k = await UIT.mapWinkel.haal(v.id); } catch (e) { /* geen opslag in deze browser: dan zonder onthouden */ }
  const teken = (extra = '') => {
    kaart.innerHTML = `<h3 style="margin-top:0">Koppeling met een map op je computer ${k ? '<span class="pil ok">gekoppeld</span>' : ''}</h3>
      ${k ? `<p>Map: <b>${esc(k.naam)}</b> <span class="klein">${k.laatste ? `· laatst gelijkgezet op ${new Date(k.laatste).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}` : '· nog niet gelijkgezet'}</span></p>
          <label class="ovvink"><input type="checkbox" id="mkomlaag"${k.omlaag === false ? '' : ' checked'}> Ook wat alleen in het platform staat in de map schrijven</label>
          <p class="mkknoppen"><button type="button" id="mkkijk">Vergelijken</button> <button type="button" class="stil" id="mklos">Koppeling verbreken</button></p>`
        : `<p class="klein">Koppel de map van dit gebouw (bv. in OneDrive). Daarna zet je met één klik gelijk wat in de map en in het platform ontbreekt. Er wordt nooit iets gewist of overschreven. De koppeling geldt voor deze browser op dit toestel.</p>
          <p><button type="button" id="mkkies">Map koppelen</button></p>`}
      <div id="mkuit">${extra}</div>`;
    const kies = document.getElementById('mkkies'), los = document.getElementById('mklos'), kijk = document.getElementById('mkkijk'), uit = document.getElementById('mkuit');
    const mis = (e) => { uit.innerHTML = `<div class="melding fout">${esc(e.message ?? String(e))}</div>`; };
    if (kies) kies.onclick = async () => {
      let h; try { h = await window.showDirectoryPicker({ id: 'syndexia-vme', mode: 'read' }); } catch (e) { return; }   // geannuleerd
      k = { handle: h, naam: h.name, sinds: new Date().toISOString(), laatste: null, omlaag: true };
      try { await UIT.mapWinkel.zet(v.id, k); } catch (e) { /* dan geldt de koppeling alleen tot je de pagina sluit */ }
      teken('<div class="melding ok">De map is gekoppeld. Klik op Vergelijken om te zien wat verschilt.</div>');
    };
    if (los) los.onclick = async () => { try { await UIT.mapWinkel.weg(v.id); } catch (e) { /* niets te wissen */ } k = null; teken('<div class="melding">De koppeling is verbroken. In de map en in het platform is niets gewijzigd.</div>'); };
    if (kijk) kijk.onclick = async () => {
      const schrijf = document.getElementById('mkomlaag').checked, modus = schrijf ? 'readwrite' : 'read';
      kijk.disabled = true; uit.innerHTML = '<p class="klein">De map wordt gelezen…</p>';
      try {
        // de browser vraagt hier (opnieuw) toestemming; dat moet binnen een klik gebeuren
        if (await k.handle.queryPermission({ mode: modus }) !== 'granted' && await k.handle.requestPermission({ mode: modus }) !== 'granted') throw new Error('Je gaf geen toestemming voor de map.');
        const [{ bestanden, geheim }, platform] = await Promise.all([mkLees(k.handle), q(sb.from('document').select('id, map, naam, pad, grootte').eq('vme_id', v.id))]);
        const r = mkVergelijk(bestanden, platform), omlaag = schrijf ? r.omlaag : [];
        const lijstje = (titel, l, f) => (l.length ? `<details><summary>${titel}: <b>${l.length}</b></summary><p class="klein" style="overflow-wrap:anywhere">${l.slice(0, 200).map((x) => esc(f(x))).join(' · ')}${l.length > 200 ? ' …' : ''}</p></details>` : '');
        uit.innerHTML = `<p>${bestanden.length} bestand(en) in de map, ${platform.length} document(en) in het platform.${geheim ? ` ${geheim} bestand(en) met wachtwoorden of logins overgeslagen.` : ''}</p>
          ${lijstje('Nieuw in de map, komt bij Documenten', r.omhoog, (b) => `${b.map}/${b.naam}`)}${lijstje(schrijf ? 'Alleen in het platform, wordt in de map geschreven' : 'Alleen in het platform (wordt niet in de map geschreven)', r.omlaag, (d) => `${d.map}/${d.naam}`)}
          ${lijstje('Bestaat aan beide kanten maar verschilt (blijft ongemoeid)', r.anders, (b) => `${b.map}/${b.naam}`)}${lijstje('Groter dan 25 MB (blijft alleen in de map)', r.teGroot, (b) => `${b.map}/${b.naam}`)}
          ${r.omhoog.length + omlaag.length ? `<p><button type="button" id="mkdoe">Synchroniseren: ${r.omhoog.length} naar het platform${schrijf ? `, ${omlaag.length} naar de map` : ''}</button></p>` : `<div class="melding ok">${r.anders.length ? 'Er is niets nieuws om gelijk te zetten.' : 'De map en het platform zijn gelijk.'}</div>`}<div id="mkstand"></div>`;
        k.omlaag = schrijf; try { await UIT.mapWinkel.zet(v.id, k); } catch (e) { /* onthouden lukt niet */ }
        const doe = document.getElementById('mkdoe');
        if (doe) doe.onclick = async () => {
          doe.disabled = true; const stand = document.getElementById('mkstand'), fouten = []; let op = 0, neer = 0, nr = 0; const totaal = r.omhoog.length + omlaag.length;
          const toon1 = (t) => { stand.innerHTML = `<p class="klein">${esc(t)}</p><progress max="${totaal}" value="${nr}" style="width:100%"></progress>`; };
          for (const b of r.omhoog) { toon1(`Naar het platform: ${b.naam}`); nr++;
            try { const ext = (b.naam.match(/\.([A-Za-z0-9]{1,8})$/) ?? [])[1], pad = `${S.kantoor.id}/${v.id}/${crypto.randomUUID()}${ext ? '.' + ext.toLowerCase() : ''}`;
              const { error } = await opslag().upload(pad, b.file, { contentType: b.file.type || 'application/octet-stream', upsert: false }); if (error) throw new Error(error.message);
              try { await q(sb.from('document').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, map: b.map, naam: b.naam, pad, grootte: b.file.size, soort: b.file.type || null })); } catch (e) { await opslag().remove([pad]); throw e; }
              op++; } catch (e) { fouten.push(`${b.naam}: ${e.message}`); if (fouten.length >= 10) break; } }
          if (fouten.length < 10) for (const d of omlaag) { toon1(`Naar de map: ${d.naam}`); nr++;
            try { const { data, error } = await opslag().download(d.pad); if (error) throw new Error(error.message);
              const map = await k.handle.getDirectoryHandle(mkVeilig(d.map), { create: true }), naam = mkVeilig(d.naam);
              // nooit overschrijven: bestaat het bestand toch al, dan blijft het staan
              let bestaat = true; try { await map.getFileHandle(naam); } catch (e) { bestaat = false; }
              if (bestaat) throw new Error('bestaat al in de map');
              const w = await (await map.getFileHandle(naam, { create: true })).createWritable(); await w.write(data); await w.close(); neer++;
            } catch (e) { fouten.push(`${d.naam}: ${e.message}`); if (fouten.length >= 10) break; } }
          k.laatste = new Date().toISOString(); try { await UIT.mapWinkel.zet(v.id, k); } catch (e) { /* onthouden lukt niet */ }
          S.bericht = { soort: fouten.length ? 'fout' : 'ok', tekst: `Gelijkgezet met de map ${k.naam}: ${op} naar het platform, ${neer} naar de map${fouten.length ? `, ${fouten.length} mislukt${fouten.length >= 10 ? ' (gestopt na 10 fouten)' : ''}. ${fouten.slice(0, 3).join(' · ')}` : '.'}` };
          schermVme();
        };
      } catch (e) { mis(e); }
      kijk.disabled = false;
    };
  };
  teken();
};
