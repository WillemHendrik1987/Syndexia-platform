// =============================================================================
// Syndexia Platform - de kern: aanmelden, navigatie en de leesschermen. Geen bouwstap.
//
// Hoe het werkt: de browser praat rechtstreeks met Supabase. De sleutel
// hieronder is de publieke sleutel; die mag zichtbaar zijn, want ze geeft op
// zichzelf geen enkel recht. Wat je mag zien en doen beslist de databank zelf
// (RLS: enkel de gegevens van je eigen kantoor) op basis van je login.
// Alle rekenwerk (verdelen, boeken, afrekenen) gebeurt in de databank, niet hier.
// =============================================================================
const SB_URL = 'https://wwimycuukwszaugeorkz.supabase.co';
const SB_KEY = 'sb_publishable_iztW9Mj48wCpDpSUN5YUqQ_V6vOt3Ys';
const sb = supabase.createClient(SB_URL, SB_KEY);

const $app = document.getElementById('app');
const S = { sessie: null, kantoor: null, vme: null, bj: null, tab: 'overzicht', d: {}, basis: {}, bericht: null };

// ---- kleine hulpjes ---------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => Number(v ?? 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dat = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
const getal = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const som = (rijen, f) => rijen.reduce((s, r) => s + Number(f(r) ?? 0), 0);
const vandaag = () => new Date().toLocaleDateString('sv-SE');   // jjjj-mm-dd in lokale tijd
// Elke vraag aan Supabase geeft { data, error } terug; hier maken we er "data of een fout" van.
// Meldingen van de databank over dubbele of ongeldige gegevens, in gewone taal.
const UITLEG = [
  [/ondernemingsnummer_key/, 'Er bestaat al een VME met dit ondernemingsnummer.'], [/ondernemingsnummer_check/, 'Dit ondernemingsnummer is niet geldig (controlegetal klopt niet).'],
  [/iban_key/, 'Deze bankrekening is al aan een VME gekoppeld.'], [/iban.*_check|ibans_check/, 'Dit IBAN is niet geldig.'],
  [/kavel_nummer_uniek/, 'Er bestaat al een kavel met dit nummer.'], [/verdeelsleutel_vme_id_code_key/, 'Er bestaat al een verdeelsleutel met deze code.'],
  [/grootboekrekening_vme_id_nummer_key/, 'Deze rekening bestaat al.'], [/nummer_check/, 'Een rekeningnummer bestaat uit 2 tot 8 cijfers.'],
  [/boekjaar.*excl/, 'Dit boekjaar overlapt met een bestaand boekjaar.'], [/boekjaar_check/, 'De einddatum moet na de begindatum liggen.'],
  [/kavel_relatie.*excl/, 'Dit contact is in die periode al eigenaar van deze kavel.'],
  [/update or delete on table .* violates foreign key/, 'Dit kan niet gewist worden: er hangen nog kosten, boekingen of vergaderingen aan.'],
  [/agendapunt_vergadering_id_volgnummer_key/, 'Dit volgnummer bestaat al in de agenda.'],
];
const uitleg = (tekst) => (UITLEG.find(([patroon]) => patroon.test(tekst)) ?? [0, tekst])[1];
async function q(vraag) { const { data, error } = await vraag; if (error) throw new Error(uitleg(error.message)); return data; }
const tabel = (koppen, rijen, voet = '') => `<div class="schuif"><table><thead><tr>${koppen.map((k) => `<th${k.startsWith('#') ? ' class="n"' : ''}>${esc(k.replace('#', ''))}</th>`).join('')}</tr></thead><tbody>${rijen.join('') || `<tr><td colspan="${koppen.length}" class="leeg">Niets te tonen.</td></tr>`}${voet}</tbody></table></div>`;
const cel = (v) => `<td>${esc(v)}</td>`, celN = (v) => `<td class="n">${eur(v)}</td>`;
function toon(html) { const b = S.bericht; S.bericht = null; $app.innerHTML = (b ? `<div class="melding ${b.soort}">${esc(b.tekst)}</div>` : '') + html; if (UIT.synToon) UIT.synToon(); }
function fout(e) { S.bericht = { soort: 'fout', tekst: e.message || String(e) }; }

// ---- aanmelden --------------------------------------------------------------
function schermLogin(modus = 'in') {
  document.getElementById('wie').innerHTML = '';
  if (modus === 'vergeten') return schermVergeten();
  toon(`<div class="kaart" style="max-width:420px;margin:30px auto">
    <h2>${modus === 'in' ? 'Aanmelden' : 'Account maken'}</h2>
    ${modus === 'nieuw' ? '<p class="klein">Eigenaar? Gebruik het e-mailadres dat uw syndicus van u kent. U ziet dan alleen de gegevens van uw eigen kavel.</p>' : ''}
    <p class="klein">${modus === 'in' ? 'Meld je aan met je e-mailadres en wachtwoord.' : 'Kies zelf een wachtwoord (minstens 8 tekens). Je krijgt een mail om je adres te bevestigen.'}</p>
    <form id="f"><p><label>E-mailadres</label><input name="email" type="email" required autocomplete="email"></p>
    <p><label>Wachtwoord</label><span style="display:flex;gap:6px"><input name="ww" type="password" required minlength="8" autocomplete="${modus === 'in' ? 'current-password' : 'new-password'}"><button type="button" class="stil" data-oog title="Wachtwoord tonen of verbergen" aria-label="Wachtwoord tonen of verbergen">👁</button></span></p>
    <button>${modus === 'in' ? 'Aanmelden' : 'Account maken'}</button>
    <button type="button" class="stil" id="wissel">${modus === 'in' ? 'Nog geen account?' : 'Ik heb al een account'}</button>
    ${modus === 'in' ? '<button type="button" class="stil" id="vergeten">Wachtwoord vergeten?</button>' : ''}</form></div>`);
  document.getElementById('wissel').onclick = () => schermLogin(modus === 'in' ? 'nieuw' : 'in');
  if (modus === 'in') document.getElementById('vergeten').onclick = () => schermLogin('vergeten');
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), email = f.get('email').trim(), password = f.get('ww');
    const { data, error } = modus === 'in'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    if (error) { fout(error.message === 'Invalid login credentials' ? { message: 'E-mailadres of wachtwoord klopt niet.' } : error.message === 'Email not confirmed' ? { message: 'Je adres is nog niet bevestigd. Klik eerst op de link in de mail.' } : error); return schermLogin(modus); }
    if (modus === 'nieuw' && !data.session) { S.bericht = { soort: 'ok', tekst: 'Account gemaakt. Klik op de link in de bevestigingsmail en meld je daarna hier aan.' }; schermLogin('in'); }
  };
}

// Wachtwoord vergeten: Supabase mailt een link. Wie op die link klikt komt aangemeld terug
// op deze pagina met de melding PASSWORD_RECOVERY, en kiest dan een nieuw wachtwoord.
function schermVergeten() {
  toon(`<div class="kaart" style="max-width:420px;margin:30px auto"><h2>Wachtwoord vergeten</h2>
    <p class="klein">Geef je e-mailadres. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.</p>
    <form id="f"><p><label>E-mailadres</label><input name="email" type="email" required autocomplete="email"></p>
    <button>Stuur de link</button> <button type="button" class="stil" id="wissel">Terug naar aanmelden</button></form></div>`);
  document.getElementById('wissel').onclick = () => schermLogin('in');
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault();
    const { error } = await sb.auth.resetPasswordForEmail(new FormData(ev.target).get('email').trim(), { redirectTo: location.origin });
    if (error) { fout(error); return schermLogin('vergeten'); }
    S.bericht = { soort: 'ok', tekst: 'Als dit adres een account heeft, is er een mail met een link onderweg.' }; schermLogin('in');
  };
}
function schermNieuwWachtwoord() {
  toon(`<div class="kaart" style="max-width:420px;margin:30px auto"><h2>Nieuw wachtwoord kiezen</h2>
    <form id="f"><p><label>Nieuw wachtwoord (minstens 8 tekens)</label><span style="display:flex;gap:6px"><input name="ww" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="stil" data-oog title="Wachtwoord tonen of verbergen" aria-label="Wachtwoord tonen of verbergen">👁</button></span></p>
    <p><label>Nog een keer</label><span style="display:flex;gap:6px"><input name="ww2" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="stil" data-oog title="Wachtwoord tonen of verbergen" aria-label="Wachtwoord tonen of verbergen">👁</button></span></p>
    <button>Wachtwoord opslaan</button></form></div>`);
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (f.get('ww') !== f.get('ww2')) { fout({ message: 'De twee wachtwoorden zijn niet gelijk.' }); return schermNieuwWachtwoord(); }
    const { error } = await sb.auth.updateUser({ password: f.get('ww') });
    if (error) { fout(error); return schermNieuwWachtwoord(); }
    S.herstel = false; S.bericht = { soort: 'ok', tekst: 'Je wachtwoord is gewijzigd.' }; start();
  };
}

// Na het aanmelden: uitnodigingen aanvaarden (maakt je lid van je kantoor) en het kantoor ophalen.
async function start() {
  if (UIT.openbaar && UIT.openbaar()) return;   // pagina's zonder login, bv. het meldformulier achter de QR-code
  const { data: { session } } = await sb.auth.getSession();
  S.sessie = session;
  if (!session) return schermLogin();
  document.getElementById('wie').innerHTML = `<small>${esc(session.user.email)}</small> <button class="stil" style="color:#fff" id="uit">Afmelden</button>`;
  document.getElementById('uit').onclick = () => sb.auth.signOut();
  if (S.herstel) return schermNieuwWachtwoord();
  // Tweestapsverificatie: de databank zegt of er na het wachtwoord nog een code nodig is, of dat het
  // kantoor ze verplicht en ze nog ingesteld moet worden. Tot dan geeft de databank toch geen gegevens.
  if (!S.herstel && typeof schermTweestapCode === 'function') {
    const { data: t } = await sb.rpc('tweestap');
    if (t?.factor && t.niveau !== 'aal2') return schermTweestapCode(t.factor);
    if (t?.verplicht && !t.factor) { await sb.rpc('aanvaard_uitnodigingen'); return schermTweestapInstellen(true); }
  }
  try {
    await sb.rpc('aanvaard_uitnodigingen');
    const kantoren = await q(sb.from('kantoor').select('id, naam').order('naam'));
    S.kantoor = kantoren[0] ?? null;
  } catch (e) { fout(e); }
  // Een herstel-link meldt zich soms terwijl deze functie al bezig was: dan gaat het wachtwoordscherm voor.
  if (S.herstel) { if (!document.querySelector('[name=ww2]')) schermNieuwWachtwoord(); return; }
  if (!S.kantoor) {
    // Geen lid van een kantoor: misschien een eigenaar. Het portaal geeft alleen terug wat bij dit adres hoort.
    let p = null;
    try { p = await q(sb.rpc('portaal')); } catch (e) { fout(e); }
    if (p?.kavels?.length) return schermPortaal(p);
    return toon(`<div class="kaart"><h2>Nog geen toegang</h2><p>U bent aangemeld als <b>${esc(session.user.email)}</b>, maar dit adres is nog niet gekend.</p>
      <p><b>Eigenaar?</b> Uw syndicus moet dit e-mailadres bij uw gegevens zetten. Vraag het na en meld u daarna opnieuw aan.</p>
      <p><b>Medewerker van een kantoor?</b> Vraag de beheerder om u uit te nodigen.</p></div>`);
  }
  route();
}

// ---- navigatie: #/ = alle VME's, #/vme/<id>/<tab> = één VME --------------------
async function route() {
  if (!S.sessie || !S.kantoor || S.herstel) return;
  const [, deel, id, tab] = location.hash.split('/');
  try {
    if (UIT.routes[deel]) await UIT.routes[deel](id, tab);   // extra pagina's uit beheer.js
    else if (deel === 'vme' && id) { S.tab = tab || 'overzicht'; if (S.vme?.id !== id) await laadVme(id); schermVme(); }
    else await schermVandaag();
  } catch (e) { fout(e); toon('<p class="leeg">Er liep iets mis bij het laden.</p>'); }
}

// ---- scherm: Vandaag ----------------------------------------------------------
async function schermVandaag() {
  const [vmes, kavels, jaren, kosten, open, zonder] = await Promise.all([
    q(sb.from('vme').select('id, naam, adres_straat, postcode, gemeente, bevestigd_op').is('gedeactiveerd_op', null).order('naam')),
    q(sb.from('kavel').select('vme_id')),
    q(sb.from('boekjaar').select('id, vme_id, omschrijving, afgesloten').eq('afgesloten', false)),
    q(sb.from('v_afrekening_sleutel').select('vme_id, boekjaar_id, bedrag')),
    q(sb.from('v_provisie_open').select('vme_id, openstaand').gt('openstaand', 0)),
    q(sb.from('v_kost_zonder_verdeling').select('vme_id')),
  ]);
  const openJaar = new Set(jaren.map((j) => j.id));
  const kaart = (v) => {
    const nZonder = zonder.filter((z) => z.vme_id === v.id).length;
    return `<a class="kaart" href="#/vme/${v.id}"><h2>${esc(v.naam)}</h2><span class="klein">${esc([v.adres_straat, [v.postcode, v.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</span>
      <div class="cijfers"><div><b>${kavels.filter((k) => k.vme_id === v.id).length}</b><span>kavels</span></div>
      <div><b>${eur(som(kosten.filter((k) => k.vme_id === v.id && openJaar.has(k.boekjaar_id)), (k) => k.bedrag))}</b><span>kosten open boekjaar</span></div>
      <div><b>${eur(som(open.filter((o) => o.vme_id === v.id), (o) => o.openstaand))}</b><span>provisies openstaand</span></div>
      ${nZonder ? `<div><b>${nZonder}</b><span class="pil fout">kost zonder verdeling</span></div>` : ''}</div></a>`;
  };
  const uur = new Date().getHours(), groet = uur < 12 ? 'Goeiemorgen' : uur < 18 ? 'Goeiemiddag' : 'Goeienavond';
  toon(`<div class="groet"><h2>${groet}</h2><p>${esc(S.kantoor.naam)} beheert ${vmes.length} ${vmes.length === 1 ? 'gebouw' : 'gebouwen'}.</p></div>
    <div class="acties">${UIT.vandaag.filter((h) => h.startsWith('<p')).join('')}</div>
    <div class="blokken">${UIT.vandaag.filter((h) => h && !h.startsWith('<p')).join('')}</div>
    <div class="vmes">${vmes.map(kaart).join('')}</div>${vmes.length ? '' : '<div class="kaart"><p class="leeg">Nog geen gebouw. Begin met "Nieuwe VME" of neem een gebouw over van een vorige syndicus.</p></div>'}`);
  (UIT.naVandaag ?? []).forEach((f) => f());   // extra blokken op het startscherm, bv. de open taken
}

// ---- gegevens van één VME -------------------------------------------------------
async function laadVme(id) {
  const [vme, kavels, eigenaars, sleutels, aandelen, sleutelCtl, controle, jaren, rekeningen, leveranciers] = await Promise.all([
    q(sb.from('vme').select('*').eq('id', id).single()),
    q(sb.from('kavel').select('id, kavelnummer, soort, verdieping').eq('vme_id', id).order('kavelnummer')),
    q(sb.from('v_kavel_eigenaar_vandaag').select('kavel_id, naam, zakelijk_recht, aandeel_teller, aandeel_noemer, is_lasthebber').eq('vme_id', id)),
    q(sb.from('verdeelsleutel').select('id, code, naam, is_basisakte, totaal_aandelen').eq('vme_id', id).order('code')),
    q(sb.from('sleutel_aandeel').select('verdeelsleutel_id, kavel_id, aandeel').eq('vme_id', id)),
    q(sb.from('v_sleutel_controle').select('verdeelsleutel_id, som_aandelen, sluitend').eq('vme_id', id)),
    q(sb.rpc('vme_controle', { p_vme: id })),
    q(sb.from('boekjaar').select('id, omschrijving, start_datum, eind_datum, afgesloten').eq('vme_id', id).order('start_datum', { ascending: false })),
    q(sb.from('grootboekrekening').select('id, nummer, naam').eq('vme_id', id).order('nummer')),
    q(sb.from('leverancier').select('id, naam').order('naam')),
  ]);
  S.vme = vme;
  S.d = { kavels, eigenaars, sleutels, aandelen, sleutelCtl, controle, jaren, rekeningen, leveranciers };
  S.bj = jaren.find((j) => !j.afgesloten) ?? jaren[0] ?? null;
  await laadBoekjaar();
}
async function laadBoekjaar() {
  if (!S.bj) return Object.assign(S.d, { kosten: [], afrKavel: [], afrSleutel: [], perEigenaar: [], balans: [], provisies: [], levOpen: [] });
  const bj = S.bj.id;
  const [kosten, afrKavel, afrSleutel, perEigenaar, balans, provisies, levOpen] = await Promise.all([
    q(sb.from('kost').select('id, datum, bedrag, btw_bedrag, rekening_id, verdeelsleutel_id, kavel_id, leverancier, omschrijving, dagboek, documentnummer, afrondingsverschil').eq('boekjaar_id', bj).order('datum', { ascending: false })),
    q(sb.from('v_afrekening_kavel').select('kavel_id, kavelnummer, verdeelsleutel_id, sleutel_code, bedrag').eq('boekjaar_id', bj)),
    q(sb.from('v_afrekening_sleutel').select('sleutel_code, sleutel_naam, bedrag, btw_bedrag, afrondingsverschil, aantal_lijnen').eq('boekjaar_id', bj).order('sleutel_code')),
    q(sb.rpc('afrekening_per_eigenaar', { p_boekjaar: bj })),
    q(sb.from('v_balans').select('nummer, naam, groep, debet, credit, saldo').eq('boekjaar_id', bj).order('nummer')),
    q(sb.from('v_provisie_open').select('kavelnummer, datum, vervaldatum, ogm, omschrijving, bedrag, betaald, openstaand').eq('vme_id', S.vme.id).order('datum')),
    q(sb.from('v_openstaand_leverancier').select('naam, gefactureerd, betaald, openstaand').eq('boekjaar_id', bj).order('naam')),
  ]);
  Object.assign(S.d, { kosten, afrKavel, afrSleutel, perEigenaar, balans, provisies, levOpen });
}

// ---- scherm: één VME --------------------------------------------------------------
const TABS = [['overzicht', 'Overzicht'], ['kosten', 'Kosten'], ['provisies', 'Provisies'], ['afrekening', 'Afrekening'], ['balans', 'Balans']];
TABS.push(...UIT.tabs);   // extra tabbladen uit beheer.js
// De tabbladen staan in drie groepen; een tabblad dat in geen groep staat, komt bij Opvolging.
const GROEPEN = [['Gebouw', ['overzicht', 'beheer', 'contacten', 'doc', 'attesten']], ['Boekhouding', ['kosten', 'provisies', 'afrekening', 'balans', 'bank', 'jaar', 'ai']], ['Opvolging', ['dossiers', 'sleutels', 'av', 'tekenen', 'mail', 'verkoop', 'overdracht']]];
const groepVan = (tab) => (GROEPEN.find(([, t]) => t.includes(tab)) ?? GROEPEN[2])[0];
function schermVme() {
  const v = S.vme, d = S.d, alle = TABS.filter(([k]) => { const f = { overzicht: 1, kosten: 1, provisies: 1, afrekening: 1, balans: 1, ...UIT.fn }; return f[k]; });
  if (!alle.some(([k]) => k === S.tab)) S.tab = 'overzicht';
  const groep = groepVan(S.tab), volgorde = GROEPEN.find(([g]) => g === groep)[1];
  const inGroep = alle.filter(([k]) => groepVan(k) === groep).sort((a, b) => (volgorde.indexOf(a[0]) + 99) % 99 - (volgorde.indexOf(b[0]) + 99) % 99);
  const kop = `<p><a href="#/" style="color:var(--b)">← alle VME's</a></p>
    <div class="rij" style="align-items:center"><div style="flex:3 1 260px"><h2>${esc(v.naam)}</h2><span class="klein">${esc(v.ondernemingsnummer ?? '')}</span></div>
    <div><label>Boekjaar</label><select id="bj">${d.jaren.map((j) => `<option value="${j.id}"${j.id === S.bj?.id ? ' selected' : ''}>${esc(j.omschrijving)}${j.afgesloten ? ' (afgesloten)' : ''}</option>`).join('') || '<option>geen boekjaar</option>'}</select></div></div>
    <div class="groepen">${GROEPEN.map(([g]) => `<button data-groep="${g}" class="${g === groep ? 'aan' : ''}">${g}</button>`).join('')}</div>
    <div class="tabs">${inGroep.map(([k, n]) => `<button data-tab="${k}" class="${k === S.tab ? 'aan' : ''}">${n}</button>`).join('')}</div>`;
  toon(kop + ({ overzicht: tabOverzicht, kosten: tabKosten, provisies: tabProvisies, afrekening: tabAfrekening, balans: tabBalans, ...UIT.fn }[S.tab] ?? tabOverzicht)());
  document.getElementById('bj').onchange = async (ev) => { S.bj = d.jaren.find((j) => j.id === ev.target.value); try { await laadBoekjaar(); } catch (e) { fout(e); } schermVme(); };
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { location.hash = `#/vme/${v.id}/${b.dataset.tab}`; }; });
  document.querySelectorAll('[data-groep]').forEach((b) => { b.onclick = () => { const eerste = GROEPEN.find(([g]) => g === b.dataset.groep)[1].find((k) => alle.some(([a]) => a === k)); if (eerste) location.hash = `#/vme/${v.id}/${eerste}`; }; });
  ({ kosten: bindKosten, provisies: bindProvisies, ...UIT.bind }[S.tab] ?? (() => {}))();
}

function tabOverzicht() {
  const d = S.d;
  const meldingen = d.controle.length
    ? d.controle.map((c) => `<p><span class="pil ${c.ernst === 'fout' ? 'fout' : 'warn'}">${esc(c.ernst)}</span> ${esc(c.melding)}</p>`).join('')
    : '<p><span class="pil ok">in orde</span> De controle van de stamgegevens geeft geen opmerkingen.</p>';
  const rijen = d.kavels.map((k) => {
    const eig = d.eigenaars.filter((e) => e.kavel_id === k.id).map((e) => e.naam + (e.aandeel_noemer && e.aandeel_noemer !== e.aandeel_teller ? ` (${e.aandeel_teller}/${e.aandeel_noemer})` : '')).join(', ');
    return `<tr>${cel(k.kavelnummer)}${cel(eig || '— geen eigenaar —')}${d.sleutels.map((s) => `<td class="n">${esc(Number(d.aandelen.find((a) => a.kavel_id === k.id && a.verdeelsleutel_id === s.id)?.aandeel ?? 0).toLocaleString('nl-BE'))}</td>`).join('')}</tr>`;
  });
  const voet = `<tr class="tot"><td colspan="2">Totaal (akte: ${d.sleutels.map((s) => Number(s.totaal_aandelen).toLocaleString('nl-BE')).join(' / ')})</td>${d.sleutels.map((s) => { const c = d.sleutelCtl.find((x) => x.verdeelsleutel_id === s.id); return `<td class="n">${esc(Number(c?.som_aandelen ?? 0).toLocaleString('nl-BE'))} ${c?.sluitend ? '✓' : '✗'}</td>`; }).join('')}</tr>`;
  return `<div class="kaart"><h3 style="margin-top:0">Controle</h3>${meldingen}</div>
    <div class="kaart"><h3 style="margin-top:0">Kavels, eigenaars en aandelen</h3>${tabel(['Kavel', 'Eigenaar vandaag', ...d.sleutels.map((s) => `#${s.code} ${s.naam}`)], rijen, voet)}</div>`;
}

// Keuzelijst "waarover verdelen": een verdeelsleutel (gemeenschappelijk) of één kavel (privatief).
const optiesVerdeling = () => `<optgroup label="Verdeelsleutel">${S.d.sleutels.map((s) => `<option value="s:${esc(s.code)}">${esc(s.code)} ${esc(s.naam)}</option>`).join('')}</optgroup><optgroup label="Eén kavel (privatief)">${S.d.kavels.map((k) => `<option value="k:${esc(k.kavelnummer)}">${esc(k.kavelnummer)}</option>`).join('')}</optgroup>`;
const lijnHtml = () => `<div class="rij lijn" style="margin-top:8px">
  <div style="flex:2 1 200px"><label>Kostenrekening</label><select name="rekening" required>${S.d.rekeningen.filter((r) => r.nummer.startsWith('6')).map((r) => `<option value="${esc(r.nummer)}">${esc(r.nummer)} ${esc(r.naam)}</option>`).join('')}</select></div>
  <div><label>Verdelen over</label><select name="verdeling" required>${optiesVerdeling()}</select></div>
  <div><label>Bedrag incl. btw</label><input name="bedrag" inputmode="decimal" required placeholder="0,00"></div>
  <div><label>Waarvan btw</label><input name="btw" inputmode="decimal" placeholder="0,00"></div>
  <div><label>Periode</label><input name="oms" placeholder="bv. 11/2026"></div></div>`;

function tabKosten() {
  const d = S.d, rek = Object.fromEntries(d.rekeningen.map((r) => [r.id, r])), sl = Object.fromEntries(d.sleutels.map((s) => [s.id, s])), kv = Object.fromEntries(d.kavels.map((k) => [k.id, k]));
  const rijen = d.kosten.map((k) => `<tr>${cel(dat(k.datum))}${cel([k.dagboek, k.documentnummer].filter(Boolean).join(' '))}${cel(`${rek[k.rekening_id]?.nummer ?? ''} ${rek[k.rekening_id]?.naam ?? ''}`)}${cel(k.leverancier)}${cel(k.omschrijving)}${cel(k.verdeelsleutel_id ? sl[k.verdeelsleutel_id]?.code : `kavel ${kv[k.kavel_id]?.kavelnummer ?? ''}`)}${celN(k.bedrag)}${celN(k.btw_bedrag)}</tr>`);
  const voet = `<tr class="tot"><td colspan="6">${d.kosten.length} lijnen</td>${celN(som(d.kosten, (k) => k.bedrag))}${celN(som(d.kosten, (k) => k.btw_bedrag))}</tr>`;
  const formulier = !S.bj ? '' : S.bj.afgesloten ? '<p class="leeg">Dit boekjaar is afgesloten; er kan niet meer in geboekt worden.</p>' : `<details class="kaart"><summary><b>Aankoopfactuur boeken</b></summary>
    <p class="klein">Boekt de factuur op de leverancier (440000) en verdeelt elke lijn meteen over de kavels. Een geboekte factuur kan niet meer gewijzigd of gewist worden. Rappels en aanmaningen horen hier niet.</p>
    <form id="ff"><div class="rij">
      <div style="flex:2 1 200px"><label>Leverancier</label><select name="lev"><option value="">— nieuwe leverancier —</option>${d.leveranciers.map((l) => `<option value="${l.id}">${esc(l.naam)}</option>`).join('')}</select></div>
      <div style="flex:2 1 200px"><label>Naam nieuwe leverancier</label><input name="levnaam"></div>
      <div><label>Factuurdatum</label><input name="datum" type="date" required value="${vandaag()}" min="${S.bj.start_datum}" max="${S.bj.eind_datum}"></div>
      <div><label>Factuurnummer</label><input name="ref"></div></div>
      <div id="lijnen">${lijnHtml()}</div>
      <p><button type="button" class="stil" id="pluslijn">+ lijn toevoegen</button> <button>Factuur boeken</button></p></form></details>`;
  return `${formulier}<div class="kaart"><h3 style="margin-top:0">Kosten ${esc(S.bj?.omschrijving ?? '')}</h3>${tabel(['Datum', 'Stuk', 'Rekening', 'Leverancier', 'Omschrijving', 'Verdeling', '#Bedrag', '#Btw'], rijen, voet)}</div>`;
}

// De standaardrekeningen (leveranciers, mede-eigenaars, bank…) en dagboeken moeten bestaan voor je kan boeken.
// zet_basisrekeningen maakt ze aan als ze ontbreken en doet niets als ze er al zijn.
async function zorgBasis() { if (!S.basis[S.vme.id]) { await q(sb.rpc('zet_basisrekeningen', { p_vme: S.vme.id })); S.basis[S.vme.id] = true; } }
async function naBoeking(tekst) { S.bericht = { soort: 'ok', tekst }; const id = S.vme.id, bj = S.bj.id; await laadVme(id); S.bj = S.d.jaren.find((j) => j.id === bj) ?? S.bj; await laadBoekjaar(); schermVme(); }

function bindKosten() {
  const f = document.getElementById('ff'); if (!f) return;
  document.getElementById('pluslijn').onclick = () => document.getElementById('lijnen').insertAdjacentHTML('beforeend', lijnHtml());
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const knop = f.querySelector('button:not([type])'); knop.disabled = true;
    try {
      const lijnen = [...f.querySelectorAll('.lijn')].map((l, i) => {
        const w = (n) => l.querySelector(`[name=${n}]`).value, bedrag = getal(w('bedrag')), [soort, code] = [w('verdeling').slice(0, 1), w('verdeling').slice(2)];
        if (bedrag === null || bedrag === 0) throw new Error(`Lijn ${i + 1}: vul een bedrag in.`);
        return { rekening: w('rekening'), bedrag, btw: getal(w('btw')) ?? 0, omschrijving: w('oms') || null, sleutel: soort === 's' ? code : null, kostkavel: soort === 'k' ? code : null };
      });
      let lev = f.lev.value;
      if (!lev) {
        const naam = f.levnaam.value.trim(); if (!naam) throw new Error('Kies een leverancier of vul de naam van een nieuwe in.');
        lev = (await q(sb.from('leverancier').insert({ kantoor_id: S.kantoor.id, naam }).select('id').single())).id;
      }
      await zorgBasis();
      await q(sb.rpc('boek_aankoopfactuur', { p_boekjaar: S.bj.id, p_dagboek: 'A1', p_leverancier: lev, p_datum: f.datum.value, p_lijnen: lijnen, p_document_ref: f.ref.value || null }));
      await naBoeking(`Factuur geboekt: ${eur(som(lijnen, (l) => l.bedrag))} over ${lijnen.length} lijn(en).`);
    } catch (e) { fout(e); schermVme(); }
  };
}

function tabProvisies() {
  const d = S.d;
  const rijen = d.provisies.map((p) => `<tr>${cel(p.kavelnummer)}${cel(dat(p.datum))}${cel(dat(p.vervaldatum))}${cel(p.omschrijving)}${cel(p.ogm ? `+++${p.ogm.slice(0, 3)}/${p.ogm.slice(3, 7)}/${p.ogm.slice(7)}+++` : '')}${celN(p.bedrag)}${celN(p.betaald)}${celN(p.openstaand)}</tr>`);
  const voet = `<tr class="tot"><td colspan="5">Totaal</td>${celN(som(d.provisies, (p) => p.bedrag))}${celN(som(d.provisies, (p) => p.betaald))}${celN(som(d.provisies, (p) => p.openstaand))}</tr>`;
  const formulier = !S.bj || S.bj.afgesloten ? '' : `<details class="kaart"><summary><b>Provisie opvragen</b></summary>
    <p class="klein">Verdeelt het bedrag over de kavels volgens de gekozen sleutel en maakt per kavel een eigen gestructureerde mededeling aan. In deze testversie wordt nog niets verstuurd.</p>
    <form id="fp"><div class="rij">
      <div><label>Verdeelsleutel</label><select name="sleutel">${d.sleutels.map((s) => `<option value="${s.id}">${esc(s.code)} ${esc(s.naam)}</option>`).join('')}</select></div>
      <div><label>Totaalbedrag</label><input name="bedrag" inputmode="decimal" required placeholder="0,00"></div>
      <div><label>Datum</label><input name="datum" type="date" required value="${vandaag()}" min="${S.bj.start_datum}" max="${S.bj.eind_datum}"></div>
      <div><label>Vervaldatum</label><input name="verval" type="date"></div>
      <div style="flex:2 1 200px"><label>Omschrijving</label><input name="oms" placeholder="bv. Provisie werkkapitaal Q4 2026"></div></div>
      <p><button>Provisie opvragen</button></p></form></details>`;
  return `${formulier}<div class="kaart"><h3 style="margin-top:0">Opgevraagde provisies</h3>${tabel(['Kavel', 'Datum', 'Vervalt', 'Omschrijving', 'Mededeling', '#Bedrag', '#Betaald', '#Open'], rijen, voet)}</div>`;
}
function bindProvisies() {
  const f = document.getElementById('fp'); if (!f) return;
  f.onsubmit = async (ev) => {
    ev.preventDefault(); f.querySelector('button').disabled = true;
    try {
      const bedrag = getal(f.bedrag.value); if (!bedrag || bedrag <= 0) throw new Error('Vul een bedrag groter dan nul in.');
      await zorgBasis();
      await q(sb.rpc('boek_provisie_oproep', { p_boekjaar: S.bj.id, p_dagboek: 'V1', p_datum: f.datum.value, p_sleutel: f.sleutel.value, p_bedrag: bedrag, p_omschrijving: f.oms.value || null, p_vervaldatum: f.verval.value || null }));
      await naBoeking(`Provisie van ${eur(bedrag)} opgevraagd.`);
    } catch (e) { fout(e); schermVme(); }
  };
}

function tabAfrekening() {
  const d = S.d, codes = [...new Set(d.afrKavel.map((a) => a.sleutel_code ?? 'privatief'))].sort();
  const bedrag = (kavel, code) => som(d.afrKavel.filter((a) => a.kavel_id === kavel && (a.sleutel_code ?? 'privatief') === code), (a) => a.bedrag);
  const rijen = d.kavels.map((k) => `<tr>${cel(k.kavelnummer)}${codes.map((c) => celN(bedrag(k.id, c))).join('')}${celN(som(d.afrKavel.filter((a) => a.kavel_id === k.id), (a) => a.bedrag))}</tr>`);
  const voet = `<tr class="tot"><td>Totaal verdeeld</td>${codes.map((c) => celN(som(d.afrKavel.filter((a) => (a.sleutel_code ?? 'privatief') === c), (a) => a.bedrag))).join('')}${celN(som(d.afrKavel, (a) => a.bedrag))}</tr>`;
  const sleutelRijen = d.afrSleutel.map((s) => `<tr>${cel(`${s.sleutel_code ?? 'privatief'} ${s.sleutel_naam ?? ''}`)}<td class="n">${s.aantal_lijnen}</td>${celN(s.bedrag)}${celN(s.btw_bedrag)}${celN(s.afrondingsverschil)}</tr>`);
  const sleutelVoet = `<tr class="tot"><td>Totaal</td><td class="n">${som(d.afrSleutel, (s) => s.aantal_lijnen)}</td>${celN(som(d.afrSleutel, (s) => s.bedrag))}${celN(som(d.afrSleutel, (s) => s.btw_bedrag))}${celN(som(d.afrSleutel, (s) => s.afrondingsverschil))}</tr>`;
  const eigRijen = d.perEigenaar.map((e) => `<tr>${cel(e.kavelnummer)}${cel(e.eigenaars ?? '— geen eigenaar in die periode —')}${cel(e.periode_van ? `${dat(e.periode_van)} – ${e.periode_tot ? dat(e.periode_tot) : 'heden'}` : '')}${cel(e.sleutel_code ?? 'privatief')}${celN(e.bedrag)}</tr>`);
  return `<div class="kaart"><h3 style="margin-top:0">Per kavel en sleutel</h3><p class="klein">Elke kostenlijn wordt apart verdeeld en per kavel op de cent afgerond. Het verschil tussen geboekt en verdeeld staat hieronder als afrondingsverschil.</p>${tabel(['Kavel', ...codes.map((c) => `#${c}`), '#Totaal'], rijen, voet)}</div>
    <div class="kaart"><h3 style="margin-top:0">Per sleutel</h3>${tabel(['Sleutel', '#Lijnen', '#Geboekt', '#Waarvan btw', '#Afrondingsverschil'], sleutelRijen, sleutelVoet)}</div>
    <div class="kaart"><h3 style="margin-top:0">Per eigenaar</h3><p class="klein">Bij een eigenaarswissel in het boekjaar wordt een kost toegewezen volgens haar datum, of per dag als ze een periode heeft.</p>${tabel(['Kavel', 'Eigenaar(s)', 'Periode', 'Sleutel', '#Bedrag'], eigRijen)}</div>`;
}

function tabBalans() {
  const d = S.d, groepen = [['actief', 'Actief'], ['passief', 'Passief'], ['kosten', 'Kosten'], ['opbrengsten', 'Opbrengsten']];
  if (!d.balans.length) return `<div class="kaart"><p class="leeg">Nog geen boekingen in het grootboek van dit boekjaar. Kosten die enkel als kostenlijn zijn ingeladen (zoals de demo-gegevens) staan wel in de afrekening, maar niet hier. Boek een factuur of vraag een provisie op om de balans te zien bewegen.</p></div>`;
  const blok = ([g, titel]) => { const r = d.balans.filter((b) => b.groep === g); return r.length ? `<h3>${titel}</h3>${tabel(['Rekening', 'Naam', '#Debet', '#Credit', '#Saldo'], r.map((b) => `<tr>${cel(b.nummer)}${cel(b.naam)}${celN(b.debet)}${celN(b.credit)}${celN(b.saldo)}</tr>`))}` : ''; };
  const lev = d.levOpen.length ? `<div class="kaart"><h3 style="margin-top:0">Leveranciers</h3>${tabel(['Leverancier', '#Gefactureerd', '#Betaald', '#Open'], d.levOpen.map((l) => `<tr>${cel(l.naam)}${celN(l.gefactureerd)}${celN(l.betaald)}${celN(l.openstaand)}</tr>`))}</div>` : '';
  return `<div class="kaart"><p class="klein" style="margin:0">Totaal debet ${eur(som(d.balans, (b) => b.debet))} · totaal credit ${eur(som(d.balans, (b) => b.credit))}</p>${groepen.map(blok).join('')}</div>${lev}`;
}

// Het oogje naast een wachtwoordveld: toont of verbergt wat je typt.
document.addEventListener('click', (ev) => {
  const knop = ev.target.closest('[data-oog]'); if (!knop) return;
  const veldje = knop.parentElement.querySelector('input'); veldje.type = veldje.type === 'password' ? 'text' : 'password';
});

// ---- opstarten --------------------------------------------------------------------
window.addEventListener('hashchange', () => { if (UIT.openbaar && UIT.openbaar()) return; route(); });
// Supabase meldt elke wijziging van de login (aanmelden, afmelden). We herstarten dan,
// via setTimeout omdat je binnen deze melding zelf geen Supabase-vragen mag stellen.
sb.auth.onAuthStateChange((gebeurtenis, sessie) => {
  // Bij het laden komt er altijd één INITIAL_SESSION; daarna herstarten we enkel als er een andere
  // gebruiker is (aan- of afmelden), zodat een ingevuld formulier niet verdwijnt als je van tabblad wisselt.
  const zelfde = (sessie?.user?.id ?? null) === (S.sessie?.user?.id ?? null);
  if (gebeurtenis === 'PASSWORD_RECOVERY') S.herstel = true;
  if (gebeurtenis === 'INITIAL_SESSION' || gebeurtenis === 'PASSWORD_RECOVERY' || !zelfde) setTimeout(() => { S.vme = null; S.kantoor = null; start(); }, 0);
});
start();
