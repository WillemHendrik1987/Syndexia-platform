// =============================================================================
// Team: meerdere gebruikers per kantoor.
//
// Een beheerder nodigt een collega uit met zijn e-mailadres en een rol. De collega maakt met
// dat adres een account aan, bevestigt het via de mail die hij krijgt, en hoort vanaf dan bij
// het kantoor. Twee rollen:
//   medewerker   het volledige dagelijkse beheer van alle gebouwen
//   beheerder    daarnaast het team, de API-sleutels en de koppeling van de mailbox
// Alles loopt via functies in de databank die zelf nagaan wie ze oproept (migratie 0027):
// de schermen hieronder tonen alleen de knoppen, de databank beslist.
// Let op: cel() zet tekst veilig om; cellen met een knop of keuzelijst schrijven we zelf als <td>,
// met esc() rond alles wat van een gebruiker komt.
// =============================================================================
UIT.vandaag.push('<p><a class="knop licht" href="#/team">Team</a></p>');
const ROL_UITLEG = { beheerder: 'beheert ook het team, de API-sleutels en de mailbox', medewerker: 'het volledige dagelijkse beheer' };
UIT.routes.team = async () => {
  let t;
  try { t = await q(sb.rpc('team')); } catch (e) { fout(e); return toon(`${terug}<p class="leeg">Het team kon niet geladen worden.</p>`); }
  const st = (S.team ??= { zeker: null }), baas = t.beheerder, k = t.kantoor_id;
  const moment = (v) => (v ? new Date(v).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'nog nooit');
  const rolKeuze = (naam, nu, extra = '') => `<select name="${naam}" ${extra} aria-label="Rol">${['medewerker', 'beheerder'].map((r) => `<option value="${r}"${r === nu ? ' selected' : ''}>${r === 'beheerder' ? 'Beheerder' : 'Medewerker'}</option>`).join('')}</select>`;
  // De tekst die de beheerder zelf naar zijn collega mailt: het platform verstuurt hier niets.
  const mailto = (u) => `mailto:${encodeURIComponent(u.email)}?subject=${encodeURIComponent(`Uitnodiging voor het platform van ${S.kantoor?.naam ?? 'ons kantoor'}`)}&body=${encodeURIComponent(`Dag,\n\nJe bent uitgenodigd om mee te werken in het platform van ${S.kantoor?.naam ?? 'ons kantoor'}.\n\n1. Ga naar ${location.origin}\n2. Kies "Nog geen account?" en maak een account met dit e-mailadres: ${u.email}\n3. Klik op de link in de bevestigingsmail die je krijgt\n4. Meld je aan: je ziet dan meteen de gebouwen van het kantoor\n`)}`;
  toon(`${terug}<h2>Team</h2><p class="klein">Wie meewerkt in het platform van ${esc(S.kantoor?.naam ?? 'het kantoor')}. Een medewerker doet het volledige dagelijkse beheer; een beheerder beheert daarnaast het team, de API-sleutels en de mailbox.</p>
    <div class="kaart"><h3 style="margin-top:0">Leden <span class="tkn">${t.leden.length}</span></h3>
      ${tabel(['Gebruiker', 'Rol', 'Lid sinds', 'Laatst aangemeld', ''], t.leden.map((l) => `<tr><td>${esc(l.email)}${l.ik ? ' <span class="pil">jij</span>' : ''}</td>
        <td>${baas && !l.ik ? rolKeuze('rol', l.rol, `data-rol="${l.user_id}"`) : (l.rol === 'beheerder' ? 'Beheerder' : 'Medewerker')}</td>${cel(moment(l.sinds))}${cel(moment(l.laatst))}
        <td>${baas && !l.ik ? (st.zeker === l.user_id ? `<button type="button" class="tmweg" data-weg="${l.user_id}">Ja, verwijder ${esc(l.email)}</button> <button type="button" class="stil" data-nee>Toch niet</button>` : `<button type="button" class="stil" data-vraag="${l.user_id}">Verwijderen</button>`) : ''}</td></tr>`))}
      ${baas ? '' : '<p class="klein">Alleen een beheerder kan leden uitnodigen, een rol wijzigen of iemand verwijderen.</p>'}</div>
    ${baas ? `<div class="kaart"><h3 style="margin-top:0">Iemand uitnodigen</h3>
      <form id="ftm"><div class="rij">${veld('E-mailadres van je collega', inp('email', 'type="email" required autocomplete="off" placeholder="naam@kantoor.be"'))}${veld('Rol', rolKeuze('rol', 'medewerker'))}</div>
        <p><button>Uitnodigen</button></p>
        <p class="klein">Het platform verstuurt zelf geen mail. Na het uitnodigen staat hieronder een knop om je collega de uitleg te mailen. Hij maakt een account aan met precies dit adres en bevestigt het; pas dan hoort hij bij het kantoor.</p></form>
      ${t.uitnodigingen.length ? `<h3>Uitgenodigd, nog niet aangemeld</h3>${tabel(['E-mailadres', 'Rol', 'Uitgenodigd op', ''], t.uitnodigingen.map((u) => `<tr>${cel(u.email)}${cel(u.rol === 'beheerder' ? 'Beheerder' : 'Medewerker')}${cel(moment(u.sinds))}
        <td><a class="knop licht" href="${esc(mailto(u))}">Uitleg mailen</a> <button type="button" class="stil" data-intrek="${esc(u.email)}">Intrekken</button></td></tr>`))}` : ''}</div>` : ''}`);
  const opnieuw = () => { S.leden = null; UIT.routes.team(); };   // S.leden: de lijst waaruit je een taak toewijst
  const doe = async (functie, args, klaar) => { try { await q(sb.rpc(functie, args)); S.bericht = { soort: 'ok', tekst: klaar }; st.zeker = null; opnieuw(); } catch (e) { fout(e); st.zeker = null; UIT.routes.team(); } };
  bijVerzenden('ftm', async (f) => { const email = f.email.value.trim().toLowerCase(); await q(sb.rpc('team_nodig_uit', { p_kantoor: k, p_email: email, p_rol: f.rol.value })); S.bericht = { soort: 'ok', tekst: `${email} is uitgenodigd als ${f.rol.value}. Mail hem de uitleg met de knop hieronder.` }; opnieuw(); }, () => UIT.routes.team());
  document.querySelectorAll('[data-rol]').forEach((s) => { s.onchange = () => doe('team_rol', { p_kantoor: k, p_user: s.dataset.rol, p_rol: s.value }, `De rol is gewijzigd naar ${s.value}.`); });
  document.querySelectorAll('[data-vraag]').forEach((b) => { b.onclick = () => { st.zeker = b.dataset.vraag; UIT.routes.team(); }; });
  document.querySelectorAll('[data-nee]').forEach((b) => { b.onclick = () => { st.zeker = null; UIT.routes.team(); }; });
  document.querySelectorAll('[data-weg]').forEach((b) => { b.onclick = () => doe('team_verwijder', { p_kantoor: k, p_user: b.dataset.weg }, 'De gebruiker is verwijderd en heeft geen toegang meer.'); });
  document.querySelectorAll('[data-intrek]').forEach((b) => { b.onclick = () => doe('team_trek_in', { p_kantoor: k, p_email: b.dataset.intrek }, 'De uitnodiging is ingetrokken.'); });
};
