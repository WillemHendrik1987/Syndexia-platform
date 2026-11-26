// =============================================================================
// Syndexia Platform - AI-boekhouder.
//
// Je geeft een opdracht in gewone taal en/of een factuur (pdf of foto). De vraag
// gaat naar de Edge Function "ai-boekhouder" op Supabase; die laat Claude het
// document lezen en geeft een boekingsvoorstel terug dat al nagekeken is tegen de
// rekeningen, sleutels en kavels van deze VME. Er wordt niets geboekt tot jij op
// "Boeken" klikt. Een rappel of aanmaning krijgt nooit een boekknop.
// =============================================================================
UIT.tabs.push(['ai', 'AI-boekhouder']);
UIT.fn.ai = () => (!S.bj || S.bj.afgesloten ? '<div class="kaart"><p class="leeg">Kies een open boekjaar om met de AI-boekhouder te werken.</p></div>' : `<div class="kaart"><h3 style="margin-top:0">AI-boekhouder</h3>
    <p class="klein">Laad een factuur op (pdf, jpg of png, hoogstens 5 MB) en/of beschrijf wat er geboekt moet worden. Je krijgt een voorstel dat je nakijkt; pas als jij op Boeken klikt, wordt er geboekt. Het document wordt daarvoor naar de Claude API van Anthropic gestuurd.</p>
    <form id="fai"><label>Opdracht (mag leeg blijven als je een document oplaadt)</label>
      <textarea name="vraag" rows="3" style="width:100%;padding:9px 10px;border:1px solid var(--l);border-radius:8px;font:inherit" placeholder="bv. Boek deze factuur van de liftfirma op de sleutel van de lift, periode 11/2026"></textarea>
      <p><input type="file" name="bestand" accept="application/pdf,image/jpeg,image/png,image/webp"></p>
      <p><button>Voorstel vragen</button></p></form><div id="aiuit"></div></div>`);

UIT.bind.ai = () => {
  const f = document.getElementById('fai'); if (!f) return;
  const uit = document.getElementById('aiuit'), v = S.vme, d = S.d;
  const mis = (tekst) => { uit.innerHTML = `<div class="melding fout">${esc(tekst)}</div>`; };
  const alsBase64 = (bestand) => new Promise((klaar, fout) => { const l = new FileReader(); l.onload = () => klaar(String(l.result).split(',')[1]); l.onerror = () => fout(new Error('Het bestand kon niet gelezen worden.')); l.readAsDataURL(bestand); });

  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const knop = f.querySelector('button'), bestand = f.bestand.files[0];
    if (!bestand && !f.vraag.value.trim()) return mis('Geef een opdracht of laad een document op.');
    if (bestand && bestand.size > 5 * 1024 * 1024) return mis('Het document is groter dan 5 MB.');
    knop.disabled = true; uit.innerHTML = '<p class="klein">De AI-boekhouder leest het document… dit duurt meestal 10 tot 30 seconden.</p>';
    try {
      const bijlage = bestand ? { soort: bestand.type, naam: bestand.name, base64: await alsBase64(bestand) } : null;
      const { data, error } = await sb.functions.invoke('ai-boekhouder', { body: { vme_id: v.id, boekjaar_id: S.bj.id, vraag: f.vraag.value, bijlage } });
      if (error) { let tekst = error.message; try { tekst = (await error.context.json()).fout ?? tekst; } catch (e) { /* geen uitleg van de functie */ } throw new Error(tekst); }
      toonVoorstel(data);
    } catch (e) { mis(e.message); }
    knop.disabled = false;
  };

  function toonVoorstel({ voorstel: p, opmerkingen }) {
    if (!p) return mis(opmerkingen.join(' '));
    const twijfels = (p.twijfels ?? []).map((t) => `<p><span class="pil warn">twijfel</span> ${esc(t)}</p>`).join('');
    if (p.soort === 'rappel') { uit.innerHTML = `<div class="melding fout"><b>Dit is een rappel of aanmaning en wordt niet geboekt.</b> Laad de oorspronkelijke factuur op om ze te boeken.</div><p>${esc(p.uitleg)}</p>${twijfels}`; return; }
    if (p.soort === 'onduidelijk') { uit.innerHTML = `<div class="melding">Hier valt niets te boeken.</div><p>${esc(p.uitleg)}</p>${twijfels}`; return; }
    const rek = (nummer) => d.rekeningen.find((r) => r.nummer === nummer);
    uit.innerHTML = `<div class="melding">${p.soort === 'creditnota' ? 'Creditnota' : 'Factuur'} <b>${esc(p.factuurnummer ?? 'zonder nummer')}</b> van <b>${esc(p.leverancier_naam ?? 'onbekend')}</b>${p.leverancier_ondernemingsnummer ? ` (${esc(p.leverancier_ondernemingsnummer)})` : ''} · ${dat(p.factuurdatum)} · <b>${eur(p.totaal)}</b></div>
      <p>${esc(p.uitleg)}</p>${twijfels}
      ${opmerkingen.map((o) => `<p><span class="pil fout">klopt niet</span> ${esc(o)}</p>`).join('')}
      ${tabel(['Rekening', 'Verdeling', 'Periode', '#Bedrag', '#Waarvan btw'], p.lijnen.map((l) => `<tr>${cel(`${l.rekening} ${rek(l.rekening)?.naam ?? ''}`)}${cel(l.sleutel ? `sleutel ${l.sleutel}` : `kavel ${l.kavel}`)}${cel(l.periode)}${celN(l.bedrag)}${celN(l.btw)}</tr>`))}
      ${opmerkingen.length ? '<p class="klein">Dit voorstel kan zo niet geboekt worden. Pas je opdracht aan of boek de factuur met de hand onder Kosten.</p>' : `<p><button type="button" id="aiboek">Boeken</button> <span class="klein">Kijk rekening, verdeling en bedragen na voor je boekt. Boeken kan niet ongedaan gemaakt worden.</span></p>`}`;
    const boek = document.getElementById('aiboek'); if (!boek) return;
    boek.onclick = async () => {
      boek.disabled = true;
      try {
        // leverancier: eerst op ondernemingsnummer, dan op exacte naam, anders nieuw
        const ond = ondNr(p.leverancier_ondernemingsnummer);
        let [lev] = ond ? await q(sb.from('leverancier').select('id, naam').eq('ondernemingsnummer', ond)) : [];
        if (!lev) [lev] = await q(sb.from('leverancier').select('id, naam').ilike('naam', p.leverancier_naam));
        if (!lev) lev = await q(sb.from('leverancier').insert({ kantoor_id: S.kantoor.id, naam: p.leverancier_naam, ondernemingsnummer: /^BE\d{10}$/.test(ond ?? '') ? ond : null }).select('id, naam').single());
        if (p.factuurnummer) {
          const dubbel = await q(sb.from('boeking').select('id').eq('vme_id', v.id).eq('leverancier_id', lev.id).eq('document_ref', p.factuurnummer));
          if (dubbel.length) throw new Error(`Factuur ${p.factuurnummer} van ${lev.naam} is al geboekt.`);
        }
        await zorgBasis();
        await q(sb.rpc('boek_aankoopfactuur', { p_boekjaar: S.bj.id, p_dagboek: 'A1', p_leverancier: lev.id, p_datum: p.factuurdatum, p_document_ref: p.factuurnummer ?? null, p_omschrijving: lev.naam,
          p_lijnen: p.lijnen.map((l) => ({ rekening: l.rekening, sleutel: l.sleutel, kostkavel: l.kavel, bedrag: l.bedrag, btw: l.btw, omschrijving: l.periode })) }));
        await naBoeking(`Geboekt op voorstel van de AI-boekhouder: ${eur(p.totaal)} van ${lev.naam}.`);
      } catch (e) { fout(e); schermVme(); }
    };
  }
};
