// Zoek of vraag: één balk voor alles. Typ een naam en je springt naar het gebouw, de eigenaar,
// het dossier, de leverancier, de taak of de pagina. Staat het er niet tussen, dan gaat dezelfde
// tekst met Enter als vraag of opdracht naar Syn. Openen: de knop in de kop, Ctrl+K of "/".
(() => {
  const esc2 = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kaal = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let bron = null, geladenOp = 0, keuze = 0, treffers = [];

  // Alles wat doorzoekbaar is, in één keer opgehaald met de login van de gebruiker en twee minuten bewaard.
  async function laad() {
    if (bron && Date.now() - geladenOp < 120000) return bron;
    const haal = async (v) => { const { data, error } = await v; return error ? [] : (data ?? []); };
    const [vmes, kavels, eigenaars, dossiers, levs, taken] = await Promise.all([
      haal(sb.from('vme').select('id, naam, adres_straat, gemeente').is('gedeactiveerd_op', null).order('naam')),
      haal(sb.from('kavel').select('id, kavelnummer, vme_id')),
      haal(sb.from('v_kavel_eigenaar_vandaag').select('kavel_id, naam, vme_id')),
      haal(sb.from('dossier').select('vme_id, nummer, titel, status').neq('status', 'afgesloten').order('nummer', { ascending: false }).limit(500)),
      haal(sb.from('leverancier').select('naam, categorie').order('naam').limit(1000)),
      haal(sb.from('taak').select('titel, vme_id').is('klaar_op', null).limit(500)),
    ]);
    const vme = Object.fromEntries(vmes.map((v) => [v.id, v.naam])), kavel = Object.fromEntries(kavels.map((k) => [k.id, k.kavelnummer]));
    const rijen = [];
    for (const v of vmes) rijen.push({ soort: 'Gebouw', titel: v.naam, bij: [v.adres_straat, v.gemeente].filter(Boolean).join(', '), hash: `#/vme/${v.id}` });
    const perEigenaar = new Map();
    for (const e of eigenaars) { const sl = `${e.vme_id}|${e.naam}`, r = perEigenaar.get(sl) ?? { naam: e.naam, vme_id: e.vme_id, kavels: [] }; r.kavels.push(kavel[e.kavel_id] ?? ''); perEigenaar.set(sl, r); }
    for (const e of perEigenaar.values()) rijen.push({ soort: 'Eigenaar', titel: e.naam, bij: `${e.kavels.filter(Boolean).join(', ')} · ${vme[e.vme_id] ?? ''}`, hash: `#/vme/${e.vme_id}/contacten` });
    for (const d of dossiers) rijen.push({ soort: 'Dossier', titel: `#${d.nummer} ${d.titel}`, bij: `${d.status} · ${vme[d.vme_id] ?? ''}`, hash: `#/vme/${d.vme_id}/dossiers` });
    for (const l of levs) rijen.push({ soort: 'Leverancier', titel: l.naam, bij: l.categorie ?? '', hash: '#/leveranciers' });
    for (const t of taken) rijen.push({ soort: 'Taak', titel: t.titel, bij: vme[t.vme_id] ?? '', hash: '#/taken' });
    for (const r of rijen) r.zoek = kaal(`${r.titel} ${r.bij}`);
    bron = rijen; geladenOp = Date.now(); return bron;
  }
  // De pagina's en, als er een gebouw open staat, zijn tabbladen: altijd actueel, dus niet bewaard.
  function plekken() {
    const uit = [{ soort: 'Pagina', titel: 'Start', bij: '', hash: '#/' }];
    for (const stuk of UIT.vandaag) for (const m of String(stuk).matchAll(/<a class="knop[^"]*" href="([^"]+)">([^<]+)/g)) uit.push({ soort: 'Pagina', titel: m[2].trim().replace(/^\+\s*/, ''), bij: '', hash: m[1] });
    if (location.hash.startsWith('#/vme/') && typeof S !== 'undefined' && S.vme) for (const [k, n] of TABS) uit.push({ soort: 'Tabblad', titel: n, bij: S.vme.naam, hash: `#/vme/${S.vme.id}/${k}` });
    for (const r of uit) r.zoek = kaal(`${r.titel} ${r.bij}`);
    return uit;
  }
  function zoek(tekst) {
    const woorden = kaal(tekst).split(/\s+/).filter(Boolean); if (!woorden.length) return [];
    const punten = (r) => (woorden.every((w) => r.zoek.includes(w)) ? (kaal(r.titel).startsWith(woorden[0]) ? 3 : kaal(r.titel).includes(woorden[0]) ? 2 : 1) : 0);
    const per = {}; const uit = [];
    for (const r of [...plekken(), ...(bron ?? [])].map((r) => [punten(r), r]).filter(([p]) => p).sort((a, b) => b[0] - a[0]).map(([, r]) => r)) {
      per[r.soort] = (per[r.soort] ?? 0) + 1; if (per[r.soort] > 5 || uit.length >= 14) continue; uit.push(r);
    }
    return uit;
  }
  function teken() {
    const veld = document.getElementById('zoekveld'), lijst = document.getElementById('zoeklijst'), tekst = veld.value.trim();
    treffers = zoek(tekst);
    if (tekst) treffers.push({ soort: 'Syn', titel: tekst, bij: 'Vraag of opdracht voor Syn', syn: true });
    keuze = Math.min(keuze, Math.max(0, treffers.length - 1));
    lijst.innerHTML = treffers.length ? treffers.map((r, n) => `<li role="option" id="zk${n}" aria-selected="${n === keuze}" data-n="${n}" class="${r.syn ? 'zksyn' : ''}"><span class="zksoort">${esc2(r.soort)}</span><span class="zktitel">${esc2(r.titel)}</span><span class="zkbij">${esc2(r.bij)}</span></li>`).join('')
      : `<li class="zkleeg">${bron ? 'Typ een naam van een gebouw, eigenaar, dossier of leverancier, of stel je vraag aan Syn.' : 'Laden…'}</li>`;
    veld.setAttribute('aria-activedescendant', treffers.length ? `zk${keuze}` : '');
    lijst.querySelectorAll('[data-n]').forEach((li) => { li.onclick = () => kies(Number(li.dataset.n)); });
    document.getElementById(`zk${keuze}`)?.scrollIntoView({ block: 'nearest' });
  }
  function kies(n) {
    const r = treffers[n]; if (!r) return;
    open(false);
    if (!r.syn) { location.hash = r.hash; return; }
    // Naar Syn: het paneel openen en de tekst meteen versturen.
    if (typeof synOpen !== 'function') return;
    synOpen(true);
    setTimeout(() => { const f = document.getElementById('synform'); if (!f) return; f.vraag.value = r.titel; f.requestSubmit(); }, 60);
  }
  function open(aan) {
    let blad = document.getElementById('zoek');
    if (!blad) {
      document.body.insertAdjacentHTML('beforeend', `<div id="zoek" hidden><div class="zkvak" role="dialog" aria-modal="true" aria-label="Zoek of vraag">
        <div class="zkrij"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="zoekveld" type="search" placeholder="Zoek een gebouw, eigenaar, dossier… of vraag het aan Syn" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="zoeklijst" aria-label="Zoek of vraag">
          <button type="button" class="stil" id="zoekdicht">Sluiten</button></div>
        <ul id="zoeklijst" role="listbox"></ul></div></div>`);
      blad = document.getElementById('zoek');
      blad.onclick = (ev) => { if (ev.target === blad) open(false); };
      document.getElementById('zoekdicht').onclick = () => open(false);
      const veld = document.getElementById('zoekveld');
      veld.oninput = () => { keuze = 0; teken(); };
      veld.onkeydown = (ev) => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); keuze = Math.min(keuze + 1, treffers.length - 1); teken(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); keuze = Math.max(keuze - 1, 0); teken(); }
        else if (ev.key === 'Enter') { ev.preventDefault(); kies(keuze); }
        else if (ev.key === 'Escape') { ev.preventDefault(); open(false); }
      };
    }
    if (blad.hidden === !aan) return;
    blad.hidden = !aan; document.documentElement.classList.toggle('gsmvast', aan);
    if (!aan) return;
    const veld = document.getElementById('zoekveld'); veld.value = ''; keuze = 0; teken(); veld.focus();
    laad().then(() => { if (!blad.hidden) teken(); });
  }
  const mag = () => { const s = document.getElementById('synknop'); return !!s && !s.hidden; };
  // De knop in de kop volgt Syn: wie Syn mag zien, kan zoeken.
  const synToon = UIT.synToon;
  UIT.synToon = () => {
    if (synToon) synToon();
    let knop = document.getElementById('zoekknop');
    if (!knop) { document.getElementById('wie').insertAdjacentHTML('beforebegin', '<button type="button" id="zoekknop" hidden aria-label="Zoek of vraag (Ctrl+K)"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Zoek of vraag</span><kbd>Ctrl K</kbd></button>'); knop = document.getElementById('zoekknop'); knop.onclick = () => open(true); }
    knop.hidden = !mag(); if (!mag()) open(false);
  };
  document.addEventListener('keydown', (ev) => {
    if (!mag()) return;
    const inVeld = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !inVeld)) { ev.preventDefault(); open(true); }
  });
  window.addEventListener('hashchange', () => { open(false); bron = null; });
})();
