// =============================================================================
// Syndexia Platform - verkoopdossier (inlichtingen art. 3.94 Burgerlijk Wetboek).
//
// Bij de verkoop van een kavel vraagt de notaris of makelaar een vaste lijst inlichtingen
// op. Eén knop stelt die brief samen uit wat in het platform zit: kapitalen uit de balans,
// wat de eigenaar nog moet betalen, de oproepen voor het reservekapitaal, de juridische
// dossiers, de vergaderingen en documenten, zijn afrekeningen en de laatste afgesloten
// balans. Wat het platform niet kan weten, staat er als leeg invulvak: het vult nooit zelf
// "geen" of "nihil" in. Onder elk punt kan je een opmerking typen; die wordt mee afgedrukt.
// =============================================================================
const VK_STIJL = `<style>@media print { body.vkdruk * { visibility: hidden } body.vkdruk #vd, body.vkdruk #vd * { visibility: visible }
  body.vkdruk #vd { position: absolute; left: 0; top: 0; width: 100%; border: 0; box-shadow: none } body.vkdruk #vd textarea, body.vkdruk .geen-druk { display: none !important } }
  #vd .druktekst { display: none; white-space: pre-wrap } @media print { #vd .druktekst { display: block } }
  #vd h4 { margin: 18px 0 6px } #vd textarea { width: 100%; padding: 8px 10px; border: 1px dashed var(--l); border-radius: 8px; font: inherit; margin-top: 6px }</style>`;
const vkPlus = (datum, dagen) => { const d = new Date(datum + 'T12:00:00'); d.setDate(d.getDate() + dagen); return d.toISOString().slice(0, 10); };

UIT.tabs.push(['verkoop', 'Verkoop']);
UIT.fn.verkoop = () => `<div id="tabinhoud">${VK_STIJL}<div class="kaart"><h3 style="margin-top:0">Verkoopdossier klaarzetten</h3>
  <p class="klein">Stelt de inlichtingen samen die notaris of makelaar opvraagt bij de verkoop van een kavel (artikel 3.94 van het Burgerlijk Wetboek). Kijk de brief na voor je hem verstuurt: het platform toont alleen wat erin geboekt of opgeladen is.</p>
  <form id="fv"><div class="rij">${veld('Kavel', kies('kavel', S.d.kavels.map((k) => `<option value="${k.id}">${esc(k.kavelnummer)}</option>`).join('')))}${veld('Datum aanvraag', inp('datum', `type="date" required value="${new Date().toISOString().slice(0, 10)}"`))}${veld('Aanvrager (notaris of makelaar)', inp('aanvrager'), '2 1 240px')}${veld('Referentie aanvrager', inp('ref'))}</div>
    <p><label style="display:inline"><input type="checkbox" name="p1" checked style="width:auto"> §1 vóór de verkoopovereenkomst</label> &nbsp; <label style="display:inline"><input type="checkbox" name="p2" style="width:auto"> §2 bij de akte</label></p>
    <p><button>Verkoopdossier klaarzetten</button></p></form></div><div id="vkuit"></div></div>`;
UIT.bind.verkoop = () => {
  const v = S.vme, d = S.d, f = document.getElementById('fv'), uit = document.getElementById('vkuit');
  if (!d.kavels.length) { f.querySelector('button').disabled = true; return; }
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (!f.p1.checked && !f.p2.checked) { uit.innerHTML = '<div class="melding fout">Vink §1, §2 of beide aan.</div>'; return; }
    uit.innerHTML = '<p class="leeg">Bezig met samenstellen…</p>';
    const kavel = d.kavels.find((k) => k.id === f.kavel.value), datum = f.datum.value;
    try {
      const jaren = [...d.jaren].sort((a, b) => (a.start_datum < b.start_datum ? 1 : -1)), dicht = jaren.filter((j) => j.afgesloten);
      const drieJaar = vkPlus(datum, -3 * 365);
      const [eig, open, balansNu, balansDicht, juridisch, avs, docs, reserveRek] = await Promise.all([
        q(sb.from('v_kavel_eigenaar_vandaag').select('naam').eq('kavel_id', kavel.id)),
        q(sb.from('v_provisie_open').select('boekingslijn_id, datum, vervaldatum, omschrijving, bedrag, betaald, openstaand, ogm').eq('kavel_id', kavel.id).order('datum')),
        jaren[0] ? q(sb.from('v_balans').select('nummer, naam, debet, credit').eq('boekjaar_id', jaren[0].id).order('nummer')) : [],
        dicht[0] ? q(sb.from('v_balans').select('nummer, naam, debet, credit').eq('boekjaar_id', dicht[0].id).order('nummer')) : [],
        q(sb.from('dossier').select('nummer, titel, geopend_op, status').eq('vme_id', v.id).eq('soort', 'juridisch').neq('status', 'afgesloten').order('nummer')),
        q(sb.from('vergadering').select('datum, soort, status').eq('vme_id', v.id).gt('datum', drieJaar).order('datum')),
        q(sb.from('document').select('naam, aangemaakt_op').eq('vme_id', v.id).eq('map', '2. AV - RVME').order('naam')),
        q(sb.from('grootboekrekening').select('id').eq('vme_id', v.id).eq('nummer', '429100')),
      ]);
      // Welke oproepen waren voor het reservekapitaal? Die zijn tegen rekening 429100 geboekt.
      let reserveLijnen = new Set();
      if (open.length && reserveRek.length) {
        const mijn = await q(sb.from('boekingslijn').select('id, boeking_id').in('id', open.map((o) => o.boekingslijn_id)));
        const tegen = await q(sb.from('boekingslijn').select('boeking_id').eq('rekening_id', reserveRek[0].id).in('boeking_id', [...new Set(mijn.map((m) => m.boeking_id))]));
        const boekingen = new Set(tegen.map((t) => t.boeking_id));
        reserveLijnen = new Set(mijn.filter((m) => boekingen.has(m.boeking_id)).map((m) => m.id));
      }
      // Zijn deel in de kosten van de laatste twee afgesloten boekjaren.
      const afr = [];
      for (const j of dicht.slice(0, 2)) {
        try { afr.push({ j, lijnen: (await q(sb.rpc('afrekening_per_eigenaar', { p_boekjaar: j.id }))).filter((r) => r.kavel_id === kavel.id) }); }
        catch (e) { afr.push({ j, fout: e.message }); }
      }
      const saldo = (rijen, nummer) => { const r = rijen.find((x) => x.nummer === nummer); return r ? Number(r.credit) - Number(r.debet) : null; };
      const bedragOf = (b) => (b == null ? '<i>niet geboekt in het platform</i>' : `${eur(b)} euro`);
      const vervallen = open.filter((o) => Number(o.openstaand) && o.vervaldatum && o.vervaldatum < datum), later = open.filter((o) => Number(o.openstaand) && !(o.vervaldatum && o.vervaldatum < datum));
      const reserve = open.filter((o) => reserveLijnen.has(o.boekingslijn_id));
      const oproepTabel = (rijen) => tabel(['Datum', 'Omschrijving', 'Vervalt', '#Bedrag', '#Betaald', '#Openstaand'], rijen.map((o) => `<tr>${cel(dat(o.datum))}${cel(o.omschrijving ?? 'provisie')}${cel(dat(o.vervaldatum))}${celN(o.bedrag)}${celN(o.betaald)}${celN(o.openstaand)}</tr>`));
      const nota = (sleutel, tip) => `<textarea rows="2" data-nota="${sleutel}" placeholder="${esc(tip)}"></textarea><div class="druktekst"></div>`;
      const termijn = vkPlus(datum, f.p1.checked ? 15 : 30);

      const deel1 = !f.p1.checked ? '' : `<h3>Artikel 3.94 §1 — inlichtingen vóór de verkoopovereenkomst</h3>
        <h4>1° Werkkapitaal en reservekapitaal</h4>
        <p>Stand op ${dat(datum)} volgens de boekhouding van de VME (boekjaar ${esc(jaren[0]?.omschrijving ?? '—')}):<br>Vast werkkapitaal (rekening 429200): <b>${bedragOf(saldo(balansNu, '429200'))}</b><br>Reservekapitaal (rekening 429100): <b>${bedragOf(saldo(balansNu, '429100'))}</b></p>
        ${nota('1', 'Opmerking, bv. het aandeel van deze kavel of de periodieke provisie')}
        <h4>2° Door de overdrager verschuldigde achterstallen</h4>
        ${vervallen.length ? `${oproepTabel(vervallen)}<p><b>Vervallen en onbetaald: ${eur(som(vervallen, (o) => o.openstaand))} euro.</b></p>` : '<p>In de boekhouding staat voor deze kavel geen vervallen onbetaald bedrag.</p>'}
        ${later.length ? `<p>Opgevraagd maar nog niet vervallen: ${eur(som(later, (o) => o.openstaand))} euro.</p>` : ''}
        ${nota('2', 'Opmerking, bv. invorderingskosten of de kost van deze inlichtingen')}
        <h4>3° Oproepen tot kapitaalinbreng voor het reservekapitaal waartoe de algemene vergadering al besloot</h4>
        ${reserve.length ? oproepTabel(reserve) : '<p>In de boekhouding staat voor deze kavel geen openstaande oproep voor het reservekapitaal.</p>'}
        ${nota('3', 'Aan te vullen: beslissingen van de algemene vergadering die nog niet opgevraagd zijn')}
        <h4>4° Hangende gerechtelijke procedures in verband met de mede-eigendom</h4>
        ${juridisch.length ? `<ul>${juridisch.map((j) => `<li>Dossier #${j.nummer} ${esc(j.titel)} (geopend ${dat(j.geopend_op)}, ${esc(j.status)})</li>`).join('')}</ul>` : '<p>In het platform staat geen open dossier van de soort "juridisch" voor deze VME.</p>'}
        ${nota('4', 'Aan te vullen: procedures en de bedragen die in het geding zijn')}
        <h4>5° Notulen van de algemene vergaderingen van de vorige drie jaar en afrekeningen van de vorige twee jaar</h4>
        <p>Vergaderingen sinds ${dat(drieJaar)}: ${avs.length ? avs.map((a) => `${dat(a.datum)} (${esc(a.soort)}, ${esc(a.status)})`).join(' · ') : 'geen in het platform'}.</p>
        <p>Documenten in de map "2. AV - RVME" (toe te voegen als bijlage): ${docs.length ? docs.map((x) => esc(x.naam)).join(' · ') : 'geen opgeladen'}.</p>
        ${afr.length ? afr.map((a) => `<p><b>Kosten boekjaar ${esc(a.j.omschrijving)}</b> voor ${esc(kavel.kavelnummer)}:</p>${a.fout ? `<p class="klein">${esc(a.fout)}</p>` : a.lijnen.length ? tabel(['Verdeelsleutel', 'Eigenaar(s)', 'Van – tot', '#Bedrag'], [...a.lijnen.map((l) => `<tr>${cel(l.sleutel_code)}${cel(l.eigenaars)}${cel(`${dat(l.periode_van) || 'begin'} – ${dat(l.periode_tot) || 'heden'}`)}${celN(l.bedrag)}</tr>`), `<tr><td colspan="3"><b>Totaal</b></td><td class="n"><b>${eur(som(a.lijnen, (l) => l.bedrag))}</b></td></tr>`]) : '<p class="klein">Geen kosten voor deze kavel.</p>'}`).join('') : '<p>Er is nog geen afgesloten boekjaar in het platform.</p>'}
        ${nota('5', 'Opmerking over de bijlagen')}
        <h4>6° Recentste balans die door de algemene vergadering werd goedgekeurd</h4>
        ${dicht[0] ? `<p>Balans van het laatst afgesloten boekjaar ${esc(dicht[0].omschrijving)} (${dat(dicht[0].start_datum)} – ${dat(dicht[0].eind_datum)}):</p>${tabel(['Rekening', 'Naam', '#Debet', '#Credit'], balansDicht.filter((r) => Number(r.debet) || Number(r.credit)).map((r) => `<tr>${cel(r.nummer)}${cel(r.naam)}${celN(r.debet)}${celN(r.credit)}</tr>`))}` : '<p>Er is nog geen afgesloten boekjaar in het platform.</p>'}
        ${nota('6', 'Aan te vullen: datum van de algemene vergadering die deze balans goedkeurde')}`;
      const p2 = [['1°', 'Uitgaven voor behoud, onderhoud, herstelling en vernieuwing waartoe vóór de overdracht besloten is, maar waarvan de betaling pas daarna wordt opgevraagd'],
        ['2°', 'Door de algemene vergadering vóór de overdracht goedgekeurde oproepen tot kapitaalinbreng en de kostprijs van dringende herstellingen waarvan de betaling pas daarna wordt opgevraagd'],
        ['3°', 'Kosten verbonden aan het verkrijgen van gemeenschappelijke delen, waartoe vóór de overdracht besloten is, maar waarvan de betaling pas daarna wordt opgevraagd'],
        ['4°', 'Door de vereniging van mede-eigenaars vaststaande verschuldigde bedragen ten gevolge van geschillen ontstaan vóór de overdracht, waarvan de betaling pas daarna wordt opgevraagd']];
      const deel2 = !f.p2.checked ? '' : `<h3>Artikel 3.94 §2 — inlichtingen bij de akte</h3>
        <p class="klein geen-druk"><span class="pil warn">let op</span> Deze vier punten kan het platform niet uit de boekhouding afleiden. Vul ze zelf in; een leeg vak wordt niet afgedrukt.</p>
        ${p2.map(([nr, tekst], i) => `<h4>${nr} ${esc(tekst)}</h4>${nota(`b${i}`, 'Aan te vullen')}`).join('')}`;

      uit.innerHTML = `<div class="kaart" id="vd"><p style="text-align:right">${esc(S.kantoor.naam)}<br>${dat(new Date().toISOString().slice(0, 10))}</p>
        <h2 style="margin-bottom:4px">Inlichtingen bij verkoop</h2>
        <p><b>${esc(v.naam)}</b>${v.ondernemingsnummer ? ` · ${esc(v.ondernemingsnummer)}` : ''}<br>Kavel: <b>${esc(kavel.kavelnummer)}</b> · eigenaar(s): ${esc(eig.map((e) => e.naam).join(', ') || 'onbekend')}
          <br>Aanvraag van ${dat(datum)}${f.aanvrager.value.trim() ? ` door ${esc(f.aanvrager.value.trim())}` : ''}${f.ref.value.trim() ? ` · uw referentie ${esc(f.ref.value.trim())}` : ''}</p>
        ${deel1}${deel2}
        <p class="geen-druk" style="margin-top:20px"><button id="vkdruk">Afdrukken of bewaren als pdf</button> <button class="stil" id="vkvolg">Opvolgen: dossier en taak aanmaken (te bezorgen tegen ${dat(termijn)})</button></p></div>`;
      document.getElementById('vkdruk').onclick = () => {
        uit.querySelectorAll('textarea[data-nota]').forEach((t) => { t.nextElementSibling.textContent = t.value.trim(); });
        document.body.classList.add('vkdruk'); window.print(); document.body.classList.remove('vkdruk');
      };
      document.getElementById('vkvolg').onclick = async (e2) => {
        e2.target.disabled = true;
        try {
          const [nieuw] = await q(sb.from('dossier').insert({ kantoor_id: S.kantoor.id, vme_id: v.id, kavel_id: kavel.id, soort: 'administratie', titel: `Verkoop ${kavel.kavelnummer}: inlichtingen art. 3.94`,
            omschrijving: `Aanvraag van ${dat(datum)}${f.aanvrager.value.trim() ? ` door ${f.aanvrager.value.trim()}` : ''}${f.ref.value.trim() ? ` (ref. ${f.ref.value.trim()})` : ''}.` }).select('id, nummer'));
          await q(sb.from('taak').insert({ kantoor_id: S.kantoor.id, dossier_id: nieuw.id, titel: `Inlichtingen verkoop ${kavel.kavelnummer} bezorgen`, vervaldatum: termijn, toegewezen_aan: S.sessie.user.id }));
          S.dossierOpen = nieuw.id; S.bericht = { soort: 'ok', tekst: `Dossier #${nieuw.nummer} en een taak tegen ${dat(termijn)} aangemaakt.` };
          location.hash = `#/vme/${v.id}/dossiers`;
        } catch (e) { e2.target.disabled = false; uit.insertAdjacentHTML('afterbegin', `<div class="melding fout">${esc(e.message)}</div>`); }
      };
    } catch (e) { uit.innerHTML = `<div class="melding fout">${esc(e.message)}</div>`; }
  };
};
