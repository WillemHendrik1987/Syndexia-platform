// =============================================================================
// Syndexia Platform - sleutelafhaal.
//
//   tabblad Sleutels      de syndicus duidt aan welke aannemer welke sleutel komt afhalen.
//                         Het platform maakt daar een afhaalbewijs van.
//   #/sleutel/<code>      de pagina waarop de afhaler dat bewijs leest en tekent, met vinger,
//                         pen of muis. Ze werkt op het toestel van het kantoor ("hier tekenen")
//                         en evengoed op de gsm van de afhaler zelf (via de link).
//   startscherm           hoeveel sleutels er buiten zijn, en welke te laat terug zijn.
//
// Een getekend bewijs kan niet meer gewijzigd of gewist worden (dat bewaakt de databank). De
// sleutel staat "buiten" tot de syndicus hem terug inboekt.
// =============================================================================
const sleutelLink = (token) => `${location.origin}${location.pathname}#/sleutel/${token}`;
const sleutelVandaag = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// De tekst van het afhaalbewijs. De syndicus kan ze nog aanpassen voor ze klaargezet wordt.
function sleutelTekst(v, kantoor, g) {
  const adres = [v.adres_straat, [v.postcode, v.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [`AFHAALBEWIJS SLEUTEL`, ``,
    `Gebouw: ${v.naam}${adres ? `, ${adres}` : ''}`,
    `Syndicus: ${kantoor}`,
    `Afhaler: ${g.afhaler || '…'}`,
    `Sleutel: ${g.sleutel || '…'}${g.aantal > 1 ? ` (${g.aantal} stuks)` : ''}`,
    ...(g.reden ? [`Reden: ${g.reden}`] : []),
    ...(g.terug ? [`Terug te bezorgen tegen: ${dat(g.terug)}`] : []),
    ``,
    `De afhaler verklaart de hierboven vermelde sleutel(s) vandaag ontvangen te hebben van de syndicus. Hij gebruikt ze enkel voor de vermelde opdracht, laat ze niet namaken en geeft ze niet door aan derden. Na de opdracht bezorgt hij ze terug aan de syndicus. Verlies of diefstal meldt hij onmiddellijk aan de syndicus.`].join('\n');
}

// Een tekenvlak: werkt met vinger, pen en muis. Geeft terug hoeveel er getekend is en het beeld.
function sleutelVlak(vlak, wisknop) {
  const pen = vlak.getContext('2d'); let bezig = false, lengte = 0, vorige = null;
  pen.lineWidth = 2.5; pen.lineCap = 'round'; pen.lineJoin = 'round'; pen.strokeStyle = '#1a1a1a';
  const plek = (ev) => { const r = vlak.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (vlak.width / r.width), y: (ev.clientY - r.top) * (vlak.height / r.height) }; };
  vlak.onpointerdown = (ev) => { bezig = true; vorige = plek(ev); try { vlak.setPointerCapture(ev.pointerId); } catch (e) { /* niet elk toestel kan dit */ } ev.preventDefault(); };
  vlak.onpointermove = (ev) => { if (!bezig) return; const p = plek(ev); pen.beginPath(); pen.moveTo(vorige.x, vorige.y); pen.lineTo(p.x, p.y); pen.stroke(); lengte += Math.hypot(p.x - vorige.x, p.y - vorige.y); vorige = p; };
  vlak.onpointerup = vlak.onpointercancel = () => { bezig = false; };
  wisknop.onclick = () => { pen.clearRect(0, 0, vlak.width, vlak.height); lengte = 0; };
  return { lengte: () => lengte, beeld: () => vlak.toDataURL('image/png') };
}

UIT.tabs.push(['sleutels', 'Sleutels']);
UIT.fn.sleutels = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.sleutels = async () => {
  const v = S.vme, doel = document.getElementById('tabinhoud');
  let rijen, levs, dossiers;
  try {
    [rijen, levs, dossiers] = await Promise.all([
      q(sb.from('sleutelafhaal').select('id, leverancier_id, dossier_id, afhaler, sleutel, aantal, reden, terug_tegen, tekst, token, getekend_op, getekend_naam, beeld, vingerafdruk, terug_op, terug_notitie, aangemaakt_op').eq('vme_id', v.id).order('aangemaakt_op', { ascending: false })),
      q(sb.from('leverancier').select('id, naam, categorie, email, telefoon').order('naam')),
      q(sb.from('dossier').select('id, nummer, titel, status').eq('vme_id', v.id).neq('status', 'afgesloten').order('nummer', { ascending: false })),
    ]);
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;
  const opnieuw = () => schermVme(), vandaag = sleutelVandaag();
  const stand = (r) => (r.terug_op ? ['terug', ''] : r.getekend_op ? (r.terug_tegen && r.terug_tegen < vandaag ? ['te laat terug', 'fout'] : ['buiten', 'warn']) : ['wacht op handtekening', '']);
  const buiten = rijen.filter((r) => r.getekend_op && !r.terug_op);

  doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Sleutel meegeven</h3>
      <p class="klein">Duid aan wie de sleutel komt afhalen. Het platform maakt een afhaalbewijs dat de afhaler op het scherm tekent, hier op dit toestel of op zijn eigen gsm.</p>
      <form id="fsl"><div class="rij">${veld('Aannemer', kies('lev', `<option value="">kies een leverancier</option>${levs.map((l) => `<option value="${l.id}">${esc(l.naam)}${l.categorie ? ` (${esc(l.categorie)})` : ''}</option>`).join('')}<option value="anders">iemand anders…</option>`, 'required'), '2 1 240px')}
          <div id="slander" style="flex:2 1 240px" hidden><label>Naam van de afhaler</label>${inp('afhaler', 'maxlength="160" placeholder="firma of persoon"')}</div></div>
        <div class="rij">${veld('Welke sleutel', inp('sleutel', 'required maxlength="200" placeholder="bv. technische ruimte en dak"'), '3 1 260px')}${veld('Aantal', inp('aantal', 'type="number" min="1" max="99" value="1" inputmode="numeric" required'), '0 1 90px')}${veld('Terug tegen', inp('terug', `type="date" min="${vandaag}"`))}</div>
        <div class="rij">${veld('Reden', inp('reden', 'maxlength="300" placeholder="bv. onderhoud verwarmingsketel"'), '3 1 260px')}${dossiers.length ? veld('Hoort bij dossier', kies('dossier', `<option value="">geen dossier</option>${dossiers.map((x) => `<option value="${x.id}">#${x.nummer} ${esc(x.titel)}</option>`).join('')}`), '2 1 220px') : ''}</div>
        <label style="margin-top:10px">Tekst van het afhaalbewijs</label><textarea name="tekst" rows="11" required maxlength="6000"></textarea>
        <p class="klein">De tekst volgt wat u hierboven invult. Past u ze zelf aan, dan blijft uw versie staan.</p>
        <p><button>Afhaalbewijs maken</button></p></form></div>
    ${buiten.length ? `<div class="melding${buiten.some((r) => stand(r)[1] === 'fout') ? ' fout' : ''}">${buiten.length === 1 ? 'Er is 1 sleutel buiten' : `Er zijn ${buiten.length} sleutels buiten`} voor dit gebouw.</div>` : ''}
    ${rijen.map((r) => { const [tekstStand, kleur] = stand(r), l = levs.find((x) => x.id === r.leverancier_id), link = sleutelLink(r.token), gsm = l ? tekenGsm(l.telefoon) : null, ds = dossiers.find((x) => x.id === r.dossier_id),
        bericht = `Beste, u kan het afhaalbewijs voor de sleutel van ${v.naam} hier tekenen: ${link}`;
      return `<div class="kaart"><details class="sl" data-id="${r.id}"${S.sleutelOpen === r.id ? ' open' : ''}><summary><b>${esc(r.afhaler)}</b> <span class="klein">${esc(r.sleutel)}${r.aantal > 1 ? ` (${r.aantal})` : ''}</span> <span class="pil ${kleur}">${tekstStand}</span> <span class="klein">${dat(r.aangemaakt_op)}</span></summary>
        <p class="sltekst">${esc(r.tekst)}</p>
        ${ds ? `<p class="klein">Hoort bij dossier <a href="#/vme/${v.id}/dossiers">#${ds.nummer} ${esc(ds.titel)}</a></p>` : ''}
        ${r.getekend_op ? `<p><img src="${esc(r.beeld)}" alt="Handtekening van ${esc(r.getekend_naam)}" class="slbeeld"><br><span class="klein">Getekend door <b>${esc(r.getekend_naam)}</b> op ${tekenMoment(r.getekend_op)}${r.terug_tegen ? ` · terug tegen ${dat(r.terug_tegen)}` : ''}</span></p>
            ${r.terug_op ? `<p><span class="pil ok">terug op ${tekenMoment(r.terug_op)}</span>${r.terug_notitie ? ` <span class="klein">${esc(r.terug_notitie)}</span>` : ''}</p>`
              : `<form class="rij slterug" data-id="${r.id}">${veld('Opmerking bij teruggave', inp('notitie', 'maxlength="300" placeholder="bv. alle sleutels terug, in orde"'), '3 1 240px')}<div style="flex:0 0 auto"><button>Sleutel is terug</button></div></form>`}
            <p><button type="button" class="stil" data-sldruk="${r.id}">Afdrukken</button></p>
            <p class="klein slvinger">Vingerafdruk van de getekende tekst (sha256): ${esc(r.vingerafdruk ?? '')}</p>`
          : `<p class="slknoppen"><a class="knop" href="#/sleutel/${r.token}" data-slhier>Nu tekenen op dit scherm</a> <button type="button" class="stil" data-kopie="${esc(link)}">Link kopiëren</button> ${l?.email ? `<a class="knop licht" href="mailto:${esc(l.email)}?subject=${encodeURIComponent(`Afhaalbewijs sleutel ${v.naam}`)}&body=${encodeURIComponent(bericht)}">Mail</a> ` : ''}${gsm ? `<a class="knop licht" target="_blank" rel="noopener" href="https://wa.me/${gsm}?text=${encodeURIComponent(bericht)}">WhatsApp</a> ` : ''}<button type="button" class="stil" data-slwis="${r.id}">Wissen</button></p>`}
        </details></div>`; }).join('') || '<p class="leeg">Er is nog geen sleutel meegegeven voor dit gebouw.</p>'}`;

  doel.querySelectorAll('details.sl').forEach((el) => { el.ontoggle = () => { if (el.open) S.sleutelOpen = el.dataset.id; else if (S.sleutelOpen === el.dataset.id) S.sleutelOpen = null; }; });
  const f = document.getElementById('fsl'); let zelf = false;
  const naamAfhaler = () => (f.lev.value === 'anders' ? f.afhaler.value.trim() : levs.find((l) => l.id === f.lev.value)?.naam ?? '');
  const vul = () => { if (!zelf) f.tekst.value = sleutelTekst(v, S.kantoor.naam, { afhaler: naamAfhaler(), sleutel: f.sleutel.value.trim(), aantal: Number(f.aantal.value) || 1, reden: f.reden.value.trim(), terug: f.terug.value }); };
  f.lev.onchange = () => { const anders = f.lev.value === 'anders'; document.getElementById('slander').hidden = !anders; f.afhaler.required = anders; vul(); };
  for (const n of ['afhaler', 'sleutel', 'aantal', 'reden', 'terug']) f[n].oninput = vul;
  f.tekst.oninput = () => { zelf = true; };
  vul();
  f.onsubmit = async (ev) => { ev.preventDefault(); const knop = f.querySelector('button:not([type])'); knop.disabled = true;
    try {
      const afhaler = naamAfhaler(); if (!afhaler) throw new Error('Kies een aannemer of vul een naam in.');
      const [nieuw] = await q(sb.from('sleutelafhaal').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, leverancier_id: f.lev.value === 'anders' ? null : f.lev.value, dossier_id: f.dossier?.value || null, afhaler, sleutel: f.sleutel.value.trim(), aantal: Number(f.aantal.value) || 1, reden: f.reden.value.trim() || null, terug_tegen: f.terug.value || null, tekst: f.tekst.value.trim() }).select('id'));
      S.sleutelOpen = nieuw.id; S.bericht = { soort: 'ok', tekst: 'Het afhaalbewijs staat klaar. Laat de afhaler nu tekenen.' };
    } catch (e) { fout(e); } opnieuw(); };
  doel.querySelectorAll('[data-slhier]').forEach((a) => { a.onclick = () => { S.sleutelTerug = `#/vme/${v.id}/sleutels`; }; });
  doel.querySelectorAll('[data-kopie]').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.kopie); b.textContent = 'Gekopieerd'; } catch (e) { b.insertAdjacentHTML('afterend', `<input readonly value="${esc(b.dataset.kopie)}" style="margin-top:6px" onfocus="this.select()">`); b.remove(); } }; });
  doel.querySelectorAll('[data-slwis]').forEach((b) => { b.onclick = async () => { try { await q(sb.from('sleutelafhaal').delete().eq('id', b.dataset.slwis)); S.bericht = { soort: 'ok', tekst: 'Gewist.' }; } catch (e) { fout(e); } opnieuw(); }; });
  doel.querySelectorAll('form.slterug').forEach((ft) => { ft.onsubmit = async (ev) => { ev.preventDefault(); ft.querySelector('button').disabled = true;
    try { await q(sb.from('sleutelafhaal').update({ terug_op: new Date().toISOString(), terug_notitie: ft.notitie.value.trim() || null }).eq('id', ft.dataset.id)); S.bericht = { soort: 'ok', tekst: 'De sleutel is terug ingeboekt.' }; } catch (e) { fout(e); } opnieuw(); }; });
  doel.querySelectorAll('[data-sldruk]').forEach((b) => { b.onclick = () => { const r = rijen.find((x) => x.id === b.dataset.sldruk), w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Afhaalbewijs sleutel - ${esc(v.naam)}</title><style>body{font:14px/1.5 Georgia,serif;max-width:720px;margin:30px auto;padding:0 20px}pre{white-space:pre-wrap;font:inherit}img{height:80px;max-width:100%}small{color:#555}</style>
      <pre>${esc(r.tekst)}</pre><p><img src="${esc(r.beeld)}" alt=""><br>${esc(r.getekend_naam)}<br><small>getekend op ${tekenMoment(r.getekend_op)}</small></p>
      ${r.terug_op ? `<p>Sleutel terug op ${tekenMoment(r.terug_op)}${r.terug_notitie ? `: ${esc(r.terug_notitie)}` : ''}</p>` : ''}
      <p><small>Elektronisch ondertekend via het Syndexia Platform. Vingerafdruk van de tekst (sha256): ${esc(r.vingerafdruk ?? '')}</small></p>`);
    w.document.close(); w.focus(); w.print(); }; });
};

// ---- de pagina waarop de afhaler tekent ----------------------------------------------------
const sleutelVorigeOpenbaar = UIT.openbaar;
UIT.openbaar = () => {
  const [, deel, code] = location.hash.split('/'), wie = document.getElementById('wie');
  if (deel === 'sleutel' && code) { if (wie) wie.style.display = 'none'; schermSleutel(code); return true; }   // de afhaler ziet de knoppen van de syndicus niet
  if (wie) wie.style.display = '';
  return sleutelVorigeOpenbaar ? sleutelVorigeOpenbaar() : false;
};
async function schermSleutel(code) {
  const kaart = (html) => toon(`<div class="kaart" style="max-width:640px;margin:8px auto">${html}</div>`);
  const terug = () => (S.sessie && S.sleutelTerug ? `<p><a class="knop licht" href="${esc(S.sleutelTerug)}">Terug naar het platform</a></p>` : '');
  toon('<p class="leeg">Laden…</p>');
  let info;
  try { if (!/^[0-9a-f-]{36}$/i.test(code)) throw new Error('x'); info = await q(sb.rpc('sleutel_info', { p_token: code })); } catch (e) { info = null; }
  if (!info) { kaart(`<h2>Afhaalbewijs sleutel</h2><p>Deze link is niet geldig. Vraag de syndicus om een nieuwe link.</p>${terug()}`); return; }
  const kop = `<p class="klein" style="margin:0">${esc(info.vme)}</p><h2 style="margin-top:4px">Afhaalbewijs sleutel</h2>`, tekst = `<p class="sltekst">${esc(info.tekst)}</p>`;
  if (info.getekend_op) { kaart(`${kop}${tekst}<div class="melding ok">Getekend door ${esc(info.getekend_naam)} op ${tekenMoment(info.getekend_op)}. Dank u. ${S.sessie && S.sleutelTerug ? 'U mag het toestel teruggeven.' : 'U mag deze pagina sluiten.'}</div>${terug()}`); return; }
  kaart(`${kop}${tekst}
    <form id="fsk"><label>Uw naam</label><input name="naam" required minlength="2" maxlength="120" autocomplete="name" placeholder="voornaam en naam">
      <label style="margin-top:10px">Uw handtekening (teken met uw vinger, een pen of de muis)</label>
      <canvas id="sleutelvlak" class="tekenvlak" width="600" height="220" aria-label="Vlak om uw handtekening te zetten"></canvas>
      <p><button type="button" class="stil" id="sleutelleeg">Opnieuw</button></p>
      <p><label style="display:inline;font-weight:400"><input type="checkbox" name="akkoord" required> Ik heb de sleutel(s) ontvangen en ga akkoord met de tekst hierboven.</label></p>
      <div id="sleutelfout"></div><p><button>Tekenen voor ontvangst</button></p></form>${terug()}`);
  const f = document.getElementById('fsk'), vlak = sleutelVlak(document.getElementById('sleutelvlak'), document.getElementById('sleutelleeg'));
  f.onsubmit = async (ev) => { ev.preventDefault(); const uit = document.getElementById('sleutelfout');
    if (vlak.lengte() < 60) { uit.innerHTML = '<div class="melding fout">Zet eerst uw handtekening in het vak.</div>'; return; }
    f.querySelector('button:not([type])').disabled = true;
    try { await q(sb.rpc('sleutel_teken', { p_token: code, p_naam: f.naam.value, p_beeld: vlak.beeld() })); schermSleutel(code); }
    catch (e) { uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; f.querySelector('button:not([type])').disabled = false; }
  };
}

// ---- startscherm: sleutels die buiten zijn ---------------------------------------------------
UIT.vandaag.push('', '<div id="sleutels-start"></div>');
(UIT.naVandaag ??= []).push(async () => {
  const doel = document.getElementById('sleutels-start'); if (!doel) return;
  try {
    const [open, vmes] = await Promise.all([q(sb.from('sleutelafhaal').select('vme_id, afhaler, sleutel, terug_tegen, getekend_op').is('terug_op', null).order('getekend_op')), q(sb.from('vme').select('id, naam'))]);
    const buiten = open.filter((r) => r.getekend_op);   // wat nog niet getekend is, is nog niet weg
    if (!document.body.contains(doel) || !buiten.length) return;
    const vandaag = sleutelVandaag(), laat = buiten.filter((r) => r.terug_tegen && r.terug_tegen < vandaag).length;
    doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Sleutels buiten <span class="pil ${laat ? 'fout' : 'warn'}">${buiten.length}${laat ? `, waarvan ${laat} te laat` : ''}</span></h3>
      ${buiten.map((r) => `<p style="margin:6px 0"><a href="#/vme/${r.vme_id}/sleutels">${esc(vmes.find((x) => x.id === r.vme_id)?.naam ?? '')}</a>: ${esc(r.sleutel)} bij <b>${esc(r.afhaler)}</b> <span class="klein">sinds ${dat(r.getekend_op)}${r.terug_tegen ? `, terug tegen ${dat(r.terug_tegen)}` : ''}</span>${r.terug_tegen && r.terug_tegen < vandaag ? ' <span class="pil fout">te laat</span>' : ''}</p>`).join('')}</div>`;
  } catch (e) { doel.innerHTML = ''; }
});
