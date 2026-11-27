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
const mailboxOud = UIT.routes.mailbox;
UIT.routes.mailbox = async () => {
  const uitslag = new URLSearchParams(location.search).get('gmail');
  // De uitslag van het koppelen blijft enkele seconden geldig: bij het laden tekent de app het scherm soms twee keer na elkaar.
  if (uitslag) { history.replaceState(null, '', location.pathname + location.hash); gmUitslag = { tot: Date.now() + 6000, bericht: uitslag === 'ok' ? { soort: 'ok', tekst: 'De Gmail-mailbox is gekoppeld.' } : { soort: 'fout', tekst: GM_UITSLAG[uitslag] ?? GM_UITSLAG.fout } }; }
  if (location.hash.split('/')[2] === 'doorgestuurd') return mailboxOud();
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
  const st = (S.gmail ??= { label: 'INBOX', zoek: '', labels: [], mails: [], vervolg: null, open: null, schrijf: null, beelden: false, vmes: null, beurt: 0 });
  if (gmUitslag && Date.now() < gmUitslag.tot) S.bericht = gmUitslag.bericht;   // vlak voor het tekenen, zodat een tweede tekenbeurt de melding niet wist
  toon(`${terug}<div id="gm" class="${st.open || st.schrijf ? 'lezen' : ''}">
    <div class="gmkop"><div><h2>Mailbox</h2><span class="klein">${esc(status.email)}</span></div>
      <form id="gmzoek"><input name="zoek" type="search" placeholder="Zoeken in de mailbox" aria-label="Zoeken in de mailbox" value="${esc(st.zoek)}"><button class="stil">Zoek</button></form>
      <button id="gmnieuw">Nieuwe mail</button></div>
    <div id="gmmelding"></div>
    <div class="gmvak"><nav id="gmlabels" aria-label="Mappen"></nav><div id="gmlijst" aria-label="Mails"></div><div id="gmlees"></div></div>
    <p class="klein" style="margin-top:10px">Bijlagen en mails blijven in Gmail; het platform bewaart er geen kopie van. <a href="#/mailbox/doorgestuurd">Doorgestuurde mails (oude mailbox)</a>${status.beheerder ? ' · <button class="stil" id="gmlos">Mailbox ontkoppelen</button>' : ''}</p></div>`);
  const el = (id) => document.getElementById(id), gm = el('gm');
  if (!gm) return;
  const zeg = (soort, tekst) => { const vak = el('gmmelding'); if (vak) vak.innerHTML = tekst ? `<div class="melding ${soort}">${esc(tekst)}</div>` : ''; };
  // Een fout tonen. Is de koppeling weg (ingetrokken bij Google), dan terug naar het koppelscherm.
  const mis = (e) => { if (e.koppelen) { S.gmail = null; fout(e); return UIT.routes.mailbox(); } zeg('fout', e.message); };
  const wissel = () => gm.classList.toggle('lezen', !!(st.open || st.schrijf));

  function tekenLabels() {
    el('gmlabels').innerHTML = st.labels.map((l) => `<button class="gml${l.id === st.label ? ' aan' : ''}" data-label="${esc(l.id)}" style="padding-left:${10 + l.diepte * 14}px" title="${esc(l.pad ?? l.naam)}"><span>${esc(l.naam)}</span>${l.ongelezen ? `<b>${Number(l.ongelezen)}</b>` : ''}</button>`).join('') || '<p class="klein" style="padding:10px">Mappen laden…</p>';
    el('gmlabels').querySelectorAll('[data-label]').forEach((b) => { b.onclick = () => { st.label = b.dataset.label; st.zoek = ''; el('gmzoek').zoek.value = ''; st.open = null; st.schrijf = null; wissel(); tekenLabels(); tekenLees(); laadLijst(); }; });
  }
  function tekenLijst(bezig) {
    const verzonden = st.label === 'SENT' || st.label === 'DRAFT';
    el('gmlijst').innerHTML = (st.mails.map((m) => `<button class="gmrij${m.ongelezen ? ' nieuw' : ''}${st.open?.id === m.id ? ' aan' : ''}" data-mail="${esc(m.id)}">
        <span class="gmvan">${esc(verzonden ? `Aan: ${gmNaam((m.aan || '').split(',')[0])}` : gmNaam(m.van))}</span><span class="gmtijd">${esc(gmTijd(m.datum))}</span>
        <span class="gmond">${esc(m.onderwerp || '(geen onderwerp)')}</span><span class="gmfrag">${esc(m.fragment)}</span></button>`).join('')
      || (bezig ? '' : `<p class="leeg" style="padding:14px">${st.zoek ? 'Niets gevonden.' : 'Deze map is leeg.'}</p>`))
      + (bezig ? '<p class="klein" style="padding:14px">Laden…</p>' : st.vervolg ? '<p style="padding:10px"><button class="stil" id="gmmeer">Meer laden</button></p>' : '');
    el('gmlijst').querySelectorAll('[data-mail]').forEach((b) => { b.onclick = () => openMail(b.dataset.mail); });
    if (el('gmmeer')) el('gmmeer').onclick = () => laadLijst(true);
  }
  async function laadLabels() { try { st.labels = (await gmail('labels')).labels; if (el('gmlabels')) tekenLabels(); } catch (e) { mis(e); } }
  async function laadLijst(meer = false) {
    const beurt = ++st.beurt; if (!meer) { st.mails = []; st.vervolg = null; }
    tekenLijst(true);
    try {
      const uit = await gmail('lijst', { label: st.zoek ? 'ALLE' : st.label, zoek: st.zoek, vervolg: meer ? st.vervolg : null });
      if (beurt !== st.beurt || !el('gmlijst')) return;   // intussen is een andere map gekozen
      st.mails = meer ? [...st.mails, ...uit.mails] : uit.mails; st.vervolg = uit.vervolg; tekenLijst(false);
    } catch (e) { if (beurt === st.beurt && el('gmlijst')) { tekenLijst(false); mis(e); } }
  }
  async function openMail(id) {
    zeg(); st.schrijf = null; st.beelden = false; st.open = { id, laden: true }; wissel(); tekenLees();
    el('gmlijst').querySelectorAll('.gmrij').forEach((b) => b.classList.toggle('aan', b.dataset.mail === id));
    try {
      const { mail } = await gmail('lees', { id });
      if (st.open?.id !== id) return;
      st.open = mail; const rij = st.mails.find((m) => m.id === id);
      if (rij?.ongelezen) { rij.ongelezen = false; el('gmlijst').querySelector(`[data-mail="${id}"]`)?.classList.remove('nieuw'); const l = st.labels.find((x) => x.id === 'INBOX'); if (l && mail.labels.includes('INBOX') && l.ongelezen > 0) { l.ongelezen--; tekenLabels(); } }
      tekenLees();
    } catch (e) { st.open = null; wissel(); tekenLees(); mis(e); }
  }

  function tekenLees() {
    const vak = el('gmlees'); if (!vak) return;
    if (st.schrijf) return tekenSchrijf(vak);
    const m = st.open;
    if (!m) { vak.innerHTML = '<p class="leeg" style="padding:24px">Kies een mail om te lezen.</p>'; return; }
    if (m.laden) { vak.innerHTML = '<p class="klein" style="padding:24px">Mail openen…</p>'; return; }
    const inbox = m.labels.includes('INBOX'), weg = m.labels.includes('TRASH'), eigen = st.labels.filter((l) => l.soort === 'eigen');
    const andere = [...(m.aan || '').split(','), ...(m.cc || '').split(',')].map(gmAdres).filter((a) => a && a.toLowerCase() !== status.email.toLowerCase());
    vak.innerHTML = `<div class="gmacties"><button class="stil gmterug" data-doe="terug">← Lijst</button><button data-doe="antwoord">Beantwoorden</button>${andere.length ? '<button class="stil" data-doe="allen">Allen beantwoorden</button>' : ''}
        <button class="stil" data-doe="ongelezen">Ongelezen</button>${weg ? '<button class="stil" data-doe="terugzetten">Terugzetten</button>' : `${inbox ? '<button class="stil" data-doe="archief">Archiveren</button>' : '<button class="stil" data-doe="inbox">Naar Postvak IN</button>'}<button class="stil" data-doe="weg">Prullenbak</button>`}</div>
      <h3 style="margin-top:12px">${esc(m.onderwerp || '(geen onderwerp)')}</h3>
      <p class="klein" style="margin:0"><b style="color:var(--t)">${esc(m.van)}</b><br>Aan: ${esc(m.aan)}${m.cc ? `<br>Cc: ${esc(m.cc)}` : ''}<br>${m.datum ? esc(new Date(m.datum).toLocaleString('nl-BE', { dateStyle: 'full', timeStyle: 'short' })) : ''}</p>
      <p class="gmmappen">${eigen.filter((l) => m.labels.includes(l.id)).map((l) => `<span class="pil">${esc(l.pad ?? l.naam)} <button class="gmx" data-eraf="${esc(l.id)}" title="Uit deze map halen" aria-label="Uit de map ${esc(l.naam)} halen">×</button></span>`).join(' ')}
        ${eigen.length ? `<select id="gmmap" aria-label="In een map zetten" style="width:auto;padding:4px 8px;font-size:13px"><option value="">+ map</option>${eigen.filter((l) => !m.labels.includes(l.id)).map((l) => `<option value="${esc(l.id)}">${esc(l.pad ?? l.naam)}</option>`).join('')}</select>` : ''}</p>
      ${m.bijlagen.length ? `<p class="gmbijlagen">${m.bijlagen.map((b, i) => `<button class="stil" data-bijlage="${i}">📎 ${esc(b.naam)} <span class="klein">${gmGrootte(b.grootte)}</span></button>`).join(' ')}</p>` : ''}
      ${m.html ? `<p class="klein" style="margin:6px 0"><label style="display:inline"><input type="checkbox" id="gmbeelden"${st.beelden ? ' checked' : ''}> Afbeeldingen van buitenaf tonen</label></p><iframe id="gmkader" title="Inhoud van de mail" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`
        : `<pre class="gmtekst">${esc(m.tekst || '(geen tekst)')}</pre>`}
      <form id="gmdossier" class="rij" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--l)"><div style="flex:2 1 200px"><label>Dossier maken in</label><select name="vme"><option value="">— kies een VME —</option>${(st.vmes ?? []).map((v) => `<option value="${v.id}">${esc(v.naam)}</option>`).join('')}</select></div><div style="flex:0 0 auto"><button class="stil">Dossier maken</button></div></form>`;
    // De html van een mail komt van buiten. Ze staat daarom in een afgesloten kader: scripts draaien
    // er niet, formulieren werken niet, en afbeeldingen van buitenaf (vaak volgpixels) blijven weg
    // tot je ze zelf aanzet.
    const kader = el('gmkader');
    if (kader) kader.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${st.beelden ? ' https:' : ''}"><base target="_blank"><style>body{font:14px/1.5 system-ui,sans-serif;margin:10px;overflow-wrap:anywhere;color:#2B1622}img{max-width:100%;height:auto}table{max-width:100%}</style>${m.html}`;
    if (el('gmbeelden')) el('gmbeelden').onchange = (ev) => { st.beelden = ev.target.checked; tekenLees(); };
    vak.querySelectorAll('[data-doe]').forEach((b) => { b.onclick = () => doe(b.dataset.doe, b); });
    vak.querySelectorAll('[data-eraf]').forEach((b) => { b.onclick = () => zetMap([], [b.dataset.eraf]); });
    if (el('gmmap')) el('gmmap').onchange = (ev) => ev.target.value && zetMap([ev.target.value], []);
    vak.querySelectorAll('[data-bijlage]').forEach((b) => { b.onclick = async () => {
      const bij = m.bijlagen[Number(b.dataset.bijlage)]; b.disabled = true;
      try { const { base64 } = await gmail('bijlage', { id: m.id, bijlage: bij.id }), bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: bij.soort })); a.download = bij.naam; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      } catch (e) { mis(e); }
      b.disabled = false; }; });
    el('gmdossier').onsubmit = maakDossier;
    if (!st.vmes) q(sb.from('vme').select('id, naam').is('gedeactiveerd_op', null).order('naam')).then((v) => { st.vmes = v; const s = el('gmdossier')?.vme; if (s && s.options.length === 1) s.insertAdjacentHTML('beforeend', v.map((x) => `<option value="${x.id}">${esc(x.naam)}</option>`).join('')); }).catch(() => { /* de mail blijft leesbaar */ });
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
    if (wat === 'antwoord' || wat === 'allen') return schrijf(m, wat === 'allen');
    knop.disabled = true;
    try {
      if (wat === 'ongelezen') { await gmail('wijzig', { id: m.id, erbij: ['UNREAD'] }); sluit('De mail staat terug op ongelezen.'); }
      else if (wat === 'archief') { await gmail('wijzig', { id: m.id, eraf: ['INBOX'] }); sluit('Gearchiveerd. De mail blijft in "Alle e-mail" en in haar mappen.'); }
      else if (wat === 'inbox') { await gmail('wijzig', { id: m.id, erbij: ['INBOX'] }); sluit('Teruggezet in Postvak IN.'); }
      else if (wat === 'weg') { await gmail('prullenbak', { id: m.id }); sluit('Naar de prullenbak. Gmail bewaart ze daar nog 30 dagen.'); }
      else if (wat === 'terugzetten') { await gmail('terugzetten', { id: m.id }); sluit('Teruggezet uit de prullenbak.'); }
    } catch (e) { knop.disabled = false; mis(e); }
  }
  async function maakDossier(ev) {
    ev.preventDefault();
    const m = st.open, vme = ev.target.vme.value, naam = ev.target.vme.selectedOptions[0]?.textContent;
    if (!vme) return zeg('fout', 'Kies eerst een VME.');
    ev.submitter.disabled = true;
    try {
      const [nieuw] = await q(sb.from('dossier').insert({ kantoor_id: S.kantoor.id, vme_id: vme, titel: (m.onderwerp || 'Mail').slice(0, 120), soort: 'andere',
        omschrijving: `Uit een mail van ${m.van} (${new Date(m.datum).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}).\n\n${(m.tekst || '').slice(0, 3000)}` }).select('id, nummer'));
      S.dossierOpen = nieuw.id;
      el('gmmelding').innerHTML = `<div class="melding ok">Dossier #${Number(nieuw.nummer)} aangemaakt in ${esc(naam)}. <a href="#/vme/${esc(vme)}/dossiers">Dossier openen</a></div>`;
    } catch (e) { zeg('fout', e.message); }
    ev.submitter.disabled = false;
  }

  // ---- schrijven: een nieuwe mail of een antwoord ----
  async function schrijf(op, allen) {
    zeg();
    const eigen = status.email.toLowerCase(), uniek = (l) => [...new Set(l.map(gmAdres).filter((a) => a && a.toLowerCase() !== eigen))];
    st.schrijf = op ? { antwoordOp: op.id, aan: gmAdres(op.antwoordAan || op.van), cc: allen ? uniek([...(op.aan || '').split(','), ...(op.cc || '').split(',')]).filter((a) => a !== gmAdres(op.antwoordAan || op.van)).join(', ') : '',
        onderwerp: /^\s*re\s*:/i.test(op.onderwerp) ? op.onderwerp : `Re: ${op.onderwerp || ''}`.trim(),
        citaat: `\n\nOp ${new Date(op.datum).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })} schreef ${gmNaam(op.van)}:\n${(op.tekst || '').slice(0, 20000).split('\n').map((r) => `> ${r}`).join('\n')}` }
      : { antwoordOp: null, aan: '', cc: '', onderwerp: '', citaat: '' };
    wissel(); tekenLees();
    // De handtekening die in Gmail ingesteld staat, onder het bericht (Gmail voegt ze via deze weg niet zelf toe).
    if (st.handtekening === undefined) { try { st.handtekening = (await gmail('handtekening')).tekst || ''; } catch (e) { st.handtekening = ''; } }
    const t = el('gmform')?.tekst;
    if (t && st.schrijf && !t.dataset.klaar) {
      t.dataset.klaar = '1'; const c = st.schrijf.citaat, getypt = t.value.endsWith(c) ? t.value.slice(0, t.value.length - c.length) : null;   // wat je intussen al typte blijft staan
      if (getypt !== null && st.handtekening) { t.value = `${getypt}\n\n${st.handtekening}${c}`; t.setSelectionRange(getypt.length, getypt.length); }
    }
  }
  function tekenSchrijf(vak) {
    const s = st.schrijf;
    vak.innerHTML = `<form id="gmform"><h3 style="margin-top:0">${s.antwoordOp ? 'Antwoord' : 'Nieuwe mail'}</h3>
      <p><label>Aan</label><input name="aan" value="${esc(s.aan)}" required placeholder="naam@voorbeeld.be, meerdere met een komma"></p>
      <p><label>Cc</label><input name="cc" value="${esc(s.cc)}"></p>
      <p><label>Onderwerp</label><input name="onderwerp" value="${esc(s.onderwerp)}" required maxlength="250"></p>
      <p><label>Bericht</label><textarea name="tekst" rows="14" required></textarea></p>
      <p class="klein">Wordt verstuurd vanuit ${esc(status.email)} en komt in Gmail bij Verzonden. Bijlagen toevoegen kan hier nog niet.</p>
      <button>Versturen</button> <button type="button" class="stil" id="gmstop">Annuleren</button></form>`;
    el('gmform').tekst.value = s.citaat;   // via de eigenschap, niet via html: zo blijven de lege regels bovenaan staan
    el('gmstop').onclick = () => { st.schrijf = null; wissel(); tekenLees(); };
    el('gmform').onsubmit = async (ev) => {
      ev.preventDefault(); const f = ev.target, knop = ev.submitter; knop.disabled = true;
      try {
        const uit = await gmail('verstuur', { aan: f.aan.value, cc: f.cc.value, onderwerp: f.onderwerp.value, tekst: f.tekst.value, antwoordOp: s.antwoordOp });
        st.schrijf = null; wissel(); tekenLees(); zeg('ok', `Verstuurd naar ${uit.aan.join(', ')}.`); if (st.label === 'SENT') laadLijst();
      } catch (e) { knop.disabled = false; mis(e); }
    };
    el('gmform').querySelector(s.antwoordOp ? '[name=tekst]' : '[name=aan]').focus();
  }

  el('gmzoek').onsubmit = (ev) => { ev.preventDefault(); st.zoek = ev.target.zoek.value.trim(); st.open = null; st.schrijf = null; wissel(); tekenLees(); laadLijst(); };
  el('gmnieuw').onclick = () => schrijf(null);
  if (el('gmlos')) { let zeker = false; el('gmlos').onclick = async () => {
    if (!zeker) { zeker = true; el('gmlos').textContent = 'Zeker? Klik nog eens om te ontkoppelen'; return; }
    try { await gmail('ontkoppel'); S.gmail = null; S.bericht = { soort: 'ok', tekst: 'De mailbox is ontkoppeld. Het platform kan niet meer aan de mails.' }; UIT.routes.mailbox(); } catch (e) { mis(e); } }; }
  tekenLabels(); tekenLees();
  if (st.mails.length) tekenLijst(false);
  laadLabels(); laadLijst();
}
