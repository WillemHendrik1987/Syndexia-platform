// Gsm: wat het platform op een smal scherm anders doet. Drie dingen:
//  1. Tabellen krijgen per cel de naam van hun kolom mee, zodat de stijlregels er op een gsm
//     kaartjes van kunnen maken (kolomnaam links, waarde rechts) in plaats van een brede tabel.
//  2. Onderaan staat een balk voor de duim: Start, Taken, Syn, Mail en Menu.
//  3. Menu opent een blad met alle onderdelen: de tabbladen van het gebouw dat open staat,
//     de pagina's van het kantoor en de lijst van de gebouwen.
// Op een breed scherm blijft alles zoals het was: de balk en het blad zijn daar verborgen.
(() => {
  const smal = matchMedia('(max-width:700px)');
  const ico = (pad) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pad}</svg>`;
  const ICO = {
    start: ico('<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    taken: ico('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'),
    mail: ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    menu: ico('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>'),
  };
  const veilig = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- 1. tabellen: elke cel kent haar kolom ------------------------------------------
  // Een tabel met veel kolommen (meer dan MAX) blijft een tabel die zijwaarts schuift.
  const MAX = 9;
  function labelTabellen() {
    for (const t of document.querySelectorAll('#app table')) {
      const koppen = [];
      for (const th of t.querySelectorAll(':scope > thead > tr:first-child > th')) for (let i = 0; i < (th.colSpan || 1); i++) koppen.push(th.textContent.trim());
      t.classList.toggle('gk', koppen.length <= MAX);
      t.classList.toggle('gbreed', koppen.length > MAX);
      for (const tr of t.querySelectorAll(':scope > tbody > tr')) {
        if (tr.dataset.gk === String(tr.cells.length)) continue;   // al gedaan en niets bijgekomen
        let kolom = 0, titel = null;
        for (const td of tr.cells) {
          const k = koppen[kolom] ?? ''; td.dataset.k = k; kolom += td.colSpan || 1;
          td.classList.remove('gt', 'gv');
          if (!titel && (k || tr.cells.length === 1)) { titel = td; td.classList.add('gt'); } else if (!titel) td.classList.add('gv');
          td.classList.toggle('gl', !td.children.length && !td.textContent.trim());
        }
        if (!titel && tr.cells.length) { for (const td of tr.cells) td.classList.remove('gv'); tr.cells[0].classList.add('gt'); }
        tr.dataset.gk = String(tr.cells.length);
      }
    }
    // Het tabblad dat open staat schuift in beeld; de teller van de mailbox komt ook op de balk.
    const tabs = document.querySelector('#app .tabs'), aan = tabs?.querySelector('.aan');
    if (aan && tabs.scrollWidth > tabs.clientWidth && !tabs.dataset.gezet) { tabs.dataset.gezet = '1'; tabs.scrollLeft = aan.offsetLeft - (tabs.clientWidth - aan.offsetWidth) / 2; }
    const teller = document.querySelector('#mbteller .pil'), bol = document.getElementById('gsmmail');
    if (teller && bol) { bol.textContent = (teller.textContent.match(/\d+\+?/) ?? [''])[0]; bol.hidden = !bol.textContent; }
  }
  let gepland = false;
  const plan = () => { if (gepland) return; gepland = true; requestAnimationFrame(() => { gepland = false; labelTabellen(); }); };

  // ---- 2. de onderbalk -----------------------------------------------------------------
  function balk() {
    let b = document.getElementById('gsmbalk');
    if (!b) {
      document.body.insertAdjacentHTML('beforeend', `<nav id="gsmbalk" aria-label="Hoofdnavigatie" hidden>
        <a href="#/" data-g="start">${ICO.start}<span>Start</span></a>
        <a href="#/taken" data-g="taken">${ICO.taken}<span>Taken</span></a>
        <button type="button" id="gsmsyn" aria-label="Open Syn, je assistent">${typeof SYN_FIGUUR === 'string' ? SYN_FIGUUR : 'Syn'}</button>
        <a href="#/mailbox" data-g="mailbox">${ICO.mail}<span>Mail</span><i id="gsmmail" hidden></i></a>
        <button type="button" id="gsmmenu" aria-expanded="false" aria-controls="gsmblad">${ICO.menu}<span>Menu</span></button>
      </nav>
      <div id="gsmachter" hidden></div>
      <section id="gsmblad" role="dialog" aria-modal="true" aria-label="Menu" hidden></section>`);
      b = document.getElementById('gsmbalk');
      document.getElementById('gsmsyn').onclick = () => { blad(false); const p = document.getElementById('synpaneel'); if (p && typeof synOpen === 'function') synOpen(p.hidden); };
      document.getElementById('gsmmenu').onclick = () => blad(document.getElementById('gsmblad').hidden);
      document.getElementById('gsmachter').onclick = () => blad(false);
      document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') blad(false); });
      new MutationObserver(plan).observe(document.getElementById('app'), { childList: true, subtree: true });
    }
    return b;
  }
  function stand() {
    const b = balk(), syn = document.getElementById('synknop'), mag = !!syn && !syn.hidden;
    b.hidden = !mag; document.body.classList.toggle('gsmbalk', mag);
    const deel = location.hash.split('/')[1] ?? '', aan = deel === 'taken' ? 'taken' : deel === 'mailbox' ? 'mailbox' : (!deel || deel === 'vme') ? 'start' : '';
    b.querySelectorAll('[data-g]').forEach((a) => { a.classList.toggle('aan', a.dataset.g === aan); if (a.dataset.g === aan) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!mag) blad(false);
    plan();
  }

  // ---- 3. het menublad -----------------------------------------------------------------
  let gebouwen = null;
  const tegel = (href, naam, aan = false) => `<a class="gsmtegel${aan ? ' aan' : ''}" href="${veilig(href)}">${veilig(naam)}</a>`;
  function bladInhoud() {
    const inVme = location.hash.startsWith('#/vme/') && typeof S !== 'undefined' && S.vme;
    let h = `<div class="gsmgreep" id="gsmgreep"><i></i></div><div class="gsmkop"><h2>Menu</h2><button type="button" class="stil" id="gsmdicht" aria-label="Menu sluiten">Sluiten</button></div><div class="gsmrol">`;
    if (inVme) {
      const kan = { overzicht: 1, kosten: 1, provisies: 1, afrekening: 1, balans: 1, ...UIT.fn }, alle = TABS.filter(([k]) => kan[k]);
      h += `<h3>${veilig(S.vme.naam)}</h3>`;
      for (const [groep, volgorde] of GROEPEN) {
        const hier = alle.filter(([k]) => groepVan(k) === groep).sort((a, b) => (volgorde.indexOf(a[0]) + 99) % 99 - (volgorde.indexOf(b[0]) + 99) % 99);
        if (hier.length) h += `<h4>${veilig(groep)}</h4><div class="gsmtegels">${hier.map(([k, n]) => tegel(`#/vme/${S.vme.id}/${k}`, n, k === S.tab)).join('')}</div>`;
      }
    }
    // De pagina's van het kantoor komen uit dezelfde lijst als de knoppen op het startscherm,
    // zodat een nieuw onderdeel vanzelf ook in dit menu staat.
    const paginas = [['#/', 'Start']];
    for (const stuk of UIT.vandaag) for (const m of String(stuk).matchAll(/<a class="knop[^"]*" href="([^"]+)">([^<]+)/g)) paginas.push([m[1], m[2].trim().replace(/^\+\s*/, '')]);
    h += `<h3>Kantoor</h3><div class="gsmtegels">${paginas.map(([u, n]) => tegel(u, n, location.hash === u || (u === '#/' && !location.hash))).join('')}</div>`;
    h += `<h3>Gebouwen</h3><div id="gsmgebouwen">${gebouwenLijst()}</div>`;
    const mail = (typeof S !== 'undefined' && S.sessie?.user?.email) || '';
    h += `<div class="gsmvoet"><span class="klein">${veilig(mail)}</span><button type="button" class="stil" id="gsmuit">Afmelden</button></div></div>`;
    return h;
  }
  function gebouwenLijst(zoek = '') {
    if (!gebouwen) return '<p class="klein">Laden…</p>';
    const z = zoek.trim().toLowerCase(), lijst = gebouwen.filter((g) => !z || g.naam.toLowerCase().includes(z));
    const open = typeof S !== 'undefined' && location.hash.startsWith('#/vme/') ? S.vme?.id : null;
    return (gebouwen.length > 6 ? `<input type="search" id="gsmzoek" placeholder="Zoek een gebouw" value="${veilig(zoek)}" aria-label="Zoek een gebouw">` : '')
      + (lijst.map((g) => `<a class="gsmgebouw${g.id === open ? ' aan' : ''}" href="#/vme/${g.id}">${veilig(g.naam)}<span class="klein">${veilig([g.adres_straat, g.gemeente].filter(Boolean).join(', '))}</span></a>`).join('') || '<p class="klein">Geen gebouw gevonden.</p>');
  }
  function bindGebouwen() {
    const zoek = document.getElementById('gsmzoek'); if (!zoek) return;
    zoek.oninput = () => { const plek = zoek.selectionStart; document.getElementById('gsmgebouwen').innerHTML = gebouwenLijst(zoek.value); bindGebouwen(); const n = document.getElementById('gsmzoek'); n.focus(); n.setSelectionRange(plek, plek); };
  }
  function blad(open) {
    const b = document.getElementById('gsmblad'); if (!b || b.hidden === !open) return;
    const achter = document.getElementById('gsmachter'), knop = document.getElementById('gsmmenu');
    b.hidden = achter.hidden = !open; knop.setAttribute('aria-expanded', String(open)); knop.classList.toggle('aan', open);
    document.documentElement.classList.toggle('gsmvast', open);   // de pagina erachter schuift niet mee
    if (!open) { b.style.transform = ''; return; }
    const syn = document.getElementById('synpaneel'); if (syn && !syn.hidden && typeof synOpen === 'function') synOpen(false);
    b.innerHTML = bladInhoud(); bindGebouwen();
    document.getElementById('gsmdicht').onclick = () => blad(false);
    document.getElementById('gsmuit').onclick = () => { blad(false); sb.auth.signOut(); };
    b.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => blad(false)));
    // Het blad naar beneden vegen sluit het.
    const greep = document.getElementById('gsmgreep'); let y0 = null;
    greep.ontouchstart = (ev) => { y0 = ev.touches[0].clientY; };
    greep.ontouchmove = (ev) => { if (y0 === null) return; const d = Math.max(0, ev.touches[0].clientY - y0); b.style.transform = `translateY(${d}px)`; };
    greep.ontouchend = (ev) => { const d = (ev.changedTouches[0]?.clientY ?? 0) - (y0 ?? 0); y0 = null; if (d > 70) blad(false); else b.style.transform = ''; };
    if (!gebouwen) sb.from('vme').select('id, naam, adres_straat, gemeente').is('gedeactiveerd_op', null).order('naam').then(({ data }) => {
      gebouwen = data ?? []; const vak = document.getElementById('gsmgebouwen'); if (vak) { vak.innerHTML = gebouwenLijst(); bindGebouwen(); }
    });
  }

  // De balk volgt Syn: wie Syn mag zien (lid van een kantoor, geen openbare pagina), krijgt de balk.
  const synToon = UIT.synToon;
  UIT.synToon = () => { if (synToon) synToon(); stand(); };
  let vorige = location.hash.split('/').slice(0, 4).join('/');
  window.addEventListener('hashchange', () => {
    blad(false); gebouwen = null; setTimeout(stand, 0);
    const nu = location.hash.split('/').slice(0, 4).join('/');
    if (nu !== vorige && smal.matches) scrollTo(0, 0);   // een andere pagina begint bovenaan
    vorige = nu;
  });
  smal.addEventListener('change', () => { if (!smal.matches) blad(false); });
})();
