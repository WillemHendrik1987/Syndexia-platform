// =============================================================================
// Tweestapsverificatie en logboek.
//
// Tweestap: na het wachtwoord vraagt de app een code van 6 cijfers uit een authenticator-app
// (Google Authenticator, Microsoft Authenticator, 1Password…). Het aanmelden zelf doet de
// aanmelddienst van Supabase; de databank weigert daarna alles zolang de code er niet bij is
// (migratie 0028). Dit bestand toont alleen de schermen: de code vragen, tweestap instellen,
// en op de Team-pagina het blok Beveiliging.
//
// Logboek: de databank schrijft zelf op wie wat toevoegt, wijzigt of verwijdert. De pagina
// #/logboek toont dat aan een beheerder, in gewone zinnen.
// =============================================================================

// ---- na het wachtwoord: de code ----------------------------------------------------------
function schermTweestapCode(factor) {
  toon(`<div class="kaart twee"><h2>Tweestapsverificatie</h2>
    <p>Open je authenticator-app en vul de code van 6 cijfers in.</p>
    <form id="f2c"><input name="code" class="code2" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-label="Code van 6 cijfers" placeholder="000000">
      <p><button>Aanmelden</button></p></form>
    <p class="klein">Telefoon kwijt of vervangen? Een beheerder van je kantoor kan je tweestapsverificatie resetten op de pagina Team. Daarna stel je ze opnieuw in.</p></div>`);
  const f = document.getElementById('f2c'); f.code.focus();
  f.onsubmit = async (ev) => {
    ev.preventDefault(); f.querySelector('button').disabled = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor, code: f.code.value.trim() });
    if (error) { S.bericht = { soort: 'fout', tekst: 'Die code klopt niet of is verlopen. Vul de code in die je app nu toont.' }; return schermTweestapCode(factor); }
    start();
  };
}

// ---- tweestap instellen --------------------------------------------------------------------
// verplicht = waar: het kantoor eist het en er is geen weg terug behalve afmelden.
// Het opstarten kan dit scherm twee keer kort na elkaar vragen; één aanvraag tegelijk, anders ontstaan
// er twee halve instellingen naast elkaar.
let twBezig = null;
function schermTweestapInstellen(verplicht) { return (twBezig ??= tweestapInstellen(verplicht).finally(() => { twBezig = null; })); }
async function tweestapInstellen(verplicht) {
  toon('<p class="leeg">Even geduld…</p>');
  try {
    // Een eerdere poging die niet afgewerkt werd, ruimen we eerst op.
    const { data: lijst } = await sb.auth.mfa.listFactors();
    for (const f of (lijst?.all ?? []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
    if (error) throw error;
    toon(`<div class="kaart twee"><h2>Tweestapsverificatie instellen</h2>
      ${verplicht ? '<p><span class="pil warn">verplicht</span> Je kantoor vraagt tweestapsverificatie voor elke gebruiker. Stel ze in om verder te gaan.</p>' : '<p>Naast je wachtwoord vraagt het platform dan bij elke aanmelding een code uit een app op je telefoon. Wie je wachtwoord kent, komt zonder je telefoon niet binnen.</p>'}
      <ol class="twstappen"><li>Installeer een authenticator-app op je telefoon als je er nog geen hebt (bv. Google Authenticator of Microsoft Authenticator).</li>
        <li>Scan deze code met de app:<br><img class="twqr" src="${esc(data.totp.qr_code)}" alt="QR-code voor je authenticator-app" width="200" height="200">
          <details><summary>Scannen lukt niet</summary><p class="klein">Kies in de app "handmatig invoeren" en typ deze sleutel over:</p><p><code class="twsleutel">${esc(data.totp.secret)}</code></p></details></li>
        <li>Vul de code van 6 cijfers in die de app nu toont:
          <form id="f2i"><input name="code" class="code2" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-label="Code van 6 cijfers" placeholder="000000">
          <p><button>Bevestigen en aanzetten</button> ${verplicht ? '' : '<button type="button" class="stil" id="twweg">Annuleren</button>'}</p></form></li></ol></div>`);
    const f = document.getElementById('f2i');
    f.onsubmit = async (ev) => {
      ev.preventDefault(); f.querySelector('button').disabled = true;
      const { error: mis } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: f.code.value.trim() });
      if (mis) { document.getElementById('twfout')?.remove(); f.insertAdjacentHTML('afterbegin', '<div class="melding fout" id="twfout">Die code klopt niet of is verlopen. Vul de code in die je app nu toont.</div>'); f.querySelector('button').disabled = false; f.code.select(); return; }
      S.bericht = { soort: 'ok', tekst: 'Tweestapsverificatie staat aan. Vanaf nu vraagt het platform bij elke aanmelding een code.' };
      if (location.hash === '#/tweestap') location.hash = '#/team'; else start();
    };
    const weg = document.getElementById('twweg'); if (weg) weg.onclick = async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); location.hash = '#/team'; };
  } catch (e) { fout(e); toon(`${typeof terug === 'string' ? terug : ''}<p class="leeg">Tweestapsverificatie kon niet gestart worden. Probeer het opnieuw.</p>`); }
}
UIT.routes.tweestap = () => schermTweestapInstellen(false);

// ---- op de Team-pagina: het blok Beveiliging ------------------------------------------------
{
  const team = UIT.routes.team;
  UIT.routes.team = async () => {
    await team();
    if (!document.querySelector('#app h2') || location.hash !== '#/team') return;
    let t, eigen;
    try { [t, eigen] = await Promise.all([q(sb.rpc('team')), q(sb.rpc('tweestap'))]); } catch (e) { return; }
    if (location.hash !== '#/team' || document.getElementById('twblok')) return;
    const baas = t.beheerder, k = t.kantoor_id, zonder = t.leden.filter((l) => !l.tweestap);
    document.getElementById('app').insertAdjacentHTML('beforeend', `<div class="kaart" id="twblok"><h3 style="margin-top:0">Beveiliging</h3>
      <p><b>Jouw tweestapsverificatie:</b> ${eigen.factor ? '<span class="pil ok">aan</span>' : '<span class="pil warn">uit</span>'}
        ${eigen.factor ? (t.tweestap_verplicht ? '<span class="klein">verplicht door het kantoor</span>' : '<button type="button" class="stil" id="twuit">Uitzetten</button>') : '<a class="knop" href="#/tweestap">Instellen</a>'}</p>
      <p class="klein">Met tweestapsverificatie vraagt het platform naast je wachtwoord een code uit een app op je telefoon.</p>
      <h3>Het kantoor</h3>
      <p>${t.tweestap_verplicht ? '<span class="pil ok">verplicht voor iedereen</span>' : '<span class="pil">niet verplicht</span>'} ${zonder.length ? `<span class="klein">${zonder.length} van de ${t.leden.length} gebruikers heeft ze nog niet aan.</span>` : '<span class="klein">Iedereen heeft ze aan.</span>'}</p>
      ${tabel(['Gebruiker', 'Tweestap', ''], t.leden.map((l) => `<tr><td>${esc(l.email)}${l.ik ? ' <span class="pil">jij</span>' : ''}</td><td>${l.tweestap ? 'aan' : 'uit'}</td><td>${baas && !l.ik && l.tweestap ? `<button type="button" class="stil" data-twreset="${l.user_id}" title="Voor wie zijn telefoon kwijt is">Resetten</button>` : ''}</td></tr>`))}
      ${baas ? `<p>${t.tweestap_verplicht ? '<button type="button" class="stil" id="twvrij">Niet langer verplichten</button>' : '<button type="button" id="twmoet">Verplicht maken voor het hele kantoor</button>'}</p>
        <p class="klein">Verplicht betekent: wie ze nog niet heeft, moet ze bij zijn volgende aanmelding instellen en ziet tot dan niets. Verplichten kan pas als je ze zelf aan hebt.</p>
        <p><a href="#/logboek">Logboek bekijken: wie heeft wat gewijzigd</a></p>` : ''}</div>`);
    const doe = async (fn, klaar) => { try { await fn(); S.bericht = { soort: 'ok', tekst: klaar }; } catch (e) { fout(e); } UIT.routes.team(); };
    const knop = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    knop('twuit', () => doe(async () => { const { error } = await sb.auth.mfa.unenroll({ factorId: eigen.factor }); if (error) throw error; await sb.auth.refreshSession(); }, 'Tweestapsverificatie staat uit.'));
    knop('twmoet', () => doe(() => q(sb.rpc('team_tweestap_verplicht', { p_kantoor: k, p_aan: true })), 'Tweestapsverificatie is nu verplicht voor het hele kantoor.'));
    knop('twvrij', () => doe(() => q(sb.rpc('team_tweestap_verplicht', { p_kantoor: k, p_aan: false })), 'Tweestapsverificatie is niet langer verplicht.'));
    document.querySelectorAll('[data-twreset]').forEach((b) => { b.onclick = () => doe(() => q(sb.rpc('team_reset_tweestap', { p_kantoor: k, p_user: b.dataset.twreset })), 'De tweestapsverificatie van deze gebruiker is gewist. Hij stelt ze opnieuw in bij zijn volgende aanmelding.'); });
  };
}

// ---- logboek ---------------------------------------------------------------------------------
const LOG_TABEL = { taak: 'taak', dossier: 'dossier', dossier_notitie: 'notitie in dossier', dossier_mail: 'mail bij dossier', kost: 'kost', contact: 'contact', kavel: 'kavel', kavel_relatie: 'eigenaar van een kavel', verdeelsleutel: 'verdeelsleutel', sleutel_aandeel: 'aandeel in een sleutel',
  leverancier: 'leverancier', document: 'document', attest: 'attest', attest_nvt: 'attest niet van toepassing', vergadering: 'vergadering', agendapunt: 'agendapunt', stem: 'stem', aanwezigheid: 'aanwezigheid', bankrekening: 'bankrekening', bankafschrift: 'bankafschrift', bankbeweging: 'bankbeweging',
  boekjaar: 'boekjaar', boekingsregel: 'boekingsregel', dagboek: 'dagboek', grootboekrekening: 'rekening', vme: 'gebouw', gebouw: 'gebouw', kantoor_lid: 'teamlid', uitnodiging: 'uitnodiging voor het team', api_sleutel: 'API-sleutel', sleutelafhaal: 'sleutelafhaal', tekenverzoek: 'tekenverzoek',
  handtekening: 'handtekening', mailing: 'mailing', herinnering: 'herinnering', kantoor: 'instelling van het kantoor', tweestap: 'tweestapsverificatie van', bestuursmandaat: 'bestuursmandaat', mailbox_instelling: 'instelling van de mailbox', vme_hersteller: 'vaste hersteller' };
const LOG_ACTIE = { insert: 'voegde toe:', update: 'wijzigde', delete: 'verwijderde', reset: 'resette' };
const logZin = (r) => {
  const wat = `${LOG_ACTIE[r.actie] ?? r.actie} ${LOG_TABEL[r.tabel] ?? r.tabel}${r.label ? ` <b>${esc(r.label)}</b>` : ''}`;
  const velden = Object.entries(r.wijzigingen ?? {}).filter(([k]) => !k.endsWith('_id') || k === 'toegewezen_aan').slice(0, 5)
    .map(([k, [van, naar]]) => `${esc(k.replace(/_/g, ' '))}: ${van == null || van === '' ? '<i>leeg</i>' : esc(van)} → ${naar == null || naar === '' ? '<i>leeg</i>' : esc(naar)}`);
  return `${wat}${velden.length ? `<span class="logwijz">${velden.join(' · ')}</span>` : ''}`;
};
UIT.routes.logboek = async () => {
  const st = (S.logboek ??= { vme: '', user: '', zoek: '', rijen: null, einde: false });
  let team, vmes;
  try { [team, vmes] = await Promise.all([q(sb.rpc('team')), q(sb.from('vme').select('id, naam').order('naam'))]); } catch (e) { fout(e); return toon(`${terug}<p class="leeg">Het logboek kon niet geladen worden.</p>`); }
  if (!team.beheerder) return toon(`${terug}<h2>Logboek</h2><p class="leeg">Alleen een beheerder van het kantoor kan het logboek bekijken.</p>`);
  const haal = async (voor = null) => q(sb.rpc('logboek_lijst', { p_vme: st.vme || null, p_user: st.user || null, p_zoek: st.zoek || null, p_voor: voor, p_max: 100 }));
  try { if (!st.rijen) { st.rijen = await haal(); st.einde = st.rijen.length < 100; } } catch (e) { fout(e); st.rijen = []; }
  const dag = (v) => new Date(v).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), uur = (v) => new Date(v).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  let vorige = '';
  toon(`${terug}<h2>Logboek</h2><p class="klein">Wie wat toegevoegd, gewijzigd of verwijderd heeft. De databank houdt dit zelf bij; niemand kan het aanpassen of wissen. Alleen beheerders zien het.</p>
    <div class="kaart"><form id="flg" class="rij">${veld('Gebouw', kies('vme', `<option value="">Alle</option>${vmes.map((v) => `<option value="${v.id}"${v.id === st.vme ? ' selected' : ''}>${esc(v.naam)}</option>`).join('')}`))}
      ${veld('Gebruiker', kies('user', `<option value="">Iedereen</option>${team.leden.map((l) => `<option value="${l.user_id}"${l.user_id === st.user ? ' selected' : ''}>${esc(l.email)}</option>`).join('')}`))}
      ${veld('Zoek', inp('zoek', `value="${esc(st.zoek)}" placeholder="bv. naam, titel of taak"`))}<div><label>&nbsp;</label><button>Tonen</button></div></form>
      ${st.rijen.length ? `<ul class="logl">${st.rijen.map((r) => { const d = dag(r.op), kop = d !== vorige ? `<li class="logdag">${esc(d)}</li>` : ''; vorige = d;
        return `${kop}<li class="logr"><span class="loguur">${uur(r.op)}</span><div><span class="logwie">${esc(r.email ?? 'het platform')}</span> ${logZin(r)}${r.vme ? ` <span class="klein">· ${esc(r.vme)}</span>` : ''}</div></li>`; }).join('')}</ul>` : '<p class="leeg">Niets gevonden.</p>'}
      ${st.einde ? '' : '<p class="tkalle"><button type="button" class="stil" id="lgmeer">Oudere regels laden</button></p>'}</div>`);
  document.getElementById('flg').onsubmit = (ev) => { ev.preventDefault(); const f = ev.target; Object.assign(st, { vme: f.vme.value, user: f.user.value, zoek: f.zoek.value.trim(), rijen: null }); UIT.routes.logboek(); };
  const meer = document.getElementById('lgmeer'); if (meer) meer.onclick = async () => { meer.disabled = true; try { const extra = await haal(st.rijen[st.rijen.length - 1].op); st.rijen.push(...extra); st.einde = extra.length < 100; } catch (e) { fout(e); } UIT.routes.logboek(); };
};
window.addEventListener('hashchange', () => { if (location.hash !== '#/logboek' && S.logboek) S.logboek.rijen = null; });
