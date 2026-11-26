// =============================================================================
// Syndexia Platform - schademeldingen via een QR-code per gebouw.
//
// OPENBAAR (zonder login)
//   #/meld/<code>      het meldformulier dat een bewoner opent door de QR-code te scannen
//   #/aanvaard/<code>  de pagina waar een leverancier bevestigt dat hij een interventie aanneemt
//   Beide praten alleen met de Edge Function "melding"; ze lezen nooit zelf in de databank.
// VOOR HET KANTOOR (in het tabblad Dossiers)
//   de QR-code en affiche van het gebouw, en per categorie welke leverancier een dringende
//   melding krijgt.
// =============================================================================
const MELD_CAT = ['lift', 'water en sanitair', 'elektriciteit', 'verwarming', 'dak en gevel', 'deuren, poort en sloten', 'gemene delen en schoonmaak', 'andere'];
const meldRoep = async (opties) => {
  const { data, error } = await sb.functions.invoke('melding', opties);
  if (error) { let tekst = 'Er liep iets mis. Probeer het opnieuw.'; try { tekst = (await error.context.json()).fout ?? tekst; } catch (e) { /* geen uitleg */ } throw new Error(tekst); }
  return data;
};
// Verkleint een foto in de browser (langste zijde 1600 px, jpeg) zodat ze vlot doorgestuurd raakt.
const meldFoto = (bestand) => new Promise((klaar, mis) => {
  const beeld = new Image(), url = URL.createObjectURL(bestand);
  beeld.onload = () => {
    const schaal = Math.min(1, 1600 / Math.max(beeld.width, beeld.height)), doek = document.createElement('canvas');
    doek.width = Math.round(beeld.width * schaal); doek.height = Math.round(beeld.height * schaal);
    doek.getContext('2d').drawImage(beeld, 0, 0, doek.width, doek.height); URL.revokeObjectURL(url);
    klaar({ type: 'image/jpeg', data: doek.toDataURL('image/jpeg', 0.8).split(',')[1] });
  };
  beeld.onerror = () => { URL.revokeObjectURL(url); mis(new Error(`${bestand.name} is geen foto die deze browser kan lezen.`)); };
  beeld.src = url;
});

UIT.openbaar = () => {
  const [, deel, code] = location.hash.split('/');
  if (deel === 'meld' && code) { schermMeld(code); return true; }
  if (deel === 'aanvaard' && code) { schermAanvaard(code); return true; }
  return false;
};

async function schermMeld(code) {
  document.getElementById('wie').innerHTML = '';
  toon('<p class="leeg">Laden…</p>');
  let gebouw;
  try { gebouw = await (await fetch(`${SB_URL}/functions/v1/melding?token=${encodeURIComponent(code)}`, { headers: { apikey: SB_KEY } })).json(); } catch (e) { gebouw = { fout: 'Geen verbinding. Probeer het opnieuw.' }; }
  if (gebouw.fout) return toon(`<div class="kaart" style="max-width:520px;margin:30px auto"><h2>Melding</h2><p>${esc(gebouw.fout)}</p></div>`);
  toon(`<div class="kaart" style="max-width:560px;margin:20px auto"><h2 style="margin-bottom:2px">Schade of defect melden</h2>
    <p class="klein" style="margin-top:0"><b>${esc(gebouw.naam)}</b>${gebouw.adres ? ` · ${esc(gebouw.adres)}` : ''}</p>
    <p><span class="pil fout">gevaar?</span> Bij brand, gasgeur of gevaar voor personen belt u eerst <b>112</b>.</p>
    <form id="fmeld"><label>Uw naam</label><input name="naam" required maxlength="120" autocomplete="name">
      <label>E-mailadres of telefoonnummer</label><input name="contact" required maxlength="160">
      <label>Waar in het gebouw? (bv. appartement, verdieping, garage)</label><input name="plaats" maxlength="160">
      <label>Waarover gaat het?</label><select name="categorie">${(gebouw.categorieen ?? MELD_CAT).map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <label>Wat is het probleem?</label><textarea name="omschrijving" rows="5" required minlength="10" maxlength="4000" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit"></textarea>
      <label>Foto's (hoogstens 3)</label><input type="file" name="fotos" accept="image/*" multiple>
      <p><label style="display:inline"><input type="checkbox" name="dringend" style="width:auto"> Dit is dringend (bv. water blijft stromen, iemand zit vast in de lift, geen toegang tot het gebouw)</label></p>
      <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <p><button>Melding versturen</button></p><div id="meldfout"></div>
      <p class="klein">Uw naam en contactgegevens worden alleen gebruikt om deze melding op te volgen en gaan naar de syndicus en, bij een dringende melding, naar de hersteller.</p></form></div>`);
  const f = document.getElementById('fmeld');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const knop = f.querySelector('button'), mis = (t) => { document.getElementById('meldfout').innerHTML = `<div class="melding fout">${esc(t)}</div>`; knop.disabled = false; knop.textContent = 'Melding versturen'; };
    knop.disabled = true; knop.textContent = 'Bezig met versturen…';
    try {
      const bestanden = [...f.fotos.files];
      if (bestanden.length > 3) return mis("Kies hoogstens 3 foto's.");
      const fotos = []; for (const b of bestanden) fotos.push(await meldFoto(b));
      const uit = await meldRoep({ body: { token: code, naam: f.naam.value, contact: f.contact.value, plaats: f.plaats.value, categorie: f.categorie.value, omschrijving: f.omschrijving.value, dringend: f.dringend.checked, website: f.website.value, fotos } });
      toon(`<div class="kaart" style="max-width:520px;margin:30px auto"><h2>Bedankt, uw melding is ontvangen</h2><p>Ze staat geregistreerd onder nummer <b>${esc(uit.nummer)}</b> voor ${esc(gebouw.naam)}.</p>
        <p>${uit.dringend ? (uit.verwittigd ? 'De syndicus en de hersteller zijn per mail verwittigd.' : 'De syndicus is per mail verwittigd.') : 'De syndicus volgt dit op.'}</p>
        <p class="klein">Bij gevaar voor personen belt u altijd eerst 112.</p></div>`);
    } catch (e) { mis(e.message); }
  };
}

async function schermAanvaard(code) {
  document.getElementById('wie').innerHTML = '';
  const kaart = (html) => toon(`<div class="kaart" style="max-width:520px;margin:30px auto">${html}</div>`);
  kaart(`<h2>Interventie aannemen</h2><p>Met de knop hieronder bevestigt u aan de syndicus dat u deze interventie opneemt.</p><p><button id="neem">Ik neem dit aan</button></p>`);
  // Pas bij de klik: een mailprogramma dat links vooraf opent mag de interventie niet per ongeluk aannemen.
  document.getElementById('neem').onclick = async (ev) => {
    ev.target.disabled = true;
    try { const uit = await meldRoep({ body: { aanvaard: code } }); kaart(`<h2>Bedankt</h2><p>${uit.al ? 'Deze interventie was al aangenomen.' : 'De syndicus is verwittigd dat u de interventie opneemt.'}</p><p class="klein">${esc(uit.titel ?? '')}${uit.vme ? ` · ${esc(uit.vme)}` : ''}</p>`); }
    catch (e) { kaart(`<h2>Interventie aannemen</h2><p>${esc(e.message)}</p>`); }
  };
}

// ---- voor het kantoor: QR-code, affiche en herstellers (kaart bovenaan het tabblad Dossiers) ----
const meldLink = () => `${location.origin}/#/meld/${S.vme.meld_token}`;
const meldQr = (tekst, cel = 5) => { const qr = qrcode(0, 'M'); qr.addData(tekst); qr.make(); return qr.createSvgTag({ cellSize: cel, margin: 2, scalable: true }); };
UIT.meldKaart = () => `<style>@media print { body.qrdruk * { visibility: hidden } body.qrdruk #affiche, body.qrdruk #affiche * { visibility: visible } body.qrdruk #affiche { display: block !important; position: absolute; left: 0; top: 0; width: 100%; text-align: center; padding-top: 60px } } #affiche { display: none }</style>
  <div class="kaart"><details id="meldkaart"${S.meldOpen ? ' open' : ''}><summary style="cursor:pointer;font-weight:600">Schademeldingen via QR-code</summary>
    <div class="rij" style="align-items:flex-start;margin-top:10px"><div style="flex:0 0 170px">${meldQr(meldLink())}</div>
      <div style="flex:1 1 260px"><p class="klein">Hang deze code in de inkomhal of de lift. Wie ze scant, kan zonder account een schade of defect melden. De melding wordt een dossier, de AI vat samen en bepaalt of ze dringend is, en jij krijgt een mail. Bij een dringende melding krijgt ook de leverancier van die categorie een mail met een knop om de interventie aan te nemen.</p>
        <p class="klein" style="word-break:break-all">${esc(meldLink())}</p><p><button type="button" class="stil" id="qrdruk">Affiche afdrukken</button></p></div></div>
    <h4>Wie krijgt een dringende melding?</h4><div id="herstellers"><p class="leeg">Laden…</p></div></details></div>
  <div id="affiche"><h1 style="font-size:34px;margin:0 0 6px">Schade of defect?</h1><p style="font-size:20px;margin:0 0 26px">Scan de code en meld het aan de syndicus.</p>
    <div style="width:340px;margin:0 auto">${meldQr(meldLink(), 8)}</div><p style="font-size:18px;margin-top:26px"><b>${esc(S.vme.naam)}</b></p><p style="font-size:15px">Bij gevaar voor personen: bel eerst 112.</p><p style="font-size:13px">${esc(S.kantoor.naam)}</p></div>`;
UIT.meldBind = async (doel, opnieuw) => {
  const v = S.vme, kaart = document.getElementById('meldkaart'), vak = document.getElementById('herstellers');
  kaart.ontoggle = () => { S.meldOpen = kaart.open; };
  document.getElementById('qrdruk').onclick = () => { document.body.classList.add('qrdruk'); window.print(); document.body.classList.remove('qrdruk'); };
  let lijst;
  try { lijst = await q(sb.from('vme_hersteller').select('categorie, leverancier_id').eq('vme_id', v.id)); } catch (e) { vak.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; return; }
  if (!document.body.contains(vak)) return;
  // de fiche bepaalt of er een mail kan vertrekken: zonder e-mailadres wordt niemand verwittigd
  const levs = await q(sb.from('leverancier').select('id, naam, email').order('naam'));
  vak.innerHTML = `<form id="fher">${tabel(['Categorie', 'Leverancier'], MELD_CAT.map((c) => { const nu = lijst.find((h) => h.categorie === c)?.leverancier_id ?? '';
    return `<tr>${cel(c)}<td><select name="h" data-cat="${esc(c)}"><option value="">niemand (alleen het kantoor krijgt een mail)</option>${levs.map((l) => `<option value="${l.id}"${l.id === nu ? ' selected' : ''}>${esc(l.naam)}${l.email ? '' : ' — geen e-mailadres op de fiche'}</option>`).join('')}</select></td></tr>`; }))}
    <p><button class="stil">Herstellers opslaan</button></p></form>`;
  document.getElementById('fher').onsubmit = async (ev) => {
    ev.preventDefault(); S.meldOpen = true;
    try {
      for (const kies1 of ev.target.querySelectorAll('select[name=h]')) {
        const cat = kies1.dataset.cat, was = lijst.find((h) => h.categorie === cat)?.leverancier_id ?? '';
        if (kies1.value === was) continue;
        if (was) await q(sb.from('vme_hersteller').delete().eq('vme_id', v.id).eq('categorie', cat));
        if (kies1.value) await q(sb.from('vme_hersteller').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, categorie: cat, leverancier_id: kies1.value }));
      }
      S.bericht = { soort: 'ok', tekst: 'Herstellers opgeslagen.' };
    } catch (e) { fout(e); }
    opnieuw();
  };
};
