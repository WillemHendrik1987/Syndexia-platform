// =============================================================================
// Syndexia Platform - eigenaarsportaal en contactbeheer.
//
// PORTAAL. Een eigenaar is geen lid van het kantoor en mag geen enkele tabel lezen. Hij
// roept één databankfunctie aan, portaal(), die alleen teruggeeft wat bij zijn bevestigde
// e-mailadres hoort. Dit bestand tekent dat antwoord: per kavel wat nog openstaat, zijn
// deel in de afgesloten boekjaren, de vrijgegeven documenten en de geplande vergaderingen.
//
// CONTACTEN. De pagina #/contacten is voor het kantoor: alle eigenaars en andere contacten
// met hun adres, telefoon en e-mailadressen. Het e-mailadres hier bepaalt wie in het
// portaal mag meekijken en waar de mailings naartoe gaan.
// =============================================================================
const portaalOgm = (o) => (o ? `+++${o.slice(0, 3)}/${o.slice(3, 7)}/${o.slice(7)}+++` : '');
const portaalIban = (i) => (i ? i.replace(/(.{4})/g, '$1 ').trim() : '');

function schermPortaal(p, metTerug = false) {
  const vmes = [...new Map(p.kavels.map((k) => [k.vme_id, k])).values()];
  const kaartKavel = (k) => {
    const open = k.openstaand, totaalOpen = open.reduce((s, o) => s + Number(o.openstaand), 0);
    return `<div class="kaart"><h3 style="margin-top:0">${esc(k.kavelnummer)}${k.omschrijving ? ` · ${esc(k.omschrijving)}` : ''} ${k.huidig ? '' : '<span class="pil">vroegere eigenaar</span>'}</h3>
      ${k.huidig ? `<h4>Te betalen</h4>${open.length ? `${tabel(['Datum', 'Omschrijving', 'Vervalt', '#Bedrag', '#Betaald', '#Nog te betalen', 'Mededeling'], open.map((o) => `<tr>${cel(dat(o.datum))}${cel(o.omschrijving ?? 'provisie')}${cel(dat(o.vervaldatum))}${celN(o.bedrag)}${celN(o.betaald)}${celN(o.openstaand)}${cel(portaalOgm(o.ogm))}</tr>`))}
        <p><b>Samen nog te betalen: ${eur(totaalOpen)} euro</b>${k.iban ? ` op rekening <b>${esc(portaalIban(k.iban))}</b> van de VME, met de mededeling van de oproep.` : '.'}</p>` : '<p class="leeg">Er staat niets open.</p>'}` : ''}
      <h4>Uw deel in de kosten (afgesloten boekjaren)</h4>
      ${k.afrekeningen.length ? k.afrekeningen.map((a) => `<p><b>Boekjaar ${esc(a.boekjaar)}</b> <span class="klein">${dat(a.van)} – ${dat(a.tot)}</span></p>
        ${a.nota ? `<p class="klein">${esc(a.nota)}</p>` : tabel(['Verdeelsleutel', 'Eigenaar van – tot', '#Bedrag'], [...a.lijnen.map((l) => `<tr>${cel(l.sleutel)}${cel(`${dat(l.van) || 'begin'} – ${dat(l.tot) || 'heden'}`)}${celN(l.bedrag)}</tr>`), `<tr><td colspan="2"><b>Totaal</b></td><td class="n"><b>${eur(a.totaal)}</b></td></tr>`])}`).join('') : '<p class="leeg">Er is nog geen afgesloten boekjaar.</p>'}</div>`;
  };
  toon(`${metTerug ? terug : ''}<h2>Mijn eigendom</h2>
    <p class="klein">U bent aangemeld als ${esc(p.email)}. U ziet hier alleen de gegevens van uw eigen kavel(s).</p>
    ${vmes.length ? '' : '<div class="kaart"><p class="leeg">Dit e-mailadres is aan geen enkele kavel gekoppeld.</p></div>'}
    ${vmes.map((v) => {
      const docs = p.documenten.filter((d) => d.vme_id === v.vme_id), avs = p.vergaderingen.filter((g) => g.vme_id === v.vme_id);
      return `<div class="kaart"><h2 style="margin:0">${esc(v.vme)}</h2><p class="klein" style="margin:4px 0 0">${esc(v.adres)}${v.ondernemingsnummer ? ` · ${esc(v.ondernemingsnummer)}` : ''} · syndicus: ${esc(v.kantoor)}</p></div>
        ${p.kavels.filter((k) => k.vme_id === v.vme_id).map(kaartKavel).join('')}
        ${avs.length ? `<div class="kaart"><h3 style="margin-top:0">Geplande vergaderingen</h3>${avs.map((g) => `<p><b>${dat(g.datum)}${g.tijdstip ? ` om ${esc(g.tijdstip.slice(0, 5))}` : ''}</b>${g.plaats ? ` · ${esc(g.plaats)}` : ''} · ${esc(g.soort)} algemene vergadering</p>${g.agenda.length ? `<ol>${g.agenda.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>` : ''}`).join('')}</div>` : ''}
        <div class="kaart"><h3 style="margin-top:0">Documenten</h3>${docs.length ? tabel(['Map', 'Naam', 'Datum', ''], docs.map((d) => `<tr>${cel(d.map)}${cel(d.naam)}${cel(dat(d.datum))}<td><button class="stil" data-pdoc="${d.id}">Openen</button></td></tr>`)) : '<p class="leeg">De syndicus heeft nog geen documenten vrijgegeven.</p>'}</div>`;
    }).join('')}`);
  document.querySelectorAll('[data-pdoc]').forEach((knop) => { knop.onclick = async () => {
    const doc = p.documenten.find((d) => d.id === knop.dataset.pdoc), venster = window.open('', '_blank');
    const { data, error } = await sb.storage.from('documenten').createSignedUrl(doc.pad, 120);
    if (error) { if (venster) venster.close(); fout({ message: 'Dit document kan niet geopend worden.' }); return schermPortaal(p, metTerug); }
    if (venster) venster.location = data.signedUrl; else location.href = data.signedUrl;
  }; });
}
// Wie ook lid is van een kantoor, bekijkt zijn eigen eigendom via #/portaal.
UIT.routes.portaal = async () => schermPortaal(await q(sb.rpc('portaal')), true);

// ---- pagina: contacten ------------------------------------------------------------
UIT.vandaag.push('<p style="margin:-8px 0 16px"><a class="knop licht" href="#/contacten">Contacten</a></p>');
const portaalNaam = (c) => c.bedrijfsnaam || [c.voornaam, c.achternaam].filter(Boolean).join(' ');
UIT.routes.contacten = async () => {
  const [lijst, kavels] = await Promise.all([
    q(sb.from('contact').select('id, soort, voornaam, achternaam, bedrijfsnaam, taal, emails, telefoon, gsm, adres_straat, postcode, gemeente').order('achternaam').order('bedrijfsnaam')),
    q(sb.from('v_kavel_eigenaar_vandaag').select('contact_id, kavelnummer, vme_id')),
  ]);
  const vmeNaam = Object.fromEntries((await q(sb.from('vme').select('id, naam'))).map((v) => [v.id, v.naam]));
  const waar = (c) => kavels.filter((k) => k.contact_id === c.id).map((k) => `${vmeNaam[k.vme_id] ?? ''} ${k.kavelnummer}`).join(', ');
  const open = S.contactOpen;
  toon(`${terug}<div class="kaart"><h2>Contacten</h2>
    <p class="klein">Het e-mailadres bepaalt waar mailings naartoe gaan en wie zich als eigenaar in het portaal kan aanmelden. Meerdere adressen scheid je met een komma.</p>
    ${lijst.length ? lijst.map((c) => `<details class="contact" data-id="${c.id}"${open === c.id ? ' open' : ''} style="border-top:1px solid var(--l);padding:8px 0">
      <summary style="cursor:pointer"><b>${esc(portaalNaam(c))}</b> <span class="klein">${esc(waar(c) || 'geen kavel vandaag')} · ${esc((c.emails ?? []).join(', ') || 'geen e-mailadres')}</span></summary>
      <form class="fc" data-id="${c.id}" data-soort="${c.soort}" style="margin-top:8px">
        <div class="rij">${c.soort === 'vennootschap' ? veld('Bedrijfsnaam', inp('bedrijfsnaam', `required value="${esc(c.bedrijfsnaam ?? '')}"`), '2 1 240px')
          : veld('Voornaam', inp('voornaam', `value="${esc(c.voornaam ?? '')}"`)) + veld('Achternaam', inp('achternaam', `required value="${esc(c.achternaam ?? '')}"`))}
          ${veld('Taal', kies('taal', ['nl', 'fr', 'en', 'de'].map((t) => `<option${t === (c.taal ?? 'nl') ? ' selected' : ''}>${t}</option>`).join('')), '0 1 90px')}</div>
        <div class="rij">${veld('E-mailadres(sen)', inp('emails', `value="${esc((c.emails ?? []).join(', '))}"`), '2 1 260px')}${veld('Telefoon', inp('telefoon', `value="${esc(c.telefoon ?? '')}"`))}${veld('Gsm', inp('gsm', `value="${esc(c.gsm ?? '')}"`))}</div>
        <div class="rij">${veld('Straat en nummer', inp('adres_straat', `value="${esc(c.adres_straat ?? '')}"`), '2 1 240px')}${veld('Postcode', inp('postcode', `value="${esc(c.postcode ?? '')}"`), '0 1 110px')}${veld('Gemeente', inp('gemeente', `value="${esc(c.gemeente ?? '')}"`))}</div>
        <p><button>Opslaan</button></p></form></details>`).join('') : '<p class="leeg">Nog geen contacten. Je maakt ze aan bij Beheer, wanneer je een eigenaar aan een kavel koppelt.</p>'}</div>`);
  document.querySelectorAll('form.fc').forEach((f) => { f.onsubmit = async (ev) => {
    ev.preventDefault();
    const adressen = f.emails.value.split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
    S.contactOpen = f.dataset.id;
    if (adressen.some((a) => !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(a))) { fout({ message: `Geen geldig e-mailadres: ${adressen.find((a) => !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(a))}` }); return UIT.routes.contacten(); }
    const naam = f.dataset.soort === 'vennootschap' ? { bedrijfsnaam: f.bedrijfsnaam.value.trim() } : { voornaam: ofNull(f.voornaam.value), achternaam: f.achternaam.value.trim() };
    try {
      await q(sb.from('contact').update({ ...naam, taal: f.taal.value, emails: adressen, telefoon: ofNull(f.telefoon.value), gsm: ofNull(f.gsm.value),
        adres_straat: ofNull(f.adres_straat.value), postcode: ofNull(f.postcode.value), gemeente: ofNull(f.gemeente.value) }).eq('id', f.dataset.id));
      S.bericht = { soort: 'ok', tekst: 'Contact opgeslagen.' }; S.contactOpen = null;
    } catch (e) { fout(e); }
    UIT.routes.contacten();
  }; });
};
