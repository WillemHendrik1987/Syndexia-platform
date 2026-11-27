// =============================================================================
// Syndexia Platform - ondertekenen en de nachtronde.
//
// ONDERTEKENEN
//   tabblad Ondertekenen   de syndicus zet een tekst klaar (bv. het verslag van een vergadering),
//                          kiest wie moet tekenen en bezorgt elk zijn eigen link
//   #/teken/<code>         de pagina achter die link: tekst lezen, naam invullen, handtekening
//                          zetten met vinger of muis. Geen account nodig: de link is de sleutel.
// De databank bewaart naam, tijdstip, de tekening en een vingerafdruk van de tekst. Dit is een
// gewone elektronische handtekening, geen gekwalificeerde zoals itsme of eID.
//
// NACHTRONDE
//   op het startscherm staat wanneer de automatische controle laatst liep en hoeveel taken ze
//   klaarzette; met één knop start je ze zelf.
// =============================================================================
const tekenLink = (token) => `${location.origin}${location.pathname}#/teken/${token}`;
const tekenMoment = (v) => (v ? new Date(v).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '');
const tekenGsm = (g) => { let n = String(g ?? '').replace(/[^\d+]/g, ''); if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = `32${n.slice(1)}`; else return null; return /^\d{9,15}$/.test(n) ? n : null; };

UIT.tabs.push(['tekenen', 'Ondertekenen']);
UIT.fn.tekenen = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.tekenen = async () => {
  const v = S.vme, d = S.d, doel = document.getElementById('tabinhoud');
  let verzoeken, tekens, avs, relaties, contacten;
  try {
    [verzoeken, avs, relaties] = await Promise.all([
      q(sb.from('tekenverzoek').select('id, titel, tekst, gesloten_op, aangemaakt_op').eq('vme_id', v.id).order('aangemaakt_op', { ascending: false })),
      q(sb.from('vergadering').select('id, datum, soort, status').eq('vme_id', v.id).order('datum', { ascending: false })),
      q(sb.from('kavel_relatie').select('contact_id, rol, eind_datum').eq('vme_id', v.id).eq('rol', 'eigenaar')),
    ]);
    tekens = verzoeken.length ? await q(sb.from('handtekening').select('id, verzoek_id, contact_id, naam, token, getekend_op, getekend_naam, beeld, vingerafdruk').in('verzoek_id', verzoeken.map((x) => x.id)).order('naam')) : [];
    const ids = [...new Set(relaties.filter((r) => !r.eind_datum).map((r) => r.contact_id))];
    contacten = ids.length ? await q(sb.from('contact').select('id, voornaam, achternaam, bedrijfsnaam, emails, gsm').in('id', ids)) : [];
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;
  const opnieuw = () => schermVme();
  const cNaam = (c) => c.bedrijfsnaam || [c.voornaam, c.achternaam].filter(Boolean).join(' ') || 'zonder naam';
  contacten.sort((a, b) => cNaam(a).localeCompare(cNaam(b)));

  doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Nieuw document om te ondertekenen</h3>
      <p class="klein">Zet de tekst klaar die getekend moet worden en kies wie tekent. Elke ondertekenaar krijgt een eigen link en tekent zonder account, met vinger of muis. Het is een gewone elektronische handtekening, geen itsme of eID.</p>
      <form id="ftn"><div class="rij">${veld('Titel', inp('titel', 'required placeholder="bv. Verslag algemene vergadering 30/04/2026"'), '3 1 280px')}${avs.length ? veld('Verslag overnemen van', kies('av', `<option value="">niet overnemen</option>${avs.map((g) => `<option value="${g.id}">${dat(g.datum)} (${esc(g.soort)}, ${esc(g.status)})</option>`).join('')}`)) : ''}</div>
        <label>Tekst die getekend wordt</label><textarea name="tekst" rows="8" required maxlength="40000" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit"></textarea>
        <label style="margin-top:10px">Wie tekent?</label>
        <div>${contacten.map((c) => `<label style="display:block;font-weight:400"><input type="checkbox" name="wie" value="${c.id}" style="width:auto" checked> ${esc(cNaam(c))}</label>`).join('') || '<p class="leeg">Geen eigenaars gevonden in deze VME.</p>'}</div>
        <div class="rij">${veld('Extra ondertekenaar (naam)', inp('extra', 'placeholder="bv. de syndicus of een volmachthouder"'), '2 1 260px')}</div>
        <p><button>Klaarzetten</button></p></form></div>
    ${verzoeken.map((x) => { const lijst = tekens.filter((t) => t.verzoek_id === x.id), klaar = lijst.filter((t) => t.getekend_op).length;
      return `<div class="kaart"><details class="tv" data-id="${x.id}"${S.tekenOpen === x.id ? ' open' : ''}><summary style="cursor:pointer"><b>${esc(x.titel)}</b> <span class="pil ${x.gesloten_op ? '' : klaar === lijst.length && lijst.length ? 'ok' : 'warn'}">${x.gesloten_op ? 'afgesloten' : `${klaar} van ${lijst.length} getekend`}</span> <span class="klein">${dat(x.aangemaakt_op)}</span></summary>
        <p style="white-space:pre-wrap;max-height:220px;overflow:auto;border:1px solid var(--l);border-radius:8px;padding:10px">${esc(x.tekst)}</p>
        ${tabel(['Ondertekenaar', 'Stand', 'Handtekening', ''], lijst.map((t) => { const c = contacten.find((k) => k.id === t.contact_id), link = tekenLink(t.token), gsm = c ? tekenGsm(c.gsm) : null,
            bericht = `Beste, graag uw handtekening onder "${x.titel}" (${v.naam}). Dat kan via deze link: ${link}`;
          return `<tr>${cel(t.naam)}<td>${t.getekend_op ? `<span class="pil ok">getekend</span><br><span class="klein">${esc(t.getekend_naam)} · ${tekenMoment(t.getekend_op)}</span>` : '<span class="pil warn">wacht</span>'}</td>
            <td>${t.beeld ? `<img src="${esc(t.beeld)}" alt="Handtekening van ${esc(t.getekend_naam)}" style="height:44px;max-width:160px">` : ''}</td>
            <td>${t.getekend_op || x.gesloten_op ? '' : `<button type="button" class="stil" data-kopie="${esc(link)}">Link kopiëren</button> ${c?.emails?.[0] ? `<a class="knop licht" href="mailto:${esc(c.emails[0])}?subject=${encodeURIComponent(`Ondertekenen: ${x.titel}`)}&body=${encodeURIComponent(bericht)}">Mail</a> ` : ''}${gsm ? `<a class="knop licht" target="_blank" rel="noopener" href="https://wa.me/${gsm}?text=${encodeURIComponent(bericht)}">WhatsApp</a> ` : ''}<button type="button" class="stil" data-twis="${t.id}">Weghalen</button>`}</td></tr>`; }))}
        <p>${x.gesloten_op ? '' : `<button type="button" class="stil" data-sluit="${x.id}">Afsluiten: niemand kan nog tekenen</button> `}<button type="button" class="stil" data-druk="${x.id}">Afdrukken met handtekeningen</button>${klaar ? '' : ` <button type="button" class="stil" data-vwis="${x.id}">Wissen</button>`}</p>
        ${klaar ? `<p class="klein">Vingerafdruk van de getekende tekst (sha256): ${esc(lijst.find((t) => t.vingerafdruk)?.vingerafdruk ?? '')}</p>` : ''}</details></div>`; }).join('')}`;

  doel.querySelectorAll('details.tv').forEach((el) => { el.ontoggle = () => { if (el.open) S.tekenOpen = el.dataset.id; else if (S.tekenOpen === el.dataset.id) S.tekenOpen = null; }; });
  const f = document.getElementById('ftn');
  // het verslag van een vergadering overnemen: agendapunten met hun besluit
  if (f.av) f.av.onchange = async () => { const g = avs.find((a) => a.id === f.av.value); if (!g) return;
    try {
      const punten = await q(sb.from('agendapunt').select('volgnummer, titel, besluit').eq('vergadering_id', g.id).order('volgnummer'));
      f.tekst.value = `Verslag van de ${g.soort} algemene vergadering van ${dat(g.datum)}\n${v.naam}\n\n${punten.map((p) => `${p.volgnummer}. ${p.titel}${p.besluit ? `\n   ${p.besluit}` : ''}`).join('\n\n')}`;
      if (!f.titel.value) f.titel.value = `Verslag algemene vergadering ${dat(g.datum)}`;
    } catch (e) { fout(e); opnieuw(); } };
  f.onsubmit = async (ev) => { ev.preventDefault(); f.querySelector('button:not([type])').disabled = true;
    try {
      const wie = [...f.querySelectorAll('[name=wie]:checked')].map((b) => contacten.find((c) => c.id === b.value)).filter(Boolean), extra = f.extra.value.trim();
      if (!wie.length && !extra) throw new Error('Kies minstens één ondertekenaar.');
      const [nieuw] = await q(sb.from('tekenverzoek').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, titel: f.titel.value.trim(), tekst: f.tekst.value.trim() }).select('id'));
      await q(sb.from('handtekening').insert([...wie.map((c) => ({ kantoor_id: S.kantoor.id, verzoek_id: nieuw.id, contact_id: c.id, naam: cNaam(c) })), ...(extra ? [{ kantoor_id: S.kantoor.id, verzoek_id: nieuw.id, contact_id: null, naam: extra }] : [])]));
      S.tekenOpen = nieuw.id; S.bericht = { soort: 'ok', tekst: 'Klaargezet. Bezorg elke ondertekenaar zijn link.' };
    } catch (e) { fout(e); } opnieuw(); };
  const klik = (kiezer, werk) => doel.querySelectorAll(kiezer).forEach((b) => { b.onclick = async () => { try { await werk(b); } catch (e) { fout(e); } opnieuw(); }; });
  doel.querySelectorAll('[data-kopie]').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.kopie); b.textContent = 'Gekopieerd'; } catch (e) { b.insertAdjacentHTML('afterend', `<input readonly value="${esc(b.dataset.kopie)}" style="margin-top:6px" onfocus="this.select()">`); b.remove(); } }; });
  klik('[data-twis]', async (b) => { await q(sb.from('handtekening').delete().eq('id', b.dataset.twis)); });
  klik('[data-sluit]', async (b) => { await q(sb.from('tekenverzoek').update({ gesloten_op: new Date().toISOString() }).eq('id', b.dataset.sluit)); S.bericht = { soort: 'ok', tekst: 'Afgesloten.' }; });
  klik('[data-vwis]', async (b) => { await q(sb.from('tekenverzoek').delete().eq('id', b.dataset.vwis)); S.bericht = { soort: 'ok', tekst: 'Gewist.' }; });
  doel.querySelectorAll('[data-druk]').forEach((b) => { b.onclick = () => { const x = verzoeken.find((r) => r.id === b.dataset.druk), lijst = tekens.filter((t) => t.verzoek_id === x.id);
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(x.titel)}</title><style>body{font:14px/1.5 Georgia,serif;max-width:720px;margin:30px auto;padding:0 20px}pre{white-space:pre-wrap;font:inherit}td{padding:8px 14px 8px 0;vertical-align:bottom;border-bottom:1px solid #ccc}img{height:60px}small{color:#555}</style>
      <h1 style="font-size:20px">${esc(x.titel)}</h1><p>${esc(v.naam)}</p><pre>${esc(x.tekst)}</pre><h2 style="font-size:16px">Handtekeningen</h2>
      <table>${lijst.map((t) => `<tr><td>${esc(t.naam)}</td><td>${t.beeld ? `<img src="${esc(t.beeld)}" alt="">` : '<i>niet getekend</i>'}</td><td>${t.getekend_op ? `${esc(t.getekend_naam)}<br><small>${tekenMoment(t.getekend_op)}</small>` : ''}</td></tr>`).join('')}</table>
      <p><small>Elektronisch ondertekend via het Syndexia Platform. Vingerafdruk van de tekst (sha256): ${esc(lijst.find((t) => t.vingerafdruk)?.vingerafdruk ?? 'nog niet getekend')}</small></p>`);
    w.document.close(); w.focus(); w.print(); }; });
};

// ---- de openbare tekenpagina ------------------------------------------------------------
const tekenVorigeOpenbaar = UIT.openbaar;
UIT.openbaar = () => {
  const [, deel, code] = location.hash.split('/');
  if (deel === 'teken' && code) { schermTeken(code); return true; }
  return tekenVorigeOpenbaar ? tekenVorigeOpenbaar() : false;
};
async function schermTeken(code) {
  const wie = document.getElementById('wie'); if (wie) wie.innerHTML = '';
  const kaart = (html) => toon(`<div class="kaart" style="max-width:640px;margin:24px auto">${html}</div>`);
  toon('<p class="leeg">Laden…</p>');
  let info;
  try { if (!/^[0-9a-f-]{36}$/i.test(code)) throw new Error('x'); info = await q(sb.rpc('teken_info', { p_token: code })); } catch (e) { info = null; }
  if (!info) { kaart('<h2>Ondertekenen</h2><p>Deze link is niet geldig. Vraag uw syndicus om een nieuwe link.</p>'); return; }
  const kop = `<p class="klein" style="margin:0">${esc(info.vme)}</p><h2 style="margin-top:4px">${esc(info.titel)}</h2>`, tekst = `<p style="white-space:pre-wrap;max-height:45vh;overflow:auto;border:1px solid var(--l);border-radius:8px;padding:12px">${esc(info.tekst)}</p>`;
  if (info.getekend_op) { kaart(`${kop}${tekst}<div class="melding ok">U hebt dit document ondertekend op ${tekenMoment(info.getekend_op)}.</div>`); return; }
  if (info.gesloten) { kaart(`${kop}${tekst}<div class="melding fout">Dit document is afgesloten; tekenen kan niet meer.</div>`); return; }
  kaart(`${kop}${tekst}
    <form id="ftk"><label>Uw naam</label><input name="naam" required minlength="2" maxlength="120" value="${esc(info.naam)}" autocomplete="name">
      <label style="margin-top:10px">Uw handtekening (teken met uw vinger of de muis)</label>
      <canvas id="tekenvlak" width="600" height="200" style="width:100%;height:180px;border:2px dashed var(--l);border-radius:10px;background:#fff;touch-action:none;cursor:crosshair" aria-label="Vlak om uw handtekening te zetten"></canvas>
      <p><button type="button" class="stil" id="tekenleeg">Opnieuw</button></p>
      <p><label style="display:inline;font-weight:400"><input type="checkbox" name="akkoord" required style="width:auto"> Ik heb de tekst gelezen en teken voor akkoord.</label></p>
      <div id="tekenfout"></div><p><button>Ondertekenen</button></p></form>`);
  const vlak = document.getElementById('tekenvlak'), pen = vlak.getContext('2d'), f = document.getElementById('ftk');
  let bezig = false, lengte = 0, vorige = null;
  pen.lineWidth = 2.5; pen.lineCap = 'round'; pen.lineJoin = 'round'; pen.strokeStyle = '#1a1a1a';
  const plek = (ev) => { const r = vlak.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (vlak.width / r.width), y: (ev.clientY - r.top) * (vlak.height / r.height) }; };
  vlak.onpointerdown = (ev) => { bezig = true; vorige = plek(ev); vlak.setPointerCapture(ev.pointerId); ev.preventDefault(); };
  vlak.onpointermove = (ev) => { if (!bezig) return; const p = plek(ev); pen.beginPath(); pen.moveTo(vorige.x, vorige.y); pen.lineTo(p.x, p.y); pen.stroke(); lengte += Math.hypot(p.x - vorige.x, p.y - vorige.y); vorige = p; };
  vlak.onpointerup = vlak.onpointercancel = () => { bezig = false; };
  document.getElementById('tekenleeg').onclick = () => { pen.clearRect(0, 0, vlak.width, vlak.height); lengte = 0; };
  f.onsubmit = async (ev) => { ev.preventDefault(); const uit = document.getElementById('tekenfout');
    if (lengte < 60) { uit.innerHTML = '<div class="melding fout">Zet eerst uw handtekening in het vak.</div>'; return; }
    f.querySelector('button:not([type])').disabled = true;
    try { await q(sb.rpc('teken', { p_token: code, p_naam: f.naam.value, p_beeld: vlak.toDataURL('image/png') })); schermTeken(code); }
    catch (e) { uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; f.querySelector('button:not([type])').disabled = false; }
  };
}

// ---- nachtronde op het startscherm ----------------------------------------------------------
UIT.vandaag.push('', '<div id="nachtronde-start"></div>');
(UIT.naVandaag ??= []).push(async () => {
  const doel = document.getElementById('nachtronde-start'); if (!doel) return;
  const teken = async () => {
    try {
      const [laatste] = await q(sb.from('nachtronde_log').select('gelopen_op, nieuwe_taken').order('gelopen_op', { ascending: false }).limit(1));
      if (!document.body.contains(doel)) return;
      doel.innerHTML = `<p class="klein" id="nachtronde-regel">Automatische controle: ${laatste ? `laatst gelopen op ${tekenMoment(laatste.gelopen_op)}, ${laatste.nieuwe_taken} nieuwe taak/taken` : 'nog niet gelopen'}. Ze loopt elke nacht en zet taken klaar voor attesten, werkopdrachten, vergaderingen, provisies en mails die aandacht vragen. <button type="button" class="stil" id="nachtronde-nu">Nu nakijken</button></p>`;
      document.getElementById('nachtronde-nu').onclick = async (ev) => { ev.target.disabled = true;
        try { const n = await q(sb.rpc('nachtronde_nu')); S.bericht = { soort: 'ok', tekst: n ? `${n} nieuwe taak/taken klaargezet.` : 'Nagekeken: niets nieuws.' }; } catch (e) { fout(e); }
        route(); };
    } catch (e) { doel.innerHTML = ''; }
  };
  teken();
});
