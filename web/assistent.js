// =============================================================================
// Syndexia Platform - AI-assistent.
//
// Een gesprek over één VME (tabblad Assistent) of, voor een eigenaar, over zijn eigen
// kavel (onderaan het portaal). De vraag gaat naar de Edge Function "ai-assistent"; die
// haalt de gegevens op met jouw login en laat Claude antwoorden. De assistent leest
// alleen: hij boekt, verstuurt of wijzigt niets. Het gesprek wordt niet bewaard: het
// staat in het geheugen van deze pagina en is weg als je herlaadt.
// =============================================================================
const ASSISTENT_TIPS = ['Wie heeft nog provisies openstaan en hoeveel?', 'Wat zijn de grootste kostenposten dit boekjaar?', 'Welke dossiers staan nog open?', 'Wat moet er deze maand nog gebeuren?'];
const assistentHtml = (gesprek, tips) => `<div id="asgesprek">${gesprek.map((b) => `<div style="margin:10px 0;${b.role === 'user' ? 'text-align:right' : ''}"><div style="display:inline-block;max-width:92%;text-align:left;padding:9px 12px;border-radius:10px;white-space:pre-wrap;${b.role === 'user' ? 'background:var(--bl)' : 'border:1px solid var(--l)'}">${esc(b.content)}</div></div>`).join('')}</div>
  ${gesprek.length ? '' : `<p>${tips.map((t) => `<button type="button" class="stil astip" style="margin:0 6px 6px 0">${esc(t)}</button>`).join('')}</p>`}
  <form id="fas"><div class="rij" style="align-items:flex-end"><div style="flex:1 1 300px"><label>Uw vraag</label><input name="vraag" maxlength="2000" required autocomplete="off"></div><div><button>Vragen</button></div>${gesprek.length ? '<div><button type="button" class="stil" id="asnieuw">Nieuw gesprek</button></div>' : ''}</div></form><div id="asfout"></div>`;
// Koppelt het formulier. "extra" bepaalt of het over een VME of over het portaal gaat.
function bindAssistent(gesprek, extra, opnieuw) {
  const f = document.getElementById('fas'); if (!f) return;
  const vraag = async (tekst) => {
    const knop = f.querySelector('button'); knop.disabled = true; knop.textContent = 'Even denken…';
    const { data, error } = await sb.functions.invoke('ai-assistent', { body: { ...extra, vraag: tekst, geschiedenis: gesprek } });
    if (error || data?.fout) {
      let uitleg = data?.fout ?? error.message; try { uitleg = (await error.context.json()).fout ?? uitleg; } catch (e) { /* geen uitleg */ }
      knop.disabled = false; knop.textContent = 'Vragen';
      document.getElementById('asfout').innerHTML = `<div class="melding fout">${esc(uitleg)}</div>`; return;
    }
    gesprek.push({ role: 'user', content: tekst }, { role: 'assistant', content: data.antwoord });
    opnieuw();
  };
  f.onsubmit = (ev) => { ev.preventDefault(); const t = f.vraag.value.trim(); if (t) vraag(t); };
  document.querySelectorAll('.astip').forEach((b) => { b.onclick = () => vraag(b.textContent); });
  const nieuw = document.getElementById('asnieuw'); if (nieuw) nieuw.onclick = () => { gesprek.length = 0; opnieuw(); };
  f.vraag.focus();
}

UIT.tabs.push(['assistent', 'Assistent']);
UIT.fn.assistent = () => { const g = ((S.gesprekken ??= {})[S.vme.id] ??= []);
  return `<div class="kaart"><h3 style="margin-top:0">Assistent voor ${esc(S.vme.naam)}</h3>
    <p class="klein">Stel een vraag over deze VME: kosten, provisies, eigenaars, dossiers, taken, vergaderingen. De assistent leest alleen wat in het platform staat en wijzigt niets. Kijk cijfers na in het tabblad zelf voor je ze doorgeeft.</p>${assistentHtml(g, ASSISTENT_TIPS)}</div>`; };
UIT.bind.assistent = () => bindAssistent(S.gesprekken[S.vme.id], { vme_id: S.vme.id, boekjaar_id: S.bj?.id ?? null }, () => schermVme());

// In het portaal: een eigenaar stelt vragen over zijn eigen gegevens.
UIT.portaalExtra = () => `<div class="kaart"><h3 style="margin-top:0">Een vraag?</h3><p class="klein">De assistent beantwoordt vragen over uw eigen gegevens op deze pagina. Voor al het andere neemt u contact op met uw syndicus.</p>
  ${assistentHtml((S.portaalGesprek ??= []), ['Hoeveel moet ik nog betalen en tegen wanneer?', 'Wanneer is de volgende vergadering?'])}</div>`;
UIT.portaalBind = (opnieuw) => bindAssistent(S.portaalGesprek, { portaal: true }, opnieuw);
