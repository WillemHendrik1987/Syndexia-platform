// =============================================================================
// Syndexia Platform - koppelingen: de API en de MCP-connector.
//
//   #/koppelingen   een beheerder maakt hier API-sleutels aan en trekt ze in, en vindt de adressen
//                   waarmee een ander programma (een script, een boekhoudpakket, Claude) het
//                   platform aanspreekt.
// Een sleutel wordt één keer getoond, meteen na het aanmaken. Het platform bewaart alleen een
// vingerafdruk: wie de sleutel kwijt is, trekt hem in en maakt een nieuwe.
// =============================================================================
UIT.vandaag.push('<p><a class="knop licht" href="#/koppelingen">Koppelingen</a></p>');
UIT.routes.koppelingen = async () => {
  const api = `${SB_URL}/functions/v1/api`, st = (S.koppeling ??= { nieuw: null });
  let sleutels, leden;
  try { [sleutels, leden] = await Promise.all([q(sb.from('api_sleutel').select('id, naam, begin, rechten, laatst_gebruikt, ingetrokken_op, aangemaakt_op').order('aangemaakt_op', { ascending: false })), q(sb.from('kantoor_lid').select('rol').eq('user_id', S.sessie.user.id).eq('kantoor_id', S.kantoor.id))]); }
  catch (e) { fout(e); return toon(`${terug}<p class="leeg">De koppelingen konden niet geladen worden.</p>`); }
  const baas = leden.some((l) => l.rol === 'beheerder'), moment = (v) => (v ? new Date(v).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : 'nog nooit');
  const nieuw = st.nieuw; st.nieuw = null;   // de sleutel staat maar één keer op het scherm
  toon(`${terug}<h2>Koppelingen</h2><p class="klein">Laat andere programma's met het platform werken: een eigen script, een ander pakket, of Claude via een MCP-connector. Elk programma krijgt een eigen API-sleutel; die bepaalt wat het mag.</p>
    ${nieuw ? `<div class="kaart" id="kpnieuw" style="border-color:var(--koper);background:#FFFBF2"><h3 style="margin-top:0">Je nieuwe sleutel "${esc(nieuw.naam)}"</h3>
      <p>Kopieer hem nu en bewaar hem op een veilige plek (bv. je wachtwoordbeheerder). <b>Hij wordt niet opnieuw getoond.</b> Wie deze sleutel heeft, kan ${nieuw.rechten === 'schrijven' ? 'de gegevens van het kantoor lezen en taken en dossiers aanmaken' : 'de gegevens van het kantoor lezen'}.</p>
      <div class="rij"><input readonly id="kpsleutel" value="${esc(nieuw.sleutel)}" style="flex:3 1 260px;font-family:ui-monospace,monospace" onfocus="this.select()"><div style="flex:0 0 auto"><button type="button" id="kpkopie">Kopiëren</button></div></div></div>` : ''}
    <div class="kaart"><h3 style="margin-top:0">API-sleutels</h3>
      ${tabel(['Naam', 'Sleutel', 'Rechten', 'Laatst gebruikt', 'Aangemaakt', ''], sleutels.map((s) => `<tr>${cel(s.naam)}<td><code>${esc(s.begin)}…</code></td><td>${s.rechten === 'schrijven' ? 'lezen en schrijven' : 'alleen lezen'}</td>${cel(moment(s.laatst_gebruikt))}${cel(dat(s.aangemaakt_op))}
        <td>${s.ingetrokken_op ? '<span class="pil">ingetrokken</span>' : baas ? `<button type="button" class="stil" data-trek="${s.id}">Intrekken</button>` : '<span class="pil ok">actief</span>'}</td></tr>`))}
      ${baas ? `<form id="fkp"><div class="rij">${veld('Waarvoor dient de sleutel?', inp('naam', 'required maxlength="80" placeholder="bv. Claude-connector Alexia"'), '3 1 260px')}${veld('Rechten', kies('rechten', '<option value="lezen">alleen lezen</option><option value="schrijven">lezen, en taken en dossiers aanmaken</option>'), '2 1 220px')}<div style="flex:0 0 auto"><button>Sleutel aanmaken</button></div></div></form>`
        : '<p class="klein">Alleen een beheerder van het kantoor kan sleutels aanmaken of intrekken.</p>'}</div>
    <div class="kaart"><h3 style="margin-top:0">Claude koppelen (MCP-connector)</h3>
      <p>Hiermee kan Claude zelf je gebouwen, eigenaars, dossiers, taken, attesten en sleutels opvragen, en met een schrijfsleutel taken en dossiers aanmaken.</p>
      <ol class="kpstappen"><li>Maak hierboven een sleutel aan en kopieer hem.</li><li>Voeg in Claude een eigen connector (custom connector) toe met dit adres:<br><input readonly value="${api}/mcp" onfocus="this.select()" style="font-family:ui-monospace,monospace;margin-top:4px"></li>
        <li>Zet bij de request headers de kop <code>Authorization</code> met als waarde <code>Bearer</code>, een spatie en je sleutel.</li></ol>
      <p class="klein">Elk programma dat MCP over HTTP spreekt kan zo koppelen. De sleutel geldt voor iedereen die de connector gebruikt: maak per persoon of per programma een eigen sleutel, dan kan je er één intrekken zonder de rest te storen.</p></div>
    <div class="kaart"><h3 style="margin-top:0">De API voor eigen programma's</h3>
      <p>Adres: <code style="overflow-wrap:anywhere">${api}/v1</code>. Vraag dat adres op voor de volledige lijst van wat kan, met de velden. Elke aanvraag draagt de kop <code>Authorization: Bearer &lt;je sleutel&gt;</code>.</p>
      <pre class="kpcode">curl -H "Authorization: Bearer SLEUTEL" \\
  "${api}/v1/gebouwen"

curl -X POST -H "Authorization: Bearer SLEUTEL" -H "Content-Type: application/json" \\
  -d '{"titel":"Offerte dakwerken opvragen","vervaldatum":"2026-12-15"}' \\
  "${api}/v1/maak_taak"</pre>
      <p><b>Lezen:</b> gebouwen, gebouw, eigenaars, dossiers, dossier, taken, attesten, sleutels_buiten, openstaande_provisies, documenten, leveranciers, vergaderingen.<br><b>Schrijven</b> (alleen met een schrijfsleutel): maak_taak, taak_klaar, maak_dossier, dossier_notitie.</p>
      <p class="klein">Wat de API bewust niet kan: boeken, betalen, mails versturen, bestanden ophalen en iets wissen. Bankrekeningnummers geeft ze niet terug.</p></div>
    <div class="kaart"><h3 style="margin-top:0">Andere koppelingen</h3><p style="margin:0"><a href="#/mailbox">Gmail-mailbox van het kantoor</a> · een map op je computer koppel je per gebouw in het tabblad Documenten · <a href="#/overname">een gebouw overnemen uit de map van de vorige syndicus</a></p></div>`);
  const kopie = document.getElementById('kpkopie');
  if (kopie) kopie.onclick = async () => { const veldje = document.getElementById('kpsleutel'); try { await navigator.clipboard.writeText(veldje.value); kopie.textContent = 'Gekopieerd'; } catch (e) { veldje.focus(); veldje.select(); } };
  bijVerzenden('fkp', async (f) => {
    const naam = f.naam.value.trim(), rechten = f.rechten.value, sleutel = await q(sb.rpc('maak_api_sleutel', { p_kantoor: S.kantoor.id, p_naam: naam, p_rechten: rechten }));
    st.nieuw = { naam, rechten, sleutel }; UIT.routes.koppelingen();
  }, UIT.routes.koppelingen);
  document.querySelectorAll('[data-trek]').forEach((b) => { b.onclick = async () => {
    if (!b.dataset.zeker) { b.dataset.zeker = '1'; b.textContent = 'Zeker? Klik opnieuw'; return; }
    try { await q(sb.rpc('trek_api_sleutel_in', { p_id: b.dataset.trek })); S.bericht = { soort: 'ok', tekst: 'De sleutel is ingetrokken en werkt niet meer.' }; } catch (e) { fout(e); }
    UIT.routes.koppelingen(); }; });
};
