// =============================================================================
// Syndexia Platform - uitbreiding "werken": alles wat gegevens aanmaakt of wijzigt.
//
// Dit bestand hangt zichzelf in app.js via het object UIT: extra tabbladen per VME
// (Bank, Beheer, Boekjaar), extra pagina's (nieuwe VME, leveranciers) en extra knoppen
// op het startscherm. De hulpjes (q, sb, S, esc, eur, tabel ...) komen uit app.js.
// Ook hier doet de databank het rekenwerk en de controles; dit bestand tekent
// formulieren en geeft door wat je invult.
// =============================================================================
const veld = (label, html, flex = '') => `<div${flex ? ` style="flex:${flex}"` : ''}><label>${label}</label>${html}</div>`;
const inp = (naam, extra = '') => `<input name="${naam}" ${extra}>`;
const kies = (naam, opties, extra = '') => `<select name="${naam}" ${extra}>${opties}</select>`;
const ofNull = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };
// "0841.763.030" of "be 0841 763 030" -> "BE0841763030"
const ondNr = (v) => { const t = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return t === '' ? null : /^\d{10}$/.test(t) ? 'BE' + t : t; };
const iban = (v) => ofNull(String(v ?? '').toUpperCase().replace(/\s/g, ''));
const terug = `<p><a href="#/" style="color:var(--b)">← alle VME's</a></p>`;
const contactNaam = (c) => c.bedrijfsnaam || [c.voornaam, c.achternaam].filter(Boolean).join(' ');

// Koppelt een formulier aan een functie: knop uitschakelen tegen dubbel klikken,
// en een fout uit de databank tonen in plaats van ze te laten verdwijnen.
function bijVerzenden(id, fn, opnieuw = () => schermVme()) {
  const f = document.getElementById(id); if (!f) return;
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const knop = f.querySelector('button:not([type])'); if (knop) knop.disabled = true;
    try { await fn(f); } catch (e) { fout(e); opnieuw(); }
  };
}
// Na een wijziging: alles van de VME opnieuw ophalen en het tabblad opnieuw tekenen.
async function ververs(tekst) {
  if (tekst) S.bericht = { soort: 'ok', tekst };
  const bj = S.bj?.id;
  await laadVme(S.vme.id);
  if (bj && S.d.jaren.some((j) => j.id === bj)) { S.bj = S.d.jaren.find((j) => j.id === bj); await laadBoekjaar(); }
  schermVme();
}
// Na een boeking volstaat het boekjaar opnieuw te laden.
async function klaar(tekst) { S.bericht = { soort: 'ok', tekst }; await laadBoekjaar(); schermVme(); }

// ---- startscherm: extra knoppen -------------------------------------------------
UIT.vandaag.push(`<p style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 16px"><a class="knop" href="#/nieuw">+ Nieuwe VME</a><a class="knop licht" href="#/leveranciers">Leveranciers</a></p>`);

// ---- pagina: nieuwe VME -----------------------------------------------------------
UIT.routes.nieuw = async () => {
  const jaar = new Date().getFullYear();
  toon(`${terug}<div class="kaart"><h2>Nieuwe VME</h2>
    <p class="klein">Maakt de VME aan met één gebouw, de standaardrekeningen, de dagboeken en een eerste boekjaar. Kavels, eigenaars en verdeelsleutels voeg je daarna toe onder Beheer.</p>
    <form id="fn"><div class="rij">${veld('Naam', inp('naam', 'required placeholder="VME Res. ..."'), '3 1 260px')}${veld('Ondernemingsnummer', inp('ond', 'placeholder="0123.456.789"'))}</div>
    <div class="rij">${veld('Straat en nummer', inp('straat'), '3 1 260px')}${veld('Postcode', inp('postcode'))}${veld('Gemeente', inp('gemeente'))}</div>
    <div class="rij">${veld('Eerste boekjaar van', inp('start', `type="date" required value="${jaar}-01-01"`))}${veld('tot en met', inp('eind', `type="date" required value="${jaar}-12-31"`))}</div>
    <p><button>VME aanmaken</button></p></form></div>`);
  bijVerzenden('fn', async (f) => {
    const id = await q(sb.rpc('nieuwe_vme', { p_kantoor: S.kantoor.id, p_naam: f.naam.value, p_ondernemingsnummer: ondNr(f.ond.value), p_straat: ofNull(f.straat.value),
      p_postcode: ofNull(f.postcode.value), p_gemeente: ofNull(f.gemeente.value), p_boekjaar_start: f.start.value, p_boekjaar_eind: f.eind.value }));
    S.bericht = { soort: 'ok', tekst: 'VME aangemaakt. Voeg nu kavels, eigenaars en verdeelsleutels toe.' };
    location.hash = `#/vme/${id}/beheer`;
  }, UIT.routes.nieuw);
};

// ---- pagina: leveranciers (gedeeld door alle VME's van het kantoor) -----------------
UIT.routes.leveranciers = async () => {
  const lijst = await q(sb.from('leverancier').select('id, naam, ondernemingsnummer, iban').order('naam'));
  toon(`${terug}<div class="kaart"><h2>Leveranciers</h2>
    ${tabel(['Naam', 'Ondernemingsnummer', 'IBAN'], lijst.map((l) => `<tr>${cel(l.naam)}${cel(l.ondernemingsnummer)}${cel(l.iban)}</tr>`))}
    <h3>Leverancier toevoegen</h3>
    <form id="fl"><div class="rij">${veld('Naam', inp('naam', 'required'), '2 1 220px')}${veld('Ondernemingsnummer', inp('ond', 'placeholder="0123.456.789"'))}${veld('IBAN', inp('iban', 'placeholder="BE.."'), '2 1 220px')}</div>
    <p><button>Toevoegen</button></p></form></div>`);
  bijVerzenden('fl', async (f) => {
    await q(sb.from('leverancier').insert({ kantoor_id: S.kantoor.id, naam: f.naam.value.trim(), ondernemingsnummer: ondNr(f.ond.value), iban: iban(f.iban.value) }));
    S.bericht = { soort: 'ok', tekst: 'Leverancier toegevoegd.' };
    await UIT.routes.leveranciers();
  }, UIT.routes.leveranciers);
};

// =============================================================================
// Tabblad Beheer: stamgegevens van de VME
// =============================================================================
UIT.tabs.push(['bank', 'Bank'], ['beheer', 'Beheer'], ['jaar', 'Boekjaar']);
const SOORTEN = ['appartement', 'studio', 'handelsruimte', 'kantoor', 'garage', 'parking', 'berging', 'kelder', 'andere'];

UIT.fn.beheer = () => {
  const d = S.d, v = S.vme;
  const kavelRijen = d.kavels.map((k) => `<tr>${cel(k.kavelnummer)}${cel(k.soort)}${cel(k.verdieping)}${cel(d.eigenaars.filter((e) => e.kavel_id === k.id).map((e) => e.naam).join(', ') || '— geen eigenaar —')}</tr>`);
  const kavelOpties = d.kavels.map((k) => `<option value="${k.id}">${esc(k.kavelnummer)}</option>`).join('');
  const rooster = d.sleutels.length && d.kavels.length ? `<form id="fa"><div class="schuif"><table><thead><tr><th>Kavel</th>${d.sleutels.map((s) => `<th class="n">${esc(s.code)} ${esc(s.naam)}</th>`).join('')}</tr></thead><tbody>
      ${d.kavels.map((k) => `<tr>${cel(k.kavelnummer)}${d.sleutels.map((s) => `<td class="n"><input class="smal" inputmode="decimal" name="a|${s.id}|${k.id}" value="${esc(String(Number(d.aandelen.find((a) => a.kavel_id === k.id && a.verdeelsleutel_id === s.id)?.aandeel ?? '') || '').replace('.', ','))}"></td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td>Totaal volgens akte</td>${d.sleutels.map((s) => `<td class="n"><input class="smal" inputmode="decimal" name="t|${s.id}" required value="${esc(String(Number(s.totaal_aandelen)).replace('.', ','))}"></td>`).join('')}</tr>
      </tbody></table></div><p class="klein">Laat een vak leeg als de kavel niet meedeelt in die sleutel. Kosten die al geboekt zijn, veranderen niet mee.</p><p><button>Aandelen opslaan</button></p></form>` : '<p class="leeg">Voeg eerst kavels en een verdeelsleutel toe.</p>';
  return `<div class="kaart"><h3 style="margin-top:0">Gegevens van de VME</h3>
      <form id="fv"><div class="rij">${veld('Naam', inp('naam', `required value="${esc(v.naam)}"`), '3 1 260px')}${veld('Ondernemingsnummer', inp('ond', `value="${esc(v.ondernemingsnummer ?? '')}"`))}</div>
      <div class="rij">${veld('Straat en nummer', inp('straat', `value="${esc(v.adres_straat ?? '')}"`), '3 1 260px')}${veld('Postcode', inp('postcode', `value="${esc(v.postcode ?? '')}"`))}${veld('Gemeente', inp('gemeente', `value="${esc(v.gemeente ?? '')}"`))}</div>
      <p><button>Opslaan</button></p></form></div>
    <div class="kaart"><h3 style="margin-top:0">Kavels</h3>${tabel(['Kavel', 'Soort', 'Verdieping', 'Eigenaar vandaag'], kavelRijen)}
      <h3>Kavel toevoegen</h3><form id="fk"><div class="rij">${veld('Kavelnummer', inp('nummer', 'required placeholder="bv. App 1"'))}${veld('Soort', kies('soort', SOORTEN.map((s) => `<option>${s}</option>`).join('')))}${veld('Verdieping', inp('verdieping'))}</div><p><button>Kavel toevoegen</button></p></form></div>
    <div class="kaart"><h3 style="margin-top:0">Eigenaar instellen of wisselen</h3>
      <p class="klein">De vorige eigenaar van de kavel stopt de dag vóór de gekozen datum. Kies een bestaand contact of vul een nieuw in.</p>
      ${d.kavels.length ? `<form id="fe"><div class="rij">${veld('Kavel', kies('kavel', kavelOpties))}${veld('Bestaand contact', kies('contact', '<option value="">— nieuw contact —</option>', 'id="contacten"'), '2 1 220px')}${veld('Eigenaar vanaf', inp('datum', `type="date" required value="${vandaag()}"`))}</div>
      <div class="rij">${veld('Nieuw: soort', kies('soort', '<option value="persoon">persoon</option><option value="vennootschap">vennootschap</option>'))}${veld('Voornaam', inp('voornaam'))}${veld('Naam of bedrijfsnaam', inp('achternaam'), '2 1 220px')}${veld('E-mail', inp('email', 'type="email"'), '2 1 220px')}</div>
      <p><button>Eigenaar instellen</button></p></form>` : '<p class="leeg">Voeg eerst een kavel toe.</p>'}</div>
    <div class="kaart"><h3 style="margin-top:0">Verdeelsleutels en aandelen</h3>${rooster}
      <h3>Verdeelsleutel toevoegen</h3><form id="fs"><div class="rij">${veld('Code', inp('code', 'required placeholder="bv. 1.0"'))}${veld('Naam', inp('naam', 'required placeholder="bv. Basisakte"'), '2 1 220px')}${veld('Totaal aandelen', inp('totaal', 'required inputmode="decimal" placeholder="bv. 1000"'))}
      ${veld('Basisakte?', kies('basis', `<option value="nee">nee</option><option value="ja"${d.sleutels.some((s) => s.is_basisakte) ? ' disabled' : ''}>ja</option>`))}</div><p><button>Sleutel toevoegen</button></p></form></div>
    <div class="kaart"><h3 style="margin-top:0">Rekeningen</h3>
      <details><summary>${d.rekeningen.length} rekeningen tonen</summary>${tabel(['Nummer', 'Naam'], d.rekeningen.map((r) => `<tr>${cel(r.nummer)}${cel(r.naam)}</tr>`))}</details>
      <form id="fr"><div class="rij" style="margin-top:10px">${veld('Nummer', inp('nummer', 'required inputmode="numeric" placeholder="bv. 610500"'))}${veld('Naam', inp('naam', 'required'), '3 1 260px')}</div>
      <p><button>Rekening toevoegen</button> <button type="button" class="stil" id="std">Standaardrekeningen klaarzetten</button></p></form></div>`;
};

UIT.bind.beheer = () => {
  const v = S.vme, basis = { kantoor_id: S.kantoor.id, vme_id: v.id };
  // de contactenlijst komt apart binnen, zodat het tabblad niet moet wachten
  const lijst = document.getElementById('contacten');
  if (lijst) q(sb.from('contact').select('id, voornaam, achternaam, bedrijfsnaam').order('achternaam')).then((cs) => {
    lijst.insertAdjacentHTML('beforeend', cs.map((c) => `<option value="${c.id}">${esc(contactNaam(c))}</option>`).join(''));
  }).catch(() => {});

  bijVerzenden('fv', async (f) => {
    await q(sb.from('vme').update({ naam: f.naam.value.trim(), ondernemingsnummer: ondNr(f.ond.value), adres_straat: ofNull(f.straat.value), postcode: ofNull(f.postcode.value), gemeente: ofNull(f.gemeente.value) }).eq('id', v.id));
    await ververs('Gegevens opgeslagen.');
  });
  bijVerzenden('fk', async (f) => {
    let [gebouw] = await q(sb.from('gebouw').select('id').eq('vme_id', v.id).order('naam'));
    if (!gebouw) gebouw = await q(sb.from('gebouw').insert({ ...basis, naam: v.naam }).select('id').single());
    await q(sb.from('kavel').insert({ ...basis, gebouw_id: gebouw.id, kavelnummer: f.nummer.value.trim(), soort: f.soort.value, verdieping: ofNull(f.verdieping.value) }));
    await ververs(`Kavel ${f.nummer.value.trim()} toegevoegd.`);
  });
  bijVerzenden('fe', async (f) => {
    let contact = f.contact.value;
    if (!contact) {
      const naam = f.achternaam.value.trim(); if (!naam) throw new Error('Kies een bestaand contact of vul de naam van een nieuw contact in.');
      const nieuw = f.soort.value === 'persoon' ? { soort: 'persoon', voornaam: ofNull(f.voornaam.value), achternaam: naam } : { soort: 'vennootschap', bedrijfsnaam: naam };
      contact = (await q(sb.from('contact').insert({ kantoor_id: S.kantoor.id, ...nieuw, emails: f.email.value.trim() ? [f.email.value.trim()] : [] }).select('id').single())).id;
    }
    await q(sb.rpc('wissel_eigenaar', { p_kavel: f.kavel.value, p_contact: contact, p_datum: f.datum.value }));
    await ververs('Eigenaar ingesteld.');
  });
  bijVerzenden('fs', async (f) => {
    const totaal = getal(f.totaal.value); if (!totaal || totaal <= 0) throw new Error('Vul het totaal aantal aandelen in.');
    await q(sb.from('verdeelsleutel').insert({ ...basis, code: f.code.value.trim(), naam: f.naam.value.trim(), totaal_aandelen: totaal, is_basisakte: f.basis.value === 'ja' }));
    await ververs(`Sleutel ${f.code.value.trim()} toegevoegd. Vul nu de aandelen per kavel in.`);
  });
  bijVerzenden('fa', async (f) => {
    const bewaren = [], wissen = [];
    for (const el of f.querySelectorAll('input')) {
      const [soort, sleutel, kavel] = el.name.split('|'), n = getal(el.value);
      if (soort === 't') {
        if (!n || n <= 0) throw new Error('Het totaal volgens de akte moet groter dan nul zijn.');
        if (n !== Number(S.d.sleutels.find((s) => s.id === sleutel).totaal_aandelen)) await q(sb.from('verdeelsleutel').update({ totaal_aandelen: n }).eq('id', sleutel));
      } else if (n && n > 0) bewaren.push({ ...basis, verdeelsleutel_id: sleutel, kavel_id: kavel, aandeel: n });
      else if (S.d.aandelen.some((a) => a.verdeelsleutel_id === sleutel && a.kavel_id === kavel)) wissen.push([sleutel, kavel]);
    }
    if (bewaren.length) await q(sb.from('sleutel_aandeel').upsert(bewaren, { onConflict: 'verdeelsleutel_id,kavel_id' }));
    for (const [sleutel, kavel] of wissen) await q(sb.from('sleutel_aandeel').delete().eq('verdeelsleutel_id', sleutel).eq('kavel_id', kavel));
    await ververs('Aandelen opgeslagen. Kijk onder Overzicht of elke sleutel sluit.');
  });
  bijVerzenden('fr', async (f) => {
    await q(sb.from('grootboekrekening').insert({ ...basis, nummer: f.nummer.value.trim(), naam: f.naam.value.trim() }));
    await ververs(`Rekening ${f.nummer.value.trim()} toegevoegd.`);
  });
  const std = document.getElementById('std');
  if (std) std.onclick = async () => {
    try { await q(sb.rpc('zet_basisrekeningen', { p_vme: v.id })); const n = await q(sb.rpc('zet_standaardkosten', { p_vme: v.id })); await ververs(`Standaardrekeningen staan klaar (${n} kostenrekeningen toegevoegd).`); }
    catch (e) { fout(e); schermVme(); }
  };
};

// =============================================================================
// Tabblad Bank: rekeningen, CODA inlezen, bewegingen boeken, afschriften
// =============================================================================
UIT.fn.bank = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.bank = async () => {
  const v = S.vme, d = S.d, doel = document.getElementById('tabinhoud');
  let rekeningen, open, afschriften;
  try {
    [rekeningen, open, afschriften] = await Promise.all([
      q(sb.from('bankrekening').select('id, iban, omschrijving, soort').eq('vme_id', v.id).order('iban')),
      q(sb.from('v_bank_te_boeken').select('*').eq('vme_id', v.id).order('boekdatum').order('bedrag', { ascending: false })),
      q(sb.from('v_bankafschrift_aansluiting').select('volgnummer, datum_nieuw, saldo_oud, saldo_nieuw, sluit_aan').eq('vme_id', v.id).order('datum_nieuw', { ascending: false })),
    ]);
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;   // intussen naar een ander tabblad gegaan

  const kanBoeken = S.bj && !S.bj.afgesloten;
  const boekOpties = `<optgroup label="Betaling aan leverancier">${d.leveranciers.map((l) => `<option value="l:${l.id}">${esc(l.naam)}</option>`).join('')}</optgroup>
    <optgroup label="Mede-eigenaar (kavel)">${d.kavels.map((k) => `<option value="k:${k.id}">${esc(k.kavelnummer)}</option>`).join('')}</optgroup>
    <optgroup label="Kost, verdeeld over sleutel">${d.sleutels.map((s) => `<option value="s:${s.id}">${esc(s.code)} ${esc(s.naam)}</option>`).join('')}</optgroup>`;
  const kostOpties = d.rekeningen.filter((r) => r.nummer.startsWith('6')).map((r) => `<option value="${esc(r.nummer)}">${esc(r.nummer)} ${esc(r.naam)}</option>`).join('');
  const beweging = (b) => `<form class="bw" data-id="${b.bankbeweging_id}" style="border-top:1px solid var(--l);padding:10px 0">
      <div><b>${eur(b.bedrag)}</b> · ${dat(b.boekdatum)} · ${esc(b.tegenpartij_naam ?? 'onbekend')}</div>
      <div class="klein">${esc(b.mededeling ?? '')}</div>
      ${!kanBoeken ? '' : b.voorstel ? `<p style="margin:8px 0 0"><button data-punt="1">Afpunten op kavel ${esc(b.voorstel_kavel)}</button></p>`
        : `<div class="rij" style="margin-top:8px">${veld('Boeken op', kies('doel', boekOpties))}${veld('Kostenrekening (enkel bij kost)', kies('rekening', kostOpties))}<div style="flex:0 0 auto"><button>Boeken</button></div></div>`}</form>`;
  const metVoorstel = open.filter((b) => b.voorstel).length;

  doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Bankrekeningen</h3>${tabel(['IBAN', 'Omschrijving', 'Soort'], rekeningen.map((r) => `<tr>${cel(r.iban)}${cel(r.omschrijving)}${cel(r.soort)}</tr>`))}
      <form id="fb"><div class="rij" style="margin-top:10px">${veld('IBAN', inp('iban', 'required placeholder="BE.."'), '2 1 220px')}${veld('Omschrijving', inp('oms', 'placeholder="bv. Zichtrekening"'), '2 1 220px')}${veld('Soort', kies('soort', '<option>werkkapitaal</option><option>reservekapitaal</option><option>andere</option>'))}</div><p><button>Bankrekening toevoegen</button></p></form></div>
    <div class="kaart"><h3 style="margin-top:0">CODA-bestanden inlezen</h3>
      <p class="klein">Kies één of meer CODA-bestanden van de bank. Elk bestand wordt eerst nagerekend (oud saldo + bewegingen = nieuw saldo). Een afschrift dat al ingelezen is, wordt overgeslagen.</p>
      <input type="file" id="coda" multiple><div id="codauit"></div></div>
    <div class="kaart"><h3 style="margin-top:0">Te boeken bewegingen (${open.length})</h3>
      ${!kanBoeken && open.length ? '<p class="leeg">Kies een open boekjaar om te boeken.</p>' : ''}
      ${metVoorstel > 1 && kanBoeken ? `<p><button id="alles">Alle ${metVoorstel} betalingen met herkende mededeling afpunten</button></p>` : ''}
      ${open.map(beweging).join('') || '<p class="leeg">Alles is geboekt.</p>'}</div>
    <div class="kaart"><h3 style="margin-top:0">Afschriften</h3>${tabel(['Nr', 'Datum', '#Oud saldo', '#Nieuw saldo', 'Sluit aan op vorig'], afschriften.map((a) => `<tr>${cel(a.volgnummer)}${cel(dat(a.datum_nieuw))}${celN(a.saldo_oud)}${celN(a.saldo_nieuw)}<td>${a.sluit_aan ? '<span class="pil ok">ja</span>' : '<span class="pil fout">nee</span>'}</td></tr>`))}</div>`;

  bijVerzenden('fb', async (f) => {
    await q(sb.from('bankrekening').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, iban: iban(f.iban.value), omschrijving: ofNull(f.oms.value), soort: f.soort.value }));
    S.bericht = { soort: 'ok', tekst: 'Bankrekening toegevoegd.' }; schermVme();
  });

  // CODA: het bestand wordt in de browser gelezen en nagerekend (coda.mjs), daarna per afschrift doorgestuurd.
  document.getElementById('coda').onchange = async (ev) => {
    const uit = document.getElementById('codauit'), regels = [];
    for (const bestand of ev.target.files) {
      try {
        const tekst = new TextDecoder('latin1').decode(await bestand.arrayBuffer());
        for (const a of leesCoda(tekst)) {
          const status = await q(sb.rpc('laad_afschrift', { p_vme: v.id, p_bron: bestand.name, p_afschrift: {
            iban: a.iban, volgnummer: a.volgnummer, datumOud: a.datumOud, saldoOud: codaBedrag(a.saldoOud), datumNieuw: a.datumNieuw, saldoNieuw: codaBedrag(a.saldoNieuw),
            bewegingen: a.bewegingen.map((b) => ({ volgnummer: b.volgnummer, boekdatum: b.boekdatum, valutadatum: b.valutadatum, bedrag: codaBedrag(b.centen),
              naam: b.tegenpartij.naam, rekening: b.tegenpartij.rekening, bic: b.tegenpartij.bic, mededeling: [b.mededeling, ...b.info].filter(Boolean).join(' | ') || null,
              ogm: b.ogm, transactiecode: b.transactiecode, bankreferentie: b.bankreferentie || null })) } }));
          regels.push(`<div class="melding ${status === 'ingeladen' ? 'ok' : ''}">${esc(bestand.name)}: afschrift ${a.volgnummer} ${status}${status === 'ingeladen' ? ` (${a.bewegingen.length} bewegingen)` : ''}.</div>`);
        }
      } catch (e) { regels.push(`<div class="melding fout">${esc(bestand.name)}: ${esc(e.message)}</div>`); }
      uit.innerHTML = regels.join('');
    }
    if (regels.some((r) => r.includes('ingeladen'))) uit.insertAdjacentHTML('beforeend', '<p><button id="herlaad">Bewegingen tonen</button></p>');
    const herlaad = document.getElementById('herlaad'); if (herlaad) herlaad.onclick = () => schermVme();
  };

  const puntAf = (id) => q(sb.rpc('punt_af_via_ogm', { p_bankbeweging: id, p_boekjaar: S.bj.id, p_dagboek: 'F1' }));
  doel.querySelectorAll('form.bw').forEach((f) => {
    f.onsubmit = async (ev) => {
      ev.preventDefault(); f.querySelectorAll('button').forEach((k) => { k.disabled = true; });
      try {
        await zorgBasis();
        if (f.querySelector('[data-punt]')) { await puntAf(f.dataset.id); return await klaar('Betaling afgepunt op de kavel.'); }
        const [soort, id] = [f.doel.value.slice(0, 1), f.doel.value.slice(2)];
        await q(sb.rpc('boek_bankbeweging', { p_bankbeweging: f.dataset.id, p_boekjaar: S.bj.id, p_dagboek: 'F1',
          p_tegenrekening: soort === 'l' ? '440000' : soort === 'k' ? '400000' : f.rekening.value,
          p_leverancier: soort === 'l' ? id : null, p_kavel: soort === 'k' ? id : null, p_sleutel: soort === 's' ? id : null }));
        await klaar('Beweging geboekt.');
      } catch (e) { fout(e); schermVme(); }
    };
  });
  const alles = document.getElementById('alles');
  if (alles) alles.onclick = async () => {
    alles.disabled = true; let n = 0;
    try { await zorgBasis(); for (const b of open.filter((x) => x.voorstel)) { await puntAf(b.bankbeweging_id); n++; } await klaar(`${n} betalingen afgepunt.`); }
    catch (e) { fout({ message: `${n} afgepunt, daarna: ${e.message}` }); await laadBoekjaar(); schermVme(); }
  };
};

// =============================================================================
// Tabblad Boekjaar: boekjaren, afsluiten, openstaande saldi, herinneringen
// =============================================================================
UIT.fn.jaar = () => '<div id="tabinhoud"><p class="leeg">Laden…</p></div>';
UIT.bind.jaar = async () => {
  const v = S.vme, d = S.d, bj = S.bj, doel = document.getElementById('tabinhoud');
  const kavelNr = Object.fromEntries(d.kavels.map((k) => [k.id, k.kavelnummer]));
  let controle = [], openstaand = [], herinneringen = [];
  try {
    [controle, openstaand, herinneringen] = await Promise.all([
      bj && !bj.afgesloten ? q(sb.rpc('boekjaar_afsluit_controle', { p_boekjaar: bj.id })) : [],
      bj ? q(sb.from('v_openstaand_kavel').select('kavelnummer, opgevraagd, betaald, openstaand').eq('boekjaar_id', bj.id).order('kavelnummer')) : [],
      q(sb.from('herinnering').select('kavel_id, datum, niveau, bedrag, verstuurd_op').eq('vme_id', v.id).order('datum', { ascending: false })),
    ]);
  } catch (e) { doel.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(doel)) return;

  const dagNa = (iso) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + 1); return t.toLocaleDateString('sv-SE'); };
  const laatste = d.jaren[0];   // de lijst staat van nieuw naar oud
  const fouten = controle.filter((c) => c.ernst === 'fout').length;
  const jaarForm = (id, start, titel, knop) => `<h3>${titel}</h3><form id="${id}"><div class="rij">${veld('Omschrijving', inp('oms', `required value="${esc(start.slice(0, 4))}"`))}${veld('Van', inp('start', `type="date" required value="${start}"`))}${veld('Tot en met', inp('eind', `type="date" required value="${start.slice(0, 4)}-12-31"`))}</div><p><button>${knop}</button></p></form>`;

  doel.innerHTML = `<div class="kaart"><h3 style="margin-top:0">Boekjaren</h3>
      ${tabel(['Boekjaar', 'Van', 'Tot en met', 'Status'], d.jaren.map((j) => `<tr>${cel(j.omschrijving)}${cel(dat(j.start_datum))}${cel(dat(j.eind_datum))}<td>${j.afgesloten ? '<span class="pil">afgesloten</span>' : '<span class="pil ok">open</span>'}</td></tr>`))}
      ${!laatste ? jaarForm('fj', `${new Date().getFullYear()}-01-01`, 'Eerste boekjaar aanmaken', 'Boekjaar aanmaken') : ''}
      ${laatste?.afgesloten ? jaarForm('fo', dagNa(laatste.eind_datum), `Nieuw boekjaar openen na ${esc(laatste.omschrijving)}`, 'Boekjaar openen') + '<p class="klein">De balans van het afgesloten boekjaar wordt overgenomen als openingsbalans.</p>' : ''}</div>
    ${bj && !bj.afgesloten ? `<div class="kaart"><h3 style="margin-top:0">Boekjaar ${esc(bj.omschrijving)} afsluiten</h3>
      ${controle.map((c) => `<p><span class="pil ${c.ernst === 'fout' ? 'fout' : 'warn'}">${esc(c.ernst)}</span> ${esc(c.melding)}</p>`).join('') || '<p><span class="pil ok">in orde</span> Niets houdt de afsluiting tegen.</p>'}
      <p class="klein">Afsluiten rekent de kosten door aan de kavels, verrekent de opgevraagde voorschotten en zet het boekjaar op slot. Dat kan niet ongedaan gemaakt worden.</p>
      <form id="fz"><p><label style="display:inline"><input type="checkbox" required style="width:auto"> Ik weet dat afsluiten definitief is.</label></p><p><button${fouten ? ' disabled' : ''}>Boekjaar afsluiten</button></p></form></div>` : ''}
    <div class="kaart"><h3 style="margin-top:0">Stand per kavel ${esc(bj?.omschrijving ?? '')}</h3>
      ${tabel(['Kavel', '#Opgevraagd', '#Betaald', '#Open'], openstaand.map((o) => `<tr>${cel(o.kavelnummer)}${celN(o.opgevraagd)}${celN(o.betaald)}${celN(o.openstaand)}</tr>`), openstaand.length ? `<tr class="tot"><td>Totaal</td>${celN(som(openstaand, (o) => o.opgevraagd))}${celN(som(openstaand, (o) => o.betaald))}${celN(som(openstaand, (o) => o.openstaand))}</tr>` : '')}</div>
    <div class="kaart"><h3 style="margin-top:0">Herinneringen</h3>
      <p class="klein">Maakt een herinnering voor elke kavel met een vervallen, onbetaalde provisie; hoogstens één per 15 dagen en drie in totaal. In deze testversie wordt nog niets verstuurd.</p>
      <p><button id="herinner">Herinneringen aanmaken</button></p>
      ${tabel(['Kavel', 'Datum', 'Niveau', '#Bedrag', 'Verstuurd'], herinneringen.map((h) => `<tr>${cel(kavelNr[h.kavel_id])}${cel(dat(h.datum))}${cel(h.niveau)}${celN(h.bedrag)}${cel(h.verstuurd_op ? dat(h.verstuurd_op) : 'nog niet')}</tr>`))}</div>`;

  bijVerzenden('fj', async (f) => {
    await q(sb.from('boekjaar').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, omschrijving: f.oms.value.trim(), start_datum: f.start.value, eind_datum: f.eind.value }));
    await ververs('Boekjaar aangemaakt.');
  });
  bijVerzenden('fo', async (f) => {
    await zorgBasis();
    await q(sb.rpc('open_boekjaar', { p_vorig: laatste.id, p_omschrijving: f.oms.value.trim(), p_start: f.start.value, p_eind: f.eind.value }));
    S.bj = null; await ververs('Nieuw boekjaar geopend met de openingsbalans.');
  });
  bijVerzenden('fz', async () => {
    await zorgBasis();
    await q(sb.rpc('sluit_boekjaar', { p_boekjaar: bj.id }));
    await ververs(`Boekjaar ${bj.omschrijving} is afgesloten.`);
  });
  document.getElementById('herinner').onclick = async () => {
    try { const n = await q(sb.rpc('maak_herinneringen', { p_vme: v.id })); S.bericht = { soort: 'ok', tekst: n ? `${n} herinnering(en) aangemaakt.` : 'Geen vervallen provisies die een nieuwe herinnering vragen.' }; }
    catch (e) { fout(e); }
    schermVme();
  };
};
