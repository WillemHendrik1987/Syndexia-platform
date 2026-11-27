// =============================================================================
// Syndexia Platform - de Gmail-mailbox van het kantoor.
//
// Is de mailbox gekoppeld, dan toont #/mailbox de echte mailbox in drie kolommen: links de
// mappen (labels van Gmail), in het midden de lijst, rechts het leesvenster. Lezen, antwoorden,
// archiveren, een map geven en er een dossier van maken gebeurt hier.
//
// De browser praat nooit rechtstreeks met Google: elke vraag gaat naar de Edge Function
// "gmail". Die bewaart de sleutel van Google; de browser krijgt ze nooit te zien.
// Is er nog niet gekoppeld, dan blijft de oude mailbox (doorgestuurde mails) werken en staat
// er een knop "Gmail koppelen" boven.
// =============================================================================
async function gmail(actie, extra = {}) {
  const { data, error } = await sb.functions.invoke('gmail', { body: { actie, ...extra } });
  if (error || data?.fout) {
    let meer = data ?? {}; try { meer = await error.context.json(); } catch (e) { /* geen uitleg van de functie */ }
    const f = new Error(meer.fout ?? error?.message ?? 'De mailbox antwoordt niet.'); f.koppelen = !!meer.koppelen; throw f;
  }
  return data;
}
const GM_UITSLAG = { verlopen: 'De aanvraag is verlopen. Klik opnieuw op "Gmail koppelen".', geweigerd: 'Je gaf geen toestemming bij Google; er is niets gekoppeld.', sleutel: 'Google weigert de sleutel van het platform. Kijk Client ID, Client secret en de redirect-URI na.',
  geentoken: 'Google gaf geen blijvende sleutel mee. Probeer opnieuw.', scope: 'De toestemming voor Gmail ontbreekt: vink bij Google het vakje voor Gmail aan.', profiel: 'Het adres van de mailbox kon niet gelezen worden.', bewaren: 'De koppeling kon niet bewaard worden.', fout: 'Er liep iets mis bij het koppelen.' };
// Op het startscherm: hoeveel ongelezen mails in Postvak IN?
(UIT.naVandaag ??= []).push(async () => {
  try { const t = await gmail('teller'), vak = document.getElementById('mbteller'); if (!vak || !t.gekoppeld) return;
    document.getElementById('gmteller')?.remove(); if (t.ongelezen) vak.insertAdjacentHTML('afterend', ` <span class="pil fout" id="gmteller">${Number(t.ongelezen)} ongelezen</span>`); } catch (e) { /* geen teller is geen ramp */ }
});

const gmNaam = (v) => { const m = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/.exec(v ?? ''); return (m ? m[1].trim() || m[2] : String(v ?? '').trim()) || '(onbekend)'; };
const gmAdres = (v) => (/<([^<>]+)>\s*$/.exec(v ?? '')?.[1] ?? String(v ?? '')).trim();
const gmTijd = (iso) => { if (!iso) return ''; const d = new Date(iso), nu = new Date();
  return d.toDateString() === nu.toDateString() ? d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('nl-BE', d.getFullYear() === nu.getFullYear() ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' }); };
const gmGrootte = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

let gmUitslag = null;
const gmStaat = () => ({ label: 'INBOX', zoek: '', labels: [], mails: [], vervolg: null, open: null, gesprek: [], schrijf: null, toonSchrijf: false, beelden: false, vmes: null, beurt: 0, straks: null, gepland: [], kies: new Set() });
const gmLetters = (v) => { const n = gmNaam(v).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/); return ((n[0]?.[0] ?? '?') + (n.length > 1 ? n[n.length - 1][0] : '')).toUpperCase(); };
const gmKleur = (v) => { let h = 0; for (const c of gmAdres(v).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360; return `background:hsl(${h} 42% 90%);color:hsl(${h} 45% 28%)`; };
const gmRond = (v) => `<span class="gmrond" style="${gmKleur(v)}" aria-hidden="true">${esc(gmLetters(v))}</span>`;
// Opmaak van buiten (de handtekening uit Gmail) veilig maken voor in de opsteller: alleen gewone
// opmaak blijft over. Alles wat kan uitvoeren of iets kan laden van een vreemde plek valt weg.
const GM_MAG = new Set(['B', 'I', 'U', 'STRONG', 'EM', 'BR', 'P', 'DIV', 'SPAN', 'A', 'IMG', 'UL', 'OL', 'LI', 'TABLE', 'TBODY', 'TR', 'TD', 'FONT', 'BLOCKQUOTE', 'HR']);
function gmZuiver(html) {
  const doc = new DOMParser().parseFromString(`<div>${html ?? ''}</div>`, 'text/html');
  const loop = (knoop) => { [...knoop.children].forEach((k) => {
    if (!GM_MAG.has(k.tagName)) { if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'FORM', 'SVG'].includes(k.tagName)) k.remove(); else { loop(k); k.replaceWith(...k.childNodes); } return; }
    [...k.attributes].forEach((a) => { const n = a.name.toLowerCase(), w = a.value.trim();
      const mag = (n === 'href' && k.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(w)) || (n === 'src' && k.tagName === 'IMG' && /^(https:|data:image\/(png|jpeg|gif|webp);base64,)/i.test(w)) || (['width', 'height', 'alt', 'color', 'size', 'face'].includes(n) && w.length < 60);
      if (!mag) k.removeAttribute(a.name); });
    if (k.tagName === 'IMG' && !k.getAttribute('src')) { k.remove(); return; }
    if (k.tagName === 'A') { k.setAttribute('target', '_blank'); k.setAttribute('rel', 'noopener noreferrer'); }
    loop(k); }); };
  loop(doc.body.firstChild); return doc.body.firstChild.innerHTML;
}
// Een afbeelding (gesleept, geplakt of gekozen) als data-url. Grote beelden worden verkleind tot
// hoogstens 1600 pixels breed, zodat een schermafdruk de mail niet onnodig zwaar maakt.
async function gmBeeld(file) {
  const lees = (blob) => new Promise((ok, mis) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mis(new Error('De afbeelding is niet leesbaar.')); r.readAsDataURL(blob); });
  try {
    const bm = await createImageBitmap(file), f = Math.min(1, 1600 / bm.width);
    if (f === 1 && file.size < 600000 && /^image\/(png|jpeg|gif|webp)$/.test(file.type)) return lees(file);
    const c = document.createElement('canvas'); c.width = Math.round(bm.width * f); c.height = Math.round(bm.height * f); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  } catch (e) { if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return lees(file); throw new Error(`${file.name || 'De afbeelding'} is geen afbeelding die in de tekst kan.`); }
}
const gmBase64 = (file) => new Promise((ok, mis) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => mis(new Error(`${file.name} is niet leesbaar.`)); r.readAsDataURL(file); });
const GM_MAX = 7 * 1024 * 1024;   // afbeeldingen en bijlagen samen, per mail
const mailboxOud = UIT.routes.mailbox;
UIT.routes.mailbox = async () => {
  const uitslag = new URLSearchParams(location.search).get('gmail');
  // De uitslag van het koppelen blijft enkele seconden geldig: bij het laden tekent de app het scherm soms twee keer na elkaar.
  if (uitslag) { history.replaceState(null, '', location.pathname + location.hash); gmUitslag = { tot: Date.now() + 6000, bericht: uitslag === 'ok' ? { soort: 'ok', tekst: 'De Gmail-mailbox is gekoppeld.' } : { soort: 'fout', tekst: GM_UITSLAG[uitslag] ?? GM_UITSLAG.fout } }; }
  if (location.hash.split('/')[2] === 'doorgestuurd') return mailboxOud();
  // #/mailbox/mail/<id>: vanuit een dossier rechtstreeks naar die mail.
  if (location.hash.split('/')[2] === 'mail' && /^[A-Za-z0-9_-]{1,64}$/.test(location.hash.split('/')[3] ?? '')) { (S.gmail ??= gmStaat()).straks = location.hash.split('/')[3]; history.replaceState(null, '', `${location.pathname}#/mailbox`); }
  let status = null;
  try { status = await gmail('status'); } catch (e) { /* functie niet bereikbaar: de oude mailbox werkt nog */ }
  if (status?.gekoppeld) return schermGmail(status);
  await mailboxOud();
  if (!status) return;
  // Nog niet gekoppeld: de knop om te koppelen, boven de oude mailbox.
  const nu = gmUitslag && Date.now() < gmUitslag.tot ? gmUitslag.bericht : null;
  document.querySelector('#app .kaart')?.insertAdjacentHTML('beforebegin', `<div class="kaart" id="gmkoppel">${nu ? `<div class="melding ${nu.soort}">${esc(nu.tekst)}</div>` : ''}<h3 style="margin-top:0">Gmail rechtstreeks koppelen</h3>
    <p class="klein">Koppel de mailbox van het kantoor en je leest en beantwoordt je mails hier, met de mappen van Gmail erbij. Doorsturen is dan niet meer nodig.</p>
    ${!status.ingesteld ? '<div class="melding fout">De sleutel van Google staat nog niet in Supabase (geheimen GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET).</div>'
      : status.beheerder ? '<p><button id="gmstart">Gmail koppelen</button> <span class="klein">Je meldt je aan bij Google met het adres van de mailbox en geeft toestemming.</span></p>' : '<p class="klein">Alleen een beheerder van het kantoor kan koppelen.</p>'}</div>`);
  const start = document.getElementById('gmstart');
  if (start) start.onclick = async () => { start.disabled = true; try { location.href = (await gmail('start')).url; } catch (e) { fout(e); UIT.routes.mailbox(); } };
};

async function schermGmail(status) {
  const st = (S.gmail ??= gmStaat());
  if (gmUitslag && Date.now() < gmUitslag.tot) S.bericht = gmUitslag.bericht;   // vlak voor het tekenen, zodat een tweede tekenbeurt de melding niet wist
  toon(`${terug}<div id="gm" class="${st.open || st.toonSchrijf ? 'lezen' : ''}">
    <div class="gmkop"><div><h2>Mailbox</h2><span class="klein">${esc(status.email)}</span></div>
      <form id="gmzoek"><input name="zoek" type="search" placeholder="Zoeken in alle mails" aria-label="Zoeken in alle mails" value="${esc(st.zoek)}"><button class="stil">Zoek</button></form>
      <button class="stil" id="gmververs" title="Lijst en mappen opnieuw ophalen">Vernieuwen</button><button class="stil" id="gmconcept" hidden>Concept openen</button><button id="gmnieuw">Nieuwe mail</button></div>
    <div id="gmmelding"></div>
    <div class="gmvak"><nav id="gmlabels" aria-label="Mappen"></nav><div id="gmlijst" aria-label="Mails"></div><div id="gmlees"></div></div>
    <p class="klein" style="margin-top:10px">Mails en bijlagen blijven in Gmail; het platform bewaart er geen kopie van. <a href="#/mailbox/doorgestuurd">Doorgestuurde mails (oude mailbox)</a>${status.beheerder ? ' · <button class="stil" id="gmlos">Mailbox ontkoppelen</button>' : ''}</p></div>`);
  const el = (id) => document.getElementById(id), gm = el('gm');
  if (!gm) return;
  const zeg = (soort, tekst) => { document.querySelectorAll('#app > .melding').forEach((m) => m.remove()); const vak = el('gmmelding'); if (vak) vak.innerHTML = tekst ? `<div class="melding ${soort}">${esc(tekst)}</div>` : ''; };
  // Een fout tonen. Is de koppeling weg (ingetrokken bij Google), dan terug naar het koppelscherm.
  const mis = (e) => { if (e.koppelen) { S.gmail = null; fout(e); return UIT.routes.mailbox(); } zeg('fout', e.message); };
  const wissel = () => { gm.classList.toggle('lezen', !!(st.open || st.toonSchrijf)); if (el('gmconcept')) el('gmconcept').hidden = !(st.schrijf && !st.toonSchrijf); };
  const lang = (t) => new Date(t).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' });

  // ---- mappen ----
  function tekenLabels() {
    const wacht = st.gepland.filter((g) => g.status === 'wacht').length;
    const knop = (l) => `<button class="gml${l.id === st.label ? ' aan' : ''}" data-label="${esc(l.id)}" style="padding-left:${12 + l.diepte * 14}px" title="${esc(l.pad ?? l.naam)}"><span>${esc(l.naam)}</span>${l.ongelezen ? `<b>${Number(l.ongelezen)}</b>` : ''}</button>`;
    const vast = st.labels.filter((l) => l.soort === 'vast'), eigen = st.labels.filter((l) => l.soort === 'eigen');
    el('gmlabels').innerHTML = st.labels.length ? `${vast.map(knop).join('')}${knop({ id: 'UITGESTELD', naam: 'Uitgesteld', diepte: 0, ongelezen: wacht })}${eigen.length ? `<p class="gmtussen">Mappen</p>${eigen.map(knop).join('')}` : ''}` : '<p class="klein" style="padding:10px">Mappen laden…</p>';
    el('gmlabels').querySelectorAll('[data-label]').forEach((b) => { b.onclick = () => { st.label = b.dataset.label; st.zoek = ''; el('gmzoek').zoek.value = ''; st.open = null; st.toonSchrijf = false; st.kies.clear(); wissel(); tekenLabels(); tekenLees(); laadLijst(); };
      // Mails naar een map slepen: alleen mappen waar dat iets betekent lichten op.
      const doel = b.dataset.label, mag = doel !== st.label && (['INBOX', 'STARRED', 'TRASH', 'SPAM'].includes(doel) || st.labels.some((l) => l.id === doel && l.soort === 'eigen'));
      if (!mag) return;
      b.ondragover = (ev) => { if ([...(ev.dataTransfer?.types ?? [])].includes('application/x-syndexia-mails')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; b.classList.add('val'); } };
      b.ondragleave = () => b.classList.remove('val');
      b.ondrop = (ev) => { ev.preventDefault(); b.classList.remove('val'); let ids = []; try { ids = JSON.parse(ev.dataTransfer.getData('application/x-syndexia-mails')); } catch (e) { /* niets gesleept */ } if (ids.length) verplaats(ids, doel); }; });
  }
  async function laadLabels() { try { st.labels = (await gmail('labels')).labels; if (el('gmlabels')) tekenLabels(); } catch (e) { mis(e); } }
  async function laadGepland() {
    try { st.gepland = await q(sb.from('uitgestelde_mail').select('id, verstuur_op, aan, onderwerp, status, fout, verstuurd_op').in('status', ['wacht', 'bezig', 'mislukt']).order('verstuur_op').limit(100)); } catch (e) { st.gepland = []; }
    if (el('gmlabels')) tekenLabels(); if (st.label === 'UITGESTELD' && el('gmlijst')) tekenLijst(false);
  }

  // ---- de lijst ----
  function tekenLijst(bezig) {
    const vak = el('gmlijst');
    if (st.label === 'UITGESTELD' && !st.zoek) {
      vak.innerHTML = st.gepland.map((g) => `<div class="gmrij gmplan"><span class="gmvan">Aan: ${esc(g.aan)}</span><span class="gmtijd">${esc(gmTijd(g.verstuur_op))}</span><span class="gmond">${esc(g.onderwerp)}</span>
          <span class="gmfrag">${g.status === 'wacht' ? `Vertrekt op ${esc(lang(g.verstuur_op))}` : g.status === 'bezig' ? 'Wordt nu verstuurd…' : `<span class="pil fout">mislukt</span> ${esc(g.fout ?? '')}`}</span>
          ${g.status === 'wacht' ? `<span class="gmfrag"><button class="stil" data-annuleer="${g.id}">Niet versturen</button></span>` : ''}</div>`).join('') || '<p class="leeg" style="padding:14px">Er staat geen mail klaar om later te versturen.</p>';
      vak.querySelectorAll('[data-annuleer]').forEach((b) => { b.onclick = async () => { b.disabled = true; try { await gmail('annuleer', { id: b.dataset.annuleer }); zeg('ok', 'De mail wordt niet verstuurd.'); } catch (e) { mis(e); } laadGepland(); }; });
      return;
    }
    const verzonden = st.label === 'SENT' || st.label === 'DRAFT', concepten = st.label === 'DRAFT' && !st.zoek, eigenMappen = st.labels.filter((l) => l.soort === 'eigen');
    [...st.kies].forEach((id) => { if (!st.mails.some((m) => m.id === id)) st.kies.delete(id); });
    // Bovenaan: alles aanvinken, en zodra er iets aangevinkt is de knoppen voor al die mails samen.
    const balk = st.mails.length && !concepten ? `<div class="gmbulk"><label title="Alles aanvinken"><input type="checkbox" id="gmalles"${st.kies.size && st.kies.size === st.mails.length ? ' checked' : ''}> <span class="klein">${st.kies.size ? `${st.kies.size} gekozen` : 'Alles'}</span></label>
      ${st.kies.size ? `<button class="stil" data-bulk="archief">Archiveren</button><button class="stil" data-bulk="gelezen">Gelezen</button><button class="stil" data-bulk="ongelezen">Ongelezen</button><button class="stil" data-bulk="weg">Prullenbak</button>${eigenMappen.length ? `<select id="gmbulkmap" aria-label="Gekozen mails in een map zetten"><option value="">Naar map…</option>${eigenMappen.map((l) => `<option value="${esc(l.id)}">${esc(l.pad ?? l.naam)}</option>`).join('')}</select>` : ''}` : ''}</div>` : '';
    vak.innerHTML = balk + (st.mails.map((m) => { const wie = verzonden ? (m.aan || '').split(',')[0] : m.van, d = st.dossiers?.[m.draad];
      return `<div class="gmrij${m.ongelezen ? ' nieuw' : ''}${st.open?.id === m.id ? ' aan' : ''}${st.kies.has(m.id) ? ' gekozen' : ''}" data-mail="${esc(m.id)}" role="button" tabindex="0"${concepten ? '' : ' draggable="true"'}>${concepten ? '<span class="gmvink"></span>' : `<input type="checkbox" class="gmvink" data-kies="${esc(m.id)}" aria-label="Deze mail aanvinken"${st.kies.has(m.id) ? ' checked' : ''}>`}${gmRond(wie)}
        <span class="gmvan">${esc(verzonden ? `Aan: ${gmNaam(wie)}` : gmNaam(m.van))}</span><span class="gmtijd">${esc(gmTijd(m.datum))}</span>
        <span class="gmond">${esc(m.onderwerp || '(geen onderwerp)')}</span><button class="gmster${m.ster ? ' aan' : ''}" data-ster="${esc(m.id)}" title="${m.ster ? 'Ster weghalen' : 'Ster geven'}" aria-label="${m.ster ? 'Ster weghalen' : 'Ster geven'}">${m.ster ? '★' : '☆'}</button>
        <span class="gmfrag">${d ? `<span class="pil">dossier #${Number(d.nummer)}</span> ` : ''}${esc(m.fragment)}</span></div>`; }).join('')
      || (bezig ? '' : `<p class="leeg" style="padding:14px">${st.zoek ? 'Niets gevonden.' : 'Deze map is leeg.'}</p>`))
      + (bezig ? '<p class="klein" style="padding:14px">Laden…</p>' : st.vervolg ? '<p style="padding:10px"><button class="stil" id="gmmeer">Meer laden</button></p>' : '');
    const open1 = (id) => (concepten ? openConcept(id) : openMail(id));
    vak.querySelectorAll('[data-mail]').forEach((b) => { b.onclick = (ev) => { if (!ev.target.closest('[data-ster], [data-kies]')) open1(b.dataset.mail); }; b.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target === b) open1(b.dataset.mail); };
      // Slepen: de aangevinkte mails als de gesleepte erbij hoort, anders alleen die ene.
      b.ondragstart = (ev) => { const id = b.dataset.mail, ids = st.kies.has(id) ? [...st.kies] : [id]; ev.dataTransfer.setData('application/x-syndexia-mails', JSON.stringify(ids)); ev.dataTransfer.effectAllowed = 'move'; gm.classList.add('sleept'); };
      b.ondragend = () => gm.classList.remove('sleept'); });
    vak.querySelectorAll('[data-kies]').forEach((c) => { c.onchange = () => { if (c.checked) st.kies.add(c.dataset.kies); else st.kies.delete(c.dataset.kies); tekenLijst(false); }; });
    if (el('gmalles')) el('gmalles').onchange = (ev) => { st.kies = new Set(ev.target.checked ? st.mails.map((m) => m.id) : []); tekenLijst(false); };
    vak.querySelectorAll('[data-bulk]').forEach((b) => { b.onclick = () => bulk(b.dataset.bulk, b); });
    if (el('gmbulkmap')) el('gmbulkmap').onchange = (ev) => ev.target.value && verplaats([...st.kies], ev.target.value);
    vak.querySelectorAll('[data-ster]').forEach((b) => { b.onclick = async () => { const m = st.mails.find((x) => x.id === b.dataset.ster); if (!m) return;
      try { await gmail('wijzig', m.ster ? { id: m.id, eraf: ['STARRED'] } : { id: m.id, erbij: ['STARRED'] }); m.ster = !m.ster; if (st.open?.id === m.id) st.open.ster = m.ster; tekenLijst(false); } catch (e) { mis(e); } }; });
    if (el('gmmeer')) el('gmmeer').onclick = () => laadLijst(true);
  }
  async function laadLijst(meer = false) {
    const beurt = ++st.beurt;
    if (st.label === 'UITGESTELD' && !st.zoek) { tekenLijst(false); return laadGepland(); }
    if (!meer) { st.mails = []; st.vervolg = null; }
    tekenLijst(true);
    try {
      const uit = await gmail('lijst', { label: st.zoek ? 'ALLE' : st.label, zoek: st.zoek, vervolg: meer ? st.vervolg : null });
      if (beurt !== st.beurt || !el('gmlijst')) return;   // intussen is een andere map gekozen
      st.mails = meer ? [...st.mails, ...uit.mails] : uit.mails; st.vervolg = uit.vervolg; tekenLijst(false);
      // Welke gesprekken hangen al aan een dossier? Eén vraag voor de hele lijst.
      const draden = [...new Set(st.mails.map((m) => m.draad).filter(Boolean))];
      if (draden.length) { try { const kop = await q(sb.from('dossier_mail').select('draad, dossier_id').in('draad', draden));
        if (kop.length) { const ds = await q(sb.from('dossier').select('id, nummer').in('id', [...new Set(kop.map((k) => k.dossier_id))])); st.dossiers = Object.fromEntries(kop.map((k) => [k.draad, ds.find((d) => d.id === k.dossier_id)]).filter(([, d]) => d)); } else st.dossiers = {};
        if (beurt === st.beurt && el('gmlijst')) tekenLijst(false); } catch (e) { /* de lijst blijft bruikbaar zonder */ } }
    } catch (e) { if (beurt === st.beurt && el('gmlijst')) { tekenLijst(false); mis(e); } }
  }
  // Een bewerking op alle aangevinkte mails samen.
  async function bulk(wat, knop) {
    const ids = [...st.kies]; if (!ids.length) return; knop.disabled = true;
    try {
      if (wat === 'weg') { const u = await gmail('bulkweg', { ids }); zeg('ok', `${u.aantal} mail(s) naar de prullenbak. Gmail bewaart ze daar nog 30 dagen.`); }
      else { const w = { archief: { eraf: ['INBOX'] }, gelezen: { eraf: ['UNREAD'] }, ongelezen: { erbij: ['UNREAD'] } }[wat]; const u = await gmail('bulk', { ids, ...w });
        zeg('ok', `${u.aantal} mail(s) ${wat === 'archief' ? 'gearchiveerd' : wat === 'gelezen' ? 'op gelezen gezet' : 'op ongelezen gezet'}.`); }
      st.kies.clear(); if (ids.includes(st.open?.id)) { st.open = null; wissel(); tekenLees(); } laadLijst(); laadLabels();
    } catch (e) { knop.disabled = false; mis(e); }
  }
  // Mails in een map zetten (gesleept of via "Naar map…"). Vanuit Postvak IN of een eigen map is dat
  // verplaatsen: de mail gaat uit de map waar je staat. Vanuit een andere plek krijgt ze de map erbij.
  async function verplaats(ids, doel) {
    const naam = st.labels.find((l) => l.id === doel)?.naam ?? 'de map';
    try {
      if (doel === 'TRASH') { const u = await gmail('bulkweg', { ids }); zeg('ok', `${u.aantal} mail(s) naar de prullenbak.`); }
      else { const hier = st.labels.find((l) => l.id === st.label), uit = !st.zoek && doel !== 'STARRED' && hier && hier.id !== doel && (hier.id === 'INBOX' || hier.soort === 'eigen') ? [hier.id] : [];
        const u = await gmail('bulk', { ids, erbij: [doel], eraf: uit }); zeg('ok', `${u.aantal} mail(s) ${uit.length ? 'verplaatst naar' : 'gezet in'} ${naam}.`); }
      st.kies.clear(); if (ids.includes(st.open?.id)) { st.open = null; wissel(); tekenLees(); } laadLijst(); laadLabels();
    } catch (e) { mis(e); }
  }
  // Een concept uit de map Concepten gaat open in de opsteller, niet in het leesvenster.
  async function openConcept(id) {
    zeg(); if (st.schrijf?.vuil) await bewaarConcept();
    try {
      const c = await gmail('conceptlees', { id });
      st.schrijf = { antwoordOp: null, draadKop: c.draadKop, conceptId: c.conceptId, doorstuurVan: c.bijlagen.length ? c.berichtId : null, zonderInline: true, meeBijlagen: c.bijlagen, nietMee: [], aan: c.aan, cc: c.cc, bcc: c.bcc, onderwerp: c.onderwerp, html: gmZuiver(c.html), bijlagen: [], citaat: '', titel: 'Concept', vuil: false, stand: 'Concept uit Gmail geopend.' };
      st.open = null; st.toonSchrijf = true; wissel(); tekenLees();
    } catch (e) { mis(e); laadLijst(); }
  }
  // Het concept in Gmail bewaren. Gebeurt vanzelf enkele seconden nadat je stopt met typen, en als je
  // de opsteller verlaat. Loopt er al een bewaarbeurt, dan wacht de volgende daarop.
  let bewaarBezig = null, bewaarKlok = null;
  async function pakIn(s, ed, f) {
    // Afbeeldingen in de tekst gaan apart mee; in de tekst blijft alleen een verwijzing (cid) staan.
    const kopie = new DOMParser().parseFromString(ed ? ed.innerHTML : s.html, 'text/html').body, beelden = [];   // een los document: hier wordt niets geladen of uitgevoerd
    kopie.querySelectorAll('img').forEach((img) => { const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(img.getAttribute('src') ?? ''); if (!m) return; const cid = `b${beelden.length + 1}@syndexia`;
      beelden.push({ cid, soort: m[1], base64: m[2], naam: `afbeelding-${beelden.length + 1}.${m[1].split('/')[1].replace('jpeg', 'jpg')}` }); img.setAttribute('src', `cid:${cid}`); });
    const bijlagen = []; for (const b of s.bijlagen) bijlagen.push({ naam: b.name, soort: b.type || 'application/octet-stream', base64: await gmBase64(b) });
    return { aan: f ? f.aan.value : s.aan, cc: f ? f.cc.value : s.cc, bcc: f ? f.bcc.value : s.bcc, onderwerp: f ? f.onderwerp.value : s.onderwerp, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px">${kopie.innerHTML}</div>`, beelden, bijlagen,
      antwoordOp: s.antwoordOp, draadKop: s.draadKop ?? null, doorstuurVan: s.doorstuurVan, zonderInline: !!s.zonderInline, nietMee: s.nietMee ?? [], conceptId: s.conceptId ?? null };
  }
  function bewaarConcept() {
    clearTimeout(bewaarKlok);
    const s = st.schrijf; if (!s || !s.vuil) return bewaarBezig ?? Promise.resolve();
    if (bewaarBezig) return bewaarBezig.then(() => (st.schrijf === s ? bewaarConcept() : null));
    s.vuil = false; const stand = (t) => { s.stand = t; const v = el('gmconceptstand'); if (v && st.schrijf === s) v.textContent = t; };
    stand('Concept bewaren…');
    bewaarBezig = (async () => {
      try {
        const nieuw = s.bijlagen.length, uit = await gmail('concept', await pakIn(s, st.toonSchrijf && st.schrijf === s ? el('gmedit') : null, st.toonSchrijf && st.schrijf === s ? el('gmform') : null));
        s.conceptId = uit.conceptId;
        if (st.schrijf !== s) return;   // intussen weggegooid of verstuurd: wie dat deed ruimt het concept op
        // Bijlagen staan nu bij Gmail: de browser hoeft ze niet opnieuw op te sturen.
        if (nieuw || s.doorstuurVan) { s.bijlagen = s.bijlagen.slice(nieuw); s.meeBijlagen = uit.bijlagen; s.doorstuurVan = uit.bijlagen.length ? uit.berichtId : null; s.zonderInline = true; s.nietMee = []; if (s.tekenBij) s.tekenBij(); }
        stand(`Concept bewaard in Gmail om ${new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}.`);
      } catch (e) { s.vuil = true; stand('Het concept kon niet bewaard worden.'); if (e.koppelen) mis(e); }
    })().finally(() => { bewaarBezig = null; });
    return bewaarBezig;
  }
  async function openMail(id) {
    zeg(); if (st.schrijf?.vuil) bewaarConcept(); st.toonSchrijf = false; st.beelden = false; st.open = { id, laden: true }; st.gesprek = []; st.gekoppeld = null; wissel(); tekenLees();
    el('gmlijst').querySelectorAll('.gmrij').forEach((b) => b.classList.toggle('aan', b.dataset.mail === id));
    try {
      const { mail, gesprek } = await gmail('lees', { id });
      if (st.open?.id !== id) return;
      st.open = mail; st.gesprek = gesprek ?? []; const rij = st.mails.find((m) => m.id === id);
      if (rij?.ongelezen) { rij.ongelezen = false; el('gmlijst').querySelector(`[data-mail="${id}"]`)?.classList.remove('nieuw'); const l = st.labels.find((x) => x.id === 'INBOX'); if (l && mail.labels.includes('INBOX') && l.ongelezen > 0) { l.ongelezen--; tekenLabels(); } }
      tekenLees(); laadKoppeling(mail);
    } catch (e) { st.open = null; wissel(); tekenLees(); mis(e); }
  }

  // ---- het leesvenster ----
  function tekenLees() {
    const vak = el('gmlees'); if (!vak) return;
    if (st.schrijf && st.toonSchrijf) return tekenSchrijf(vak);
    const m = st.open;
    if (!m) { vak.innerHTML = '<p class="leeg" style="padding:24px">Kies een mail om te lezen.</p>'; return; }
    if (m.laden) { vak.innerHTML = '<p class="klein" style="padding:24px">Mail openen…</p>'; return; }
    const inbox = m.labels.includes('INBOX'), weg = m.labels.includes('TRASH'), eigen = st.labels.filter((l) => l.soort === 'eigen');
    const andere = [...(m.aan || '').split(','), ...(m.cc || '').split(',')].map(gmAdres).filter((a) => a && a.toLowerCase() !== status.email.toLowerCase());
    vak.innerHTML = `<div class="gmacties"><button class="stil gmterug" data-doe="terug">← Lijst</button><button data-doe="antwoord">Beantwoorden</button>${andere.length ? '<button class="stil" data-doe="allen">Allen beantwoorden</button>' : ''}<button class="stil" data-doe="door">Doorsturen</button>
        <span class="gmrek"></span><button class="stil" data-doe="ongelezen">Ongelezen</button>${weg ? '<button class="stil" data-doe="terugzetten">Terugzetten</button>' : `${inbox ? '<button class="stil" data-doe="archief">Archiveren</button>' : '<button class="stil" data-doe="inbox">Naar Postvak IN</button>'}<button class="stil" data-doe="weg">Prullenbak</button>`}</div>
      <h3 class="gmtitel">${esc(m.onderwerp || '(geen onderwerp)')}</h3>
      <div class="gmwie">${gmRond(m.van)}<div><b>${esc(gmNaam(m.van))}</b> <span class="klein">${esc(gmAdres(m.van))}</span><br><span class="klein">Aan: ${esc(m.aan)}${m.cc ? ` · Cc: ${esc(m.cc)}` : ''}</span></div><span class="klein gmwanneer">${m.datum ? esc(lang(m.datum)) : ''}</span></div>
      ${st.gesprek.length > 1 ? `<details class="gmgesprek"><summary>Dit gesprek telt ${st.gesprek.length} mails</summary>${st.gesprek.map((g) => `<button class="gmg${g.id === m.id ? ' aan' : ''}" data-gesprek="${esc(g.id)}"><span>${esc(gmNaam(g.van))}</span><span class="klein">${esc(gmTijd(g.datum))}</span><span class="klein gmfrag">${esc(g.fragment)}</span></button>`).join('')}</details>` : ''}
      <p class="gmmappen">${eigen.filter((l) => m.labels.includes(l.id)).map((l) => `<span class="pil">${esc(l.pad ?? l.naam)} <button class="gmx" data-eraf="${esc(l.id)}" title="Uit deze map halen" aria-label="Uit de map ${esc(l.naam)} halen">×</button></span>`).join(' ')}
        ${eigen.length ? `<select id="gmmap" aria-label="In een map zetten" style="width:auto;padding:4px 8px;font-size:13px"><option value="">+ map</option>${eigen.filter((l) => !m.labels.includes(l.id)).map((l) => `<option value="${esc(l.id)}">${esc(l.pad ?? l.naam)}</option>`).join('')}</select>` : ''}</p>
      ${m.bijlagen.length ? `<p class="gmbijlagen">${m.bijlagen.map((b, i) => `<button class="stil" data-bijlage="${i}">📎 ${esc(b.naam)} <span class="klein">${gmGrootte(b.grootte)}</span></button>`).join(' ')}</p>` : ''}
      ${m.html ? `<p class="klein" style="margin:6px 0"><label style="display:inline"><input type="checkbox" id="gmbeelden"${st.beelden ? ' checked' : ''}> Afbeeldingen van buitenaf tonen</label></p><iframe id="gmkader" title="Inhoud van de mail" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`
        : `<pre class="gmtekst">${esc(m.tekst || '(geen tekst)')}</pre>`}
      <div class="gmdossier" id="gmdossiervak"></div>`;
    // De html van een mail komt van buiten. Ze staat daarom in een afgesloten kader: scripts draaien
    // er niet, formulieren werken niet, en afbeeldingen van buitenaf (vaak volgpixels) blijven weg
    // tot je ze zelf aanzet.
    const kader = el('gmkader');
    if (kader) kader.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${st.beelden ? ' https:' : ''}"><base target="_blank"><style>body{font:14px/1.5 system-ui,sans-serif;margin:10px;overflow-wrap:anywhere;color:#2B1622}img{max-width:100%;height:auto}table{max-width:100%}</style>${m.html}`;
    if (el('gmbeelden')) el('gmbeelden').onchange = (ev) => { st.beelden = ev.target.checked; tekenLees(); };
    vak.querySelectorAll('[data-doe]').forEach((b) => { b.onclick = () => doe(b.dataset.doe, b); });
    vak.querySelectorAll('[data-gesprek]').forEach((b) => { b.onclick = () => b.dataset.gesprek !== m.id && openMail(b.dataset.gesprek); });
    vak.querySelectorAll('[data-eraf]').forEach((b) => { b.onclick = () => zetMap([], [b.dataset.eraf]); });
    if (el('gmmap')) el('gmmap').onchange = (ev) => ev.target.value && zetMap([ev.target.value], []);
    vak.querySelectorAll('[data-bijlage]').forEach((b) => { b.onclick = async () => {
      const bij = m.bijlagen[Number(b.dataset.bijlage)]; b.disabled = true;
      try { const { base64 } = await gmail('bijlage', { id: m.id, bijlage: bij.id }), bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: bij.soort })); a.download = bij.naam; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      } catch (e) { mis(e); }
      b.disabled = false; }; });
    tekenKoppeling();
  }
  async function zetMap(erbij, eraf) {
    const m = st.open;
    try { m.labels = (await gmail('wijzig', { id: m.id, erbij, eraf })).labels; if (st.open?.id === m.id) tekenLees(); } catch (e) { mis(e); }
  }
  // Na archiveren, prullenbak of ongelezen: de mail uit beeld, de lijst en tellers opnieuw.
  const sluit = (tekst) => { st.open = null; wissel(); tekenLees(); zeg('ok', tekst); laadLijst(); laadLabels(); };
  async function doe(wat, knop) {
    const m = st.open;
    if (wat === 'terug') { st.open = null; wissel(); return tekenLees(); }
    if (wat === 'antwoord' || wat === 'allen' || wat === 'door') return schrijf(m, wat);
    knop.disabled = true;
    try {
      if (wat === 'ongelezen') { await gmail('wijzig', { id: m.id, erbij: ['UNREAD'] }); sluit('De mail staat terug op ongelezen.'); }
      else if (wat === 'archief') { await gmail('wijzig', { id: m.id, eraf: ['INBOX'] }); sluit('Gearchiveerd. De mail blijft in "Alle e-mail" en in haar mappen.'); }
      else if (wat === 'inbox') { await gmail('wijzig', { id: m.id, erbij: ['INBOX'] }); sluit('Teruggezet in Postvak IN.'); }
      else if (wat === 'weg') { await gmail('prullenbak', { id: m.id }); sluit('Naar de prullenbak. Gmail bewaart ze daar nog 30 dagen.'); }
      else if (wat === 'terugzetten') { await gmail('terugzetten', { id: m.id }); sluit('Teruggezet uit de prullenbak.'); }
    } catch (e) { knop.disabled = false; mis(e); }
  }

  // ---- koppeling met dossiers ----
  // Een gesprek hangt aan een dossier via de tabel dossier_mail. Alleen de verwijzing wordt bewaard.
  async function laadKoppeling(m) {
    try {
      const rijen = m.draad ? await q(sb.from('dossier_mail').select('id, dossier_id').eq('draad', m.draad)) : [];
      const ds = rijen.length ? await q(sb.from('dossier').select('id, nummer, titel, vme_id').in('id', rijen.map((r) => r.dossier_id))) : [];
      if (!st.vmes) st.vmes = await q(sb.from('vme').select('id, naam').is('gedeactiveerd_op', null).order('naam'));
      if (st.open?.id !== m.id) return;
      st.gekoppeld = rijen.map((r) => ({ ...r, dossier: ds.find((d) => d.id === r.dossier_id) })).filter((r) => r.dossier); tekenKoppeling();
    } catch (e) { if (st.open?.id === m.id) { st.gekoppeld = []; tekenKoppeling(); } }
  }
  function tekenKoppeling() {
    const vak = el('gmdossiervak'), m = st.open; if (!vak || !m || m.laden) return;
    if (!st.gekoppeld) { vak.innerHTML = '<p class="klein">Dossiers laden…</p>'; return; }
    const vmeNaam = (id) => st.vmes?.find((v) => v.id === id)?.naam ?? 'VME';
    vak.innerHTML = `<h4 style="margin-top:0">Dossier</h4>
      ${st.gekoppeld.map((k) => `<p class="gmkoppeling"><a href="#/vme/${esc(k.dossier.vme_id)}/dossiers" data-open="${esc(k.dossier.id)}"><b>#${Number(k.dossier.nummer)} ${esc(k.dossier.titel)}</b></a> <span class="klein">${esc(vmeNaam(k.dossier.vme_id))}</span> <button class="gmx" data-los="${esc(k.id)}" title="Ontkoppelen" aria-label="Dit gesprek van het dossier ontkoppelen">×</button></p>`).join('') || '<p class="klein" style="margin:0 0 8px">Dit gesprek hangt nog niet aan een dossier.</p>'}
      <form id="gmkoppel2" class="rij"><div style="flex:1 1 180px"><label>VME</label><select name="vme"><option value="">— kies een VME —</option>${(st.vmes ?? []).map((v) => `<option value="${v.id}"${v.id === st.koppelVme ? ' selected' : ''}>${esc(v.naam)}</option>`).join('')}</select></div>
        <div style="flex:2 1 220px"><label>Dossier</label><select name="dossier"><option value="nieuw">+ nieuw dossier van deze mail</option>${(st.koppelDossiers ?? []).map((d) => `<option value="${d.id}">#${Number(d.nummer)} ${esc(d.titel)}</option>`).join('')}</select></div>
        <div style="flex:0 0 auto"><button class="stil">Koppelen</button></div></form>`;
    vak.querySelectorAll('[data-open]').forEach((a) => { a.onclick = () => { S.dossierOpen = a.dataset.open; }; });
    vak.querySelectorAll('[data-los]').forEach((b) => { b.onclick = async () => { try { await q(sb.from('dossier_mail').delete().eq('id', b.dataset.los)); zeg('ok', 'Het gesprek is van het dossier ontkoppeld.'); if (st.dossiers) delete st.dossiers[m.draad]; tekenLijst(false); laadKoppeling(m); } catch (e) { zeg('fout', e.message); } }; });
    const f = el('gmkoppel2');
    f.vme.onchange = async () => { st.koppelVme = f.vme.value || null; st.koppelDossiers = [];
      if (st.koppelVme) { try { st.koppelDossiers = await q(sb.from('dossier').select('id, nummer, titel').eq('vme_id', st.koppelVme).neq('status', 'afgesloten').order('nummer', { ascending: false })); } catch (e) { zeg('fout', e.message); } }
      tekenKoppeling(); };
    f.onsubmit = async (ev) => {
      ev.preventDefault(); const vme = f.vme.value; let dossier = f.dossier.value;
      if (!vme) return zeg('fout', 'Kies eerst een VME.');
      ev.submitter.disabled = true;
      try {
        let nr, nieuw = false;
        if (dossier === 'nieuw') { const [d] = await q(sb.from('dossier').insert({ kantoor_id: S.kantoor.id, vme_id: vme, titel: (m.onderwerp || 'Mail').slice(0, 120), soort: 'andere',
            omschrijving: `Uit een mail van ${m.van} (${new Date(m.datum).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}).\n\n${(m.tekst || '').slice(0, 3000)}` }).select('id, nummer')); dossier = d.id; nr = d.nummer; nieuw = true; }
        else nr = st.koppelDossiers.find((d) => d.id === dossier)?.nummer;
        if (st.gekoppeld.some((k) => k.dossier_id === dossier)) throw new Error('Dit gesprek hangt al aan dat dossier.');
        await q(sb.from('dossier_mail').insert({ kantoor_id: S.kantoor.id, dossier_id: dossier, draad: m.draad, gmail_id: m.id, van: (m.van || '').slice(0, 200), onderwerp: (m.onderwerp || '').slice(0, 250), datum: m.datum }));
        if (!nieuw) await q(sb.from('dossier_notitie').insert({ kantoor_id: S.kantoor.id, dossier_id: dossier, tekst: `Mail gekoppeld: "${(m.onderwerp || '(geen onderwerp)').slice(0, 150)}" van ${gmNaam(m.van)} (${new Date(m.datum).toLocaleDateString('nl-BE')}).` }));
        S.dossierOpen = dossier; (st.dossiers ??= {})[m.draad] = { id: dossier, nummer: nr }; tekenLijst(false);
        el('gmmelding').innerHTML = `<div class="melding ok">${nieuw ? `Dossier #${Number(nr)} aangemaakt in ${esc(vmeNaam(vme))} en het gesprek eraan gekoppeld.` : `Gekoppeld aan dossier #${Number(nr)} in ${esc(vmeNaam(vme))}.`} <a href="#/vme/${esc(vme)}/dossiers">Dossier openen</a></div>`;
        await laadKoppeling(m);
      } catch (e) { zeg('fout', e.message); if (ev.submitter.isConnected) ev.submitter.disabled = false; }
    };
  }

  // ---- schrijven: nieuwe mail, antwoord of doorsturen ----
  const citeer = (t) => esc(t).replace(/\n/g, '<br>');
  async function schrijf(op, soort) {
    zeg();
    const eigen = status.email.toLowerCase(), uniek = (l) => [...new Set(l.map(gmAdres).filter((a) => a && a.toLowerCase() !== eigen))];
    const s = { antwoordOp: null, draadKop: null, conceptId: null, doorstuurVan: null, zonderInline: false, meeBijlagen: [], nietMee: [], aan: '', cc: '', bcc: '', onderwerp: '', html: '', bijlagen: [], vuil: false, stand: '' };
    if (op && soort === 'door') {
      s.onderwerp = /^\s*(fwd?|doorst)\s*:/i.test(op.onderwerp) ? op.onderwerp : `Fwd: ${op.onderwerp || ''}`.trim(); s.doorstuurVan = op.bijlagen.length ? op.id : null; s.meeBijlagen = op.bijlagen.map((b) => b.naam);
      s.citaat = `<br><div>---------- Doorgestuurd bericht ----------<br>Van: ${esc(op.van)}<br>Datum: ${esc(lang(op.datum))}<br>Onderwerp: ${esc(op.onderwerp)}<br>Aan: ${esc(op.aan)}<br><br>${citeer((op.tekst || '').slice(0, 30000))}</div>`;
    } else if (op) {
      const naar = gmAdres(op.antwoordAan || op.van);
      s.antwoordOp = op.id; s.aan = naar; s.cc = soort === 'allen' ? uniek([...(op.aan || '').split(','), ...(op.cc || '').split(',')]).filter((a) => a !== naar).join(', ') : '';
      s.onderwerp = /^\s*re\s*:/i.test(op.onderwerp) ? op.onderwerp : `Re: ${op.onderwerp || ''}`.trim();
      s.citaat = `<br><div>Op ${esc(lang(op.datum))} schreef ${esc(gmNaam(op.van))}:<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${citeer((op.tekst || '').slice(0, 30000))}</blockquote></div>`;
    } else s.citaat = '';
    // De handtekening die in Gmail ingesteld staat komt onder het bericht (Gmail voegt ze via deze weg niet zelf toe).
    if (st.handtekening === undefined) { try { const h = await gmail('handtekening'); st.handtekening = h.html ? gmZuiver(h.html) : esc(h.tekst || '').replace(/\n/g, '<br>'); } catch (e) { st.handtekening = ''; } }
    s.html = `<div><br></div>${st.handtekening ? `<br><div class="gmhand">${st.handtekening}</div>` : ''}${s.citaat}`; s.titel = s.antwoordOp ? 'Antwoord' : s.citaat ? 'Doorsturen' : 'Nieuwe mail';
    st.schrijf = s; st.toonSchrijf = true; wissel(); tekenLees();
  }
  function tekenSchrijf(vak) {
    const s = st.schrijf, nu = new Date(), pad = (n) => String(n).padStart(2, '0'), lokaal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const morgen = new Date(nu); morgen.setDate(nu.getDate() + 1); morgen.setHours(8, 0, 0, 0);
    const maandag = new Date(nu); maandag.setDate(nu.getDate() + ((8 - nu.getDay()) % 7 || 7)); maandag.setHours(8, 0, 0, 0);
    vak.innerHTML = `<form id="gmform"><div class="gmacties"><button type="button" class="stil gmterug" id="gmnaarlijst">← Lijst</button><h3 style="margin:0;flex:1">${esc(s.titel)}</h3><button type="button" class="stil" id="gmstop">Weggooien</button></div>
      <div class="gmveld"><label for="gmaan">Aan</label><input id="gmaan" name="aan" value="${esc(s.aan)}" required placeholder="naam@voorbeeld.be, meerdere met een komma"><button type="button" class="stil" id="gmmeerv"${s.cc || s.bcc ? ' hidden' : ''}>Cc/Bcc</button></div>
      <div id="gmccvak"${s.cc || s.bcc ? '' : ' hidden'}><div class="gmveld"><label for="gmcc">Cc</label><input id="gmcc" name="cc" value="${esc(s.cc)}"></div><div class="gmveld"><label for="gmbcc">Bcc</label><input id="gmbcc" name="bcc" value="${esc(s.bcc)}"></div></div>
      <div class="gmveld"><label for="gmond">Onderwerp</label><input id="gmond" name="onderwerp" value="${esc(s.onderwerp)}" required maxlength="250"></div>
      <div class="gmbalk" role="toolbar" aria-label="Opmaak"><button type="button" class="stil" data-opmaak="bold" title="Vet"><b>B</b></button><button type="button" class="stil" data-opmaak="italic" title="Cursief"><i>I</i></button><button type="button" class="stil" data-opmaak="underline" title="Onderstreept"><u>U</u></button>
        <button type="button" class="stil" data-opmaak="insertUnorderedList" title="Lijst met bolletjes">• Lijst</button><button type="button" class="stil" data-opmaak="insertOrderedList" title="Genummerde lijst">1. Lijst</button><button type="button" class="stil" data-opmaak="link" title="Link maken van de geselecteerde tekst">Link</button><button type="button" class="stil" data-opmaak="removeFormat" title="Opmaak wissen">Wis opmaak</button>
        <span class="gmrek"></span><button type="button" class="stil" id="gmkiesbeeld">Afbeelding</button><button type="button" class="stil" id="gmkiesbij">📎 Bijlage</button>
        <input type="file" id="gmbeeldin" accept="image/*" multiple hidden><input type="file" id="gmbijin" multiple hidden></div>
      <div id="gmedit" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Bericht"></div>
      <p class="klein gmtip">Sleep afbeeldingen of bestanden hierheen, of plak een schermafdruk met Ctrl+V. Afbeeldingen komen in de tekst, andere bestanden worden een bijlage.</p>
      <div id="gmbijlijst" class="gmbijlagen"></div>
      <div class="gmverzend"><button id="gmstuur">Versturen</button><button type="button" class="stil" id="gmlater">Later versturen</button><span class="klein">Vanuit ${esc(status.email)}</span><span class="klein" id="gmconceptstand" aria-live="polite">${esc(s.stand ?? '')}</span></div>
      <div id="gmlatervak" hidden><div class="rij" style="align-items:flex-end"><div style="flex:0 0 auto"><button type="button" class="stil" data-moment="${lokaal(morgen)}">Morgen 08:00</button></div><div style="flex:0 0 auto"><button type="button" class="stil" data-moment="${lokaal(maandag)}">Maandag 08:00</button></div>
        <div style="flex:1 1 200px"><label for="gmmoment">Of kies zelf</label><input type="datetime-local" id="gmmoment" min="${lokaal(new Date(nu.getTime() + 120000))}"></div><div style="flex:0 0 auto"><button type="button" id="gmplan">Inplannen</button></div></div>
        <p class="klein" style="margin:6px 0 0">De mail blijft tot dan bij "Uitgesteld" staan en kan je daar nog tegenhouden.</p></div></form>`;
    const f = el('gmform'), ed = el('gmedit');
    ed.innerHTML = s.html;   // eigen tekst van de opsteller, of de gezuiverde handtekening en het citaat (dat laatste is gewone tekst)
    // "bewaar" houdt bij wat er staat; "gewijzigd" zet daarbovenop de klok om het concept in Gmail te bewaren.
    const bewaar = () => { s.aan = f.aan.value; s.cc = f.cc.value; s.bcc = f.bcc.value; s.onderwerp = f.onderwerp.value; s.html = ed.innerHTML; };
    const gewijzigd = () => { bewaar(); s.vuil = true; clearTimeout(bewaarKlok); bewaarKlok = setTimeout(bewaarConcept, 4000); };
    f.oninput = gewijzigd; ed.oninput = gewijzigd;
    const tekenBij = () => { el('gmbijlijst').innerHTML = [...s.bijlagen.map((b, i) => `<span class="pil">📎 ${esc(b.name)} <span class="klein">${gmGrootte(b.size)}</span> <button type="button" class="gmx" data-bijweg="${i}" aria-label="${esc(b.name)} weghalen">×</button></span>`),
        ...(s.doorstuurVan ? s.meeBijlagen.map((n, i) => ({ n, i })).filter((x) => !s.nietMee.includes(x.n)).map((x) => `<span class="pil">📎 ${esc(x.n)} <button type="button" class="gmx" data-nietmee="${x.i}" aria-label="${esc(x.n)} niet meesturen">×</button></span>`) : [])].join(' ');
      el('gmbijlijst').querySelectorAll('[data-bijweg]').forEach((b) => { b.onclick = () => { s.bijlagen.splice(Number(b.dataset.bijweg), 1); tekenBij(); gewijzigd(); }; });
      el('gmbijlijst').querySelectorAll('[data-nietmee]').forEach((b) => { b.onclick = () => { s.nietMee.push(s.meeBijlagen[Number(b.dataset.nietmee)]); tekenBij(); gewijzigd(); }; }); };
    s.tekenBij = () => { if (st.schrijf === s && el('gmbijlijst')) tekenBij(); };
    tekenBij();
    const gewicht = () => s.bijlagen.reduce((t, b) => t + b.size, 0) + [...ed.querySelectorAll('img[src^="data:"]')].reduce((t, i) => t + i.src.length * 0.75, 0);
    // Bestanden toevoegen: afbeeldingen in de tekst (tenzij je ze uitdrukkelijk als bijlage kiest), de rest als bijlage.
    async function voegToe(bestanden, alsBijlage) {
      for (const b of bestanden) {
        try {
          if (!alsBijlage && b.type.startsWith('image/')) { const url = await gmBeeld(b); ed.focus(); if (!ed.contains(getSelection().anchorNode)) { const r = document.createRange(); r.selectNodeContents(ed.firstElementChild ?? ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
            document.execCommand('insertHTML', false, `<img src="${url}" alt="" style="max-width:100%">`); }
          else s.bijlagen.push(b);
          if (gewicht() > GM_MAX) { if (!alsBijlage && b.type.startsWith('image/')) ed.querySelector('img:last-of-type')?.remove(); else s.bijlagen.pop(); throw new Error(`${b.name || 'Het bestand'} past er niet meer bij: afbeeldingen en bijlagen samen mogen hoogstens ${gmGrootte(GM_MAX)} zijn.`); }
        } catch (e) { zeg('fout', e.message); }
      }
      tekenBij(); gewijzigd();
    }
    ed.onpaste = (ev) => { const bestanden = [...(ev.clipboardData?.files ?? [])];
      if (bestanden.length) { ev.preventDefault(); return voegToe(bestanden, false); }
      const t = ev.clipboardData?.getData('text/plain'); if (t != null) { ev.preventDefault(); document.execCommand('insertText', false, t); } };   // geplakte tekst zonder vreemde opmaak
    f.ondragover = (ev) => { if ([...(ev.dataTransfer?.types ?? [])].includes('Files')) { ev.preventDefault(); f.classList.add('sleep'); } };
    f.ondragleave = (ev) => { if (!f.contains(ev.relatedTarget)) f.classList.remove('sleep'); };
    f.ondrop = (ev) => { const bestanden = [...(ev.dataTransfer?.files ?? [])]; if (!bestanden.length) return; ev.preventDefault(); f.classList.remove('sleep'); voegToe(bestanden, false); };
    el('gmkiesbeeld').onclick = () => el('gmbeeldin').click(); el('gmkiesbij').onclick = () => el('gmbijin').click();
    el('gmbeeldin').onchange = (ev) => { voegToe([...ev.target.files], false); ev.target.value = ''; };
    el('gmbijin').onchange = (ev) => { voegToe([...ev.target.files], true); ev.target.value = ''; };
    f.querySelectorAll('[data-opmaak]').forEach((b) => { b.onmousedown = (ev) => ev.preventDefault(); b.onclick = () => { ed.focus(); const c = b.dataset.opmaak;
      if (c === 'link') { const sel = String(getSelection()); const u = /^https?:\/\/\S+$/i.test(sel.trim()) ? sel.trim() : null; if (!u) return zeg('fout', 'Selecteer eerst een webadres (https://…) in de tekst; dat wordt dan een link.'); document.execCommand('createLink', false, u); }
      else document.execCommand(c, false); gewijzigd(); }; });
    el('gmmeerv').onclick = () => { el('gmccvak').hidden = false; el('gmmeerv').hidden = true; f.cc.focus(); };
    el('gmnaarlijst').onclick = () => { bewaar(); if (s.vuil) bewaarConcept(); st.toonSchrijf = false; wissel(); tekenLees(); };
    { let zeker = false; el('gmstop').onclick = () => { if (!zeker && (s.conceptId || (ed.innerText.trim().length > 0 && s.html !== ed.dataset.begin))) { zeker = true; el('gmstop').textContent = 'Zeker? Klik nog eens'; return; } clearTimeout(bewaarKlok); const weg = s.conceptId, lopend = bewaarBezig; st.schrijf = null; st.toonSchrijf = false; wissel(); tekenLees();
        // Ook het concept in Gmail gaat weg (na een bewaarbeurt die nog liep).
        Promise.resolve(lopend).then(() => { const cid = s.conceptId ?? weg; if (cid) return gmail('conceptweg', { conceptId: cid }); }).then(() => { if (st.label === 'DRAFT') laadLijst(); laadLabels(); }).catch(() => { /* het concept blijft dan in Gmail staan */ }); }; ed.dataset.begin = ed.innerHTML; }
    el('gmlater').onclick = () => { el('gmlatervak').hidden = !el('gmlatervak').hidden; };
    f.querySelectorAll('[data-moment]').forEach((b) => { b.onclick = () => { el('gmmoment').value = b.dataset.moment; }; });
    async function stuur(moment) {
      zeg(); bewaar();
      if (!f.reportValidity()) return;
      const knoppen = [el('gmstuur'), el('gmplan')]; knoppen.forEach((k) => { k.disabled = true; });
      try {
        clearTimeout(bewaarKlok); s.vuil = false; if (bewaarBezig) await bewaarBezig;   // eerst de lopende bewaarbeurt: dan kennen we het concept dat mee weg moet
        const uit = await gmail('verstuur', { ...(await pakIn(s, ed, f)), verstuurOp: moment ? new Date(moment).toISOString() : null });
        s.verstuurd = true;
        st.schrijf = null; st.toonSchrijf = false; wissel(); tekenLees();
        zeg('ok', uit.gepland ? `Ingepland voor ${lang(uit.gepland)}, naar ${uit.aan.join(', ')}. Je vindt de mail bij "Uitgesteld".` : `Verstuurd naar ${uit.aan.join(', ')}.`);
        if (uit.gepland) laadGepland(); else if (st.label === 'SENT' || st.label === 'DRAFT') laadLijst(); laadLabels();
      } catch (e) { knoppen.forEach((k) => { k.disabled = false; }); mis(e); }
    }
    f.onsubmit = (ev) => { ev.preventDefault(); stuur(null); };
    el('gmplan').onclick = () => { const m = el('gmmoment').value; if (!m) return zeg('fout', 'Kies eerst wanneer de mail moet vertrekken.'); if (new Date(m).getTime() < Date.now() + 60000) return zeg('fout', 'Kies een moment dat minstens een minuut in de toekomst ligt.'); stuur(m); };
    if (s.antwoordOp) { ed.focus(); const r = document.createRange(); r.setStart(ed.firstChild ?? ed, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); } else f.aan.focus();
  }

  el('gmzoek').onsubmit = (ev) => { ev.preventDefault(); st.zoek = ev.target.zoek.value.trim(); st.open = null; st.toonSchrijf = false; wissel(); tekenLees(); laadLijst(); };
  el('gmnieuw').onclick = () => { if (st.schrijf) { st.toonSchrijf = true; wissel(); return tekenLees(); } schrijf(null); };
  el('gmconcept').onclick = () => { st.toonSchrijf = true; wissel(); tekenLees(); };
  el('gmververs').onclick = () => { zeg(); laadLabels(); laadLijst(); laadGepland(); };
  if (el('gmlos')) { let zeker = false; el('gmlos').onclick = async () => {
    if (!zeker) { zeker = true; el('gmlos').textContent = 'Zeker? Klik nog eens om te ontkoppelen'; return; }
    try { await gmail('ontkoppel'); S.gmail = null; S.bericht = { soort: 'ok', tekst: 'De mailbox is ontkoppeld. Het platform kan niet meer aan de mails.' }; UIT.routes.mailbox(); } catch (e) { mis(e); } }; }
  wissel(); tekenLabels(); tekenLees();
  if (st.mails.length) tekenLijst(false);
  laadLabels(); laadLijst(); if (st.label !== 'UITGESTELD') laadGepland();
  if (st.straks) { const id = st.straks; st.straks = null; openMail(id); }
}
