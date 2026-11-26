// =============================================================================
// Syndexia Platform - mailbox.
//
// De mailbox van het kantoor stuurt een kopie van elke inkomende mail door naar een
// ontvangstadres. "Mails ophalen" laat de Edge Function "mailbox" de nieuwe mails
// binnenhalen; de AI stelt per mail een VME en een soort voor. Dat blijft een voorstel:
// pas als jij koppelt of er een dossier van maakt, hangt de mail aan een VME.
// Een rappel of aanmaning wordt gemeld, nooit geboekt.
// =============================================================================
UIT.vandaag.push('<p><a class="knop licht" href="#/mailbox">Mailbox <span id="mbteller"></span></a></p>');
// Op het startscherm: hoeveel mails wachten er nog?
(UIT.naVandaag ??= []).push(async () => {
  try { const nieuw = await q(sb.from('inkomende_mail').select('id').eq('status', 'nieuw').limit(100)); const vak = document.getElementById('mbteller'); if (vak && nieuw.length) vak.innerHTML = `<span class="pil fout">${nieuw.length}${nieuw.length === 100 ? '+' : ''} nieuw</span>`; } catch (e) { /* geen teller is geen ramp */ }
});
// Haalt de doorgestuurde mails op. Gebeurt vanzelf bij het openen van de Mailbox (hoogstens om de minuut).
async function mailboxHaal() {
  const { data, error } = await sb.functions.invoke('mailbox', { body: {} });
  if (error || data?.fout) { let t = data?.fout ?? error.message; try { t = (await error.context.json()).fout ?? t; } catch (e) { /* geen uitleg */ } throw new Error(t); }
  return data;
}
UIT.routes.mailbox = async () => {
  const st = (S.mailbox ??= { alle: false, open: null, laatst: 0 });
  if (Date.now() - st.laatst > 60000) {
    st.laatst = Date.now();
    try { const uit = await mailboxHaal(); if (uit.bewaard) S.bericht = { soort: 'ok', tekst: `${uit.bewaard} nieuwe mail(s) binnengehaald.${uit.nog ? ` Er wachten er nog ${uit.nog}.` : ''}` }; else if (uit.fouten.length) S.bericht = { soort: 'fout', tekst: uit.fouten[0] }; }
    catch (e) { if (!/geen mailbox gekoppeld/.test(e.message)) S.bericht = { soort: 'fout', tekst: e.message }; }
  }
  let info = {};
  try { const { data } = await sb.functions.invoke('mailbox', { method: 'GET' }); info = data ?? {}; } catch (e) { /* functie niet bereikbaar: de lijst werkt nog */ }
  const [mails, vmes] = await Promise.all([
    q(sb.from('inkomende_mail').select('id, van, onderwerp, ontvangen_op, tekst, bijlagen, ai_vme_id, ai_soort, ai_samenvatting, vme_id, dossier_id, status').order('ontvangen_op', { ascending: false }).limit(200)),
    q(sb.from('vme').select('id, naam').is('gedeactiveerd_op', null).order('naam')),
  ]);
  const naam = Object.fromEntries(vmes.map((v) => [v.id, v.naam])), lijst = mails.filter((m) => st.alle || m.status === 'nieuw'), nKlaar = mails.filter((m) => m.status === 'behandeld').length;
  const tijd = (t) => new Date(t).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
  toon(`${terug}<div class="kaart"><h2>Mailbox</h2>
    ${info.gekoppeld ? `<p class="klein">Stuur in je mailprogramma een kopie van elke inkomende mail door naar ${info.ontvangstadres ? `<b>${esc(info.ontvangstadres)}</b>` : 'het ontvangstadres van het platform'}. De mails komen vanzelf binnen als je deze pagina opent. De AI stelt per mail een VME voor; jij beslist.</p>
      <p><button class="stil" id="mbhaal">Nu opnieuw ophalen</button> <span class="klein" id="mbstatus"></span></p>`
      : '<div class="melding fout">Voor dit kantoor is nog geen mailbox gekoppeld. Vraag de beheerder van het platform om het ontvangstadres in te stellen.</div>'}</div>
    ${lijst.map((m) => { const voorstel = m.vme_id ?? m.ai_vme_id ?? '', rappel = m.ai_soort === 'rappel of aanmaning';
      return `<div class="kaart"><details class="mb" data-id="${m.id}"${st.open === m.id ? ' open' : ''}>
        <summary style="cursor:pointer"><b>${esc(m.onderwerp || '(geen onderwerp)')}</b> ${m.status === 'behandeld' ? '<span class="pil ok">behandeld</span>' : ''}${m.ai_soort ? ` <span class="pil ${rappel ? 'fout' : ''}">${esc(m.ai_soort)}</span>` : ''}${m.vme_id ? ` <span class="pil">${esc(naam[m.vme_id] ?? 'VME')}</span>` : ''}
          <br><span class="klein">${esc(m.van)} · ${tijd(m.ontvangen_op)}${m.bijlagen.length ? ` · ${m.bijlagen.length} bijlage(n)` : ''}</span></summary>
        ${m.ai_samenvatting ? `<p class="klein"><b>Samenvatting AI:</b> ${esc(m.ai_samenvatting)}${!m.vme_id && m.ai_vme_id ? ` · voorstel: <b>${esc(naam[m.ai_vme_id] ?? '')}</b>` : ''}</p>` : ''}
        ${rappel ? '<p><span class="pil fout">rappel</span> Niet boeken: zoek de oorspronkelijke factuur op en laad die op.</p>' : ''}
        ${m.bijlagen.length ? `<p class="klein">Bijlagen (blijven in je mailprogramma): ${esc(m.bijlagen.map((b) => b.naam).join(' · '))}</p>` : ''}
        <pre style="white-space:pre-wrap;font:inherit;border:1px solid var(--l);border-radius:8px;padding:10px;max-height:320px;overflow:auto">${esc(m.tekst || '(geen tekst)')}</pre>
        <form class="fmb" data-id="${m.id}"><div class="rij" style="align-items:flex-end">${veld('VME', kies('vme', `<option value="">— kies —</option>${vmes.map((v) => `<option value="${v.id}"${v.id === voorstel ? ' selected' : ''}>${esc(v.naam)}</option>`).join('')}`), '2 1 220px')}
          <div><button class="stil" name="doe" value="koppel">Koppelen</button></div><div><button class="stil" name="doe" value="dossier"${m.dossier_id ? ' disabled' : ''}>${m.dossier_id ? 'Dossier gemaakt' : 'Dossier maken'}</button></div>
          <div><button class="stil" name="doe" value="${m.status === 'nieuw' ? 'klaar' : 'terug'}">${m.status === 'nieuw' ? 'Behandeld' : 'Terug naar nieuw'}</button></div></div></form></details></div>`; }).join('') || `<div class="kaart"><p class="leeg">${mails.length ? 'Geen nieuwe mails.' : 'Nog geen mails opgehaald.'}</p></div>`}
    ${nKlaar ? `<p><label style="display:inline"><input type="checkbox" id="mballe" style="width:auto"${st.alle ? ' checked' : ''}> Ook de ${nKlaar} behandelde mail(s) tonen</label></p>` : ''}`);
  const opnieuw = () => UIT.routes.mailbox();
  document.querySelectorAll('details.mb').forEach((el) => { el.ontoggle = () => { if (el.open) st.open = el.dataset.id; else if (st.open === el.dataset.id) st.open = null; }; });
  const alle = document.getElementById('mballe'); if (alle) alle.onchange = () => { st.alle = alle.checked; opnieuw(); };
  const haal = document.getElementById('mbhaal');
  if (haal) haal.onclick = async () => {
    haal.disabled = true; document.getElementById('mbstatus').textContent = 'Bezig met ophalen…';
    let data; st.laatst = Date.now();
    try { data = await mailboxHaal(); } catch (e) { fout(e); return opnieuw(); }
    S.bericht = { soort: data.fouten.length ? 'fout' : 'ok', tekst: `${data.bewaard} nieuwe mail(s) opgehaald.${data.nog ? ` Er wachten er nog ${data.nog}: klik opnieuw.` : ''}${data.fouten.length ? ` ${data.fouten.length} mislukt: ${data.fouten[0]}` : ''}` };
    opnieuw();
  };
  document.querySelectorAll('form.fmb').forEach((f) => { f.onsubmit = async (ev) => {
    ev.preventDefault();
    const doe = ev.submitter?.value, m = mails.find((x) => x.id === f.dataset.id), vme = f.vme.value || null; st.open = m.id;
    try {
      if (doe === 'klaar' || doe === 'terug') { await q(sb.from('inkomende_mail').update({ status: doe === 'klaar' ? 'behandeld' : 'nieuw' }).eq('id', m.id)); if (doe === 'klaar') st.open = null; }
      else if (!vme) throw new Error('Kies eerst een VME.');
      else if (doe === 'koppel') { await q(sb.from('inkomende_mail').update({ vme_id: vme }).eq('id', m.id)); S.bericht = { soort: 'ok', tekst: `Mail gekoppeld aan ${naam[vme]}.` }; }
      else if (doe === 'dossier') {
        const [nieuw] = await q(sb.from('dossier').insert({ kantoor_id: S.kantoor.id, vme_id: vme, titel: (m.onderwerp || 'Mail').slice(0, 120), soort: m.ai_soort === 'schademelding' ? 'schade' : m.ai_soort === 'verkoop van een kavel' ? 'administratie' : 'andere',
          omschrijving: `Uit een mail van ${m.van} (${tijd(m.ontvangen_op)}).\n\n${(m.tekst || '').slice(0, 3000)}` }).select('id, nummer'));
        await q(sb.from('inkomende_mail').update({ vme_id: vme, dossier_id: nieuw.id, status: 'behandeld' }).eq('id', m.id));
        S.dossierOpen = nieuw.id; S.bericht = { soort: 'ok', tekst: `Dossier #${nieuw.nummer} aangemaakt in ${naam[vme]}.` }; st.open = null;
      }
    } catch (e) { fout(e); }
    opnieuw();
  }; });
};
